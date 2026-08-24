import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createExpense, getCachedExpenses, listExpenses, softDeleteExpense, updateExpense } from '@/services/expenses';
import { checkAndNotifyBudgetThreshold, notifyExpenseAdded, notifyLargeExpense } from '@/services/notifications';
import { EXPENSE_CACHE_KEY } from '@/constants/app';
import { Expense, ExpenseFilters, ExpenseInput, SortKey } from '@/types';
import { currentMonthRange, sumExpenses } from '@/utils/format';
import { enqueueOfflineOperation } from '@/utils/offlineQueue';

type ExpenseChangeListener = () => void;
const listeners = new Set<ExpenseChangeListener>();

export function notifyExpensesChanged() {
  listeners.forEach((listener) => listener());
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
      if (loadingPage.current) return;
      loadingPage.current = true;
      setError(null);
      if (pageToLoad === 0) {
        setItems((current) => {
          if (!current.length) setLoading(true);
          return current;
        });
      } else {
        setLoadingMore(true);
      }
      try {
        const result = await listExpenses(userId, pageToLoad, filters, sort);
        setItems((current) => (replace ? result.items : [...current, ...result.items]));
        setHasMore(result.hasMore);
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
    if (!online) {
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
      try {
        void notifyExpenseAdded(Number(input.amount), input.category_id || 'Expense', input.description, input.currency);
      } catch {
        // Notification check
      }
      return;
    }
    if (id) await updateExpense(id, input);
    else await createExpense(userId, input);
    notifyExpensesChanged();
    // Trigger Smart Notification Checks in Background
    try {
      void notifyExpenseAdded(Number(input.amount), input.category_id || 'Expense', input.description, input.currency);
      void notifyLargeExpense(Number(input.amount), input.category_id || 'Expense', input.currency);
      const month = currentMonthRange();
      const monthItems = items.filter((item) => item.date >= month.from && item.date <= month.to);
      const monthTotal = sumExpenses(monthItems, input.currency);
      const monthlyBudgetRaw = await AsyncStorage.getItem(`@spendflow_monthly_budget_${userId}`);
      const monthlyBudget = monthlyBudgetRaw ? Number(monthlyBudgetRaw) : 0;
      if (monthlyBudget > 0) {
        void checkAndNotifyBudgetThreshold(monthTotal + Number(input.amount), monthlyBudget, input.currency);
      }
    } catch {
      // Ignore background notification check errors
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
