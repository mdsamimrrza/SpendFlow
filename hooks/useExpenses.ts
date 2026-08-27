import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listCategories } from '@/services/categories';
import { createExpense, getCachedExpenses, listExpenses, softDeleteExpense, updateExpense } from '@/services/expenses';
import { checkAndNotifyBudgetThreshold, checkAndNotifyCategoryBudgetThreshold, notifyExpenseAdded, notifyLargeExpense } from '@/services/notifications';
import { EXPENSE_CACHE_KEY } from '@/constants/app';
import { Expense, ExpenseFilters, ExpenseInput, SortKey } from '@/types';
import { currentMonthRange, sumExpenses } from '@/utils/format';
import { enqueueOfflineOperation } from '@/utils/offlineQueue';

type ExpenseChangeListener = () => void;
const listeners = new Set<ExpenseChangeListener>();

function notifyExpensesChanged() {
  listeners.forEach((listener) => listener());
}

async function getEffectiveMonthlyBudget(userId?: string): Promise<number> {
  try {
    const profileJson = await AsyncStorage.getItem('@spendflow_cached_profile');
    if (profileJson) {
      const parsed = JSON.parse(profileJson);
      if (parsed?.monthly_budget && Number(parsed.monthly_budget) > 0) {
        return Number(parsed.monthly_budget);
      }
    }
    if (userId) {
      const directBudget = await AsyncStorage.getItem(`@spendflow_monthly_budget_${userId}`);
      if (directBudget && Number(directBudget) > 0) {
        return Number(directBudget);
      }
    }
  } catch {
    // Ignore cache parse error
  }
  return 0;
}

async function triggerExpenseNotifications(
  userId: string | undefined,
  amount: number,
  categoryId?: string | null,
  description?: string | null,
  currency = 'NPR',
  currentItems: Expense[] = [],
) {
  try {
    void notifyExpenseAdded(amount, categoryId, description, currency);
    void notifyLargeExpense(amount, categoryId, currency);

    const month = currentMonthRange();
    const monthItems = currentItems.filter((item) => item.date >= month.from && item.date <= month.to);
    const monthTotal = sumExpenses(monthItems, currency);
    const monthlyBudget = await getEffectiveMonthlyBudget(userId);

    // 1. Global Monthly Budget alerts
    if (monthlyBudget > 0) {
      void checkAndNotifyBudgetThreshold(monthTotal + amount, monthlyBudget, currency);
    }

    // 2. Category Budget alerts (Strictly 90% and 100% only)
    if (userId && categoryId) {
      const categories = await listCategories(userId);
      const targetCat = categories.find((c) => c.id === categoryId);
      if (targetCat && targetCat.budget_monthly && Number(targetCat.budget_monthly) > 0) {
        const catMonthItems = monthItems.filter((item) => item.category_id === categoryId);
        const catMonthTotal = sumExpenses(catMonthItems, currency);
        void checkAndNotifyCategoryBudgetThreshold(
          targetCat.id,
          targetCat.name,
          targetCat.icon,
          catMonthTotal + amount,
          Number(targetCat.budget_monthly),
          currency,
        );
      }
    }
  } catch {
    // Ignore background notification check errors
  }
}

export function useExpenses(userId?: string, filters?: ExpenseFilters, sort: SortKey = 'date_desc') {
  const filterKey = JSON.stringify(filters ?? {});
  const [items, setItems] = useState<Expense[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingPage = useRef(false);

  const loadPage = useCallback(
    async (pageToLoad = 0, replace = false) => {
      if (!userId) {
        setLoading(false);
        return;
      }
      loadingPage.current = true;
      setError(null);
      if (pageToLoad === 0 && !replace) setRefreshing(true);
      else if (pageToLoad > 0) setLoadingMore(true);
      else setLoading(true);

      try {
        const pageData = await listExpenses(userId, pageToLoad, filters, sort);
        setItems((current) => (replace || pageToLoad === 0 ? pageData.items : [...current, ...pageData.items]));
        setHasMore(pageData.hasMore);
        setPage(pageToLoad);
      } catch (err) {
        const cached = await getCachedExpenses();
        if (cached.length && pageToLoad === 0) setItems(cached);
        setError(err instanceof Error ? err.message : 'Could not load expenses.');
      } finally {
        loadingPage.current = false;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [filterKey, sort, userId],
  );

  useEffect(() => {
    void loadPage(0, true);
  }, [filterKey, sort, userId]);

  useEffect(() => {
    const handleChanged = () => {
      void loadPage(0, true);
    };
    listeners.add(handleChanged);
    return () => {
      listeners.delete(handleChanged);
    };
  }, [loadPage]);

  const refresh = useCallback(async () => {
    if (loadingPage.current) return;
    setRefreshing(true);
    await loadPage(0, true);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore) return;
    await loadPage(page + 1);
  }, [hasMore, loadPage, loading, loadingMore, page]);

  const save = async (input: ExpenseInput, id?: string) => {
    if (!userId) throw new Error('No user found.');
    const state = await NetInfo.fetch();
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);

    const saveLocally = async () => {
      await enqueueOfflineOperation({ type: id ? 'update' : 'create', payload: { ...input, id } });
      const localId = id || `offline-${Date.now()}`;
      const localExpense: Expense = {
        id: localId,
        user_id: userId,
        amount: Number(input.amount),
        currency: input.currency,
        date: input.date,
        time: input.time || '12:00:00',
        payment_method: input.payment_method,
        description: input.description || null,
        notes: input.notes || null,
        receipt_image_url: input.receipt_image_url || null,
        category_id: input.category_id,
        is_recurring: false,
        recurring_rule_id: null,
        is_synced: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setItems((current) => {
        const next = id ? current.map((item) => (item.id === id ? localExpense : item)) : [localExpense, ...current];
        void AsyncStorage.setItem(EXPENSE_CACHE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });

      notifyExpensesChanged();
      void triggerExpenseNotifications(userId, Number(input.amount), input.category_id, input.description, input.currency, items);
    };

    if (!online) {
      await saveLocally();
      return;
    }

    try {
      if (id) await updateExpense(id, input);
      else await createExpense(userId, input);
      notifyExpensesChanged();
      void triggerExpenseNotifications(userId, Number(input.amount), input.category_id, input.description, input.currency, items);
    } catch (err) {
      // Cloud insert failed -> fallback seamlessly to local storage
      await saveLocally();
    }
  };

  const remove = useCallback(async (id: string) => {
    const state = await NetInfo.fetch();
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (!online) {
      await enqueueOfflineOperation({
        type: 'delete',
        payload: { id, amount: 1, category_id: '', currency: 'NPR', date: new Date().toISOString().slice(0, 10), payment_method: 'Cash' },
      });
      setItems((current) => current.filter((item) => item.id !== id));
      notifyExpensesChanged();
      return;
    }
    await softDeleteExpense(id);
    setItems((current) => current.filter((item) => item.id !== id));
    notifyExpensesChanged();
  }, []);

  return useMemo(
    () => ({ items, loading, loadingMore, refreshing, error, hasMore, refresh, loadMore, save, remove }),
    [error, hasMore, items, loadMore, loading, loadingMore, refresh, refreshing, remove, save],
  );
}
