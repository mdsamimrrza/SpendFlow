import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listCategories } from '@/services/categories';
import { createExpense, filterAndSortCachedExpenses, getCachedExpenses, listExpenses, softDeleteExpense, updateExpense } from '@/services/expenses';
import { checkAndNotifyBudgetThreshold, checkAndNotifyCategoryBudgetThreshold, notifyExpenseAdded, notifyLargeExpense } from '@/services/notifications';
import { EXPENSE_CACHE_KEY } from '@/constants/app';
import { Expense, ExpenseFilters, ExpenseInput, SortKey } from '@/types';
import { currentMonthRange, sumExpenses } from '@/utils/format';
import { notifyOtherDevices } from '@/services/pushNotifications';

type ExpenseChangeListener = () => void;
const listeners = new Set<ExpenseChangeListener>();

export function notifyExpensesChanged() {
  listeners.forEach((listener) => listener());
}

/**
 * Synchronously removes offline entries from AsyncStorage cache
 * Returns a promise that resolves when cleanup is complete
 */
export async function removeOfflineEntries(localIds: string[]): Promise<void> {
  if (localIds.length === 0) return;
  try {
    const raw = await AsyncStorage.getItem(EXPENSE_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Expense[];
    const cleaned = parsed.filter((e) => !localIds.includes(e.id));
    await AsyncStorage.setItem(EXPENSE_CACHE_KEY, JSON.stringify(cleaned));
  } catch {
    // Ignore cache cleanup errors
  }
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

/** Cycle-aware month start day for non-React code (default 1 = calendar month). */
async function getCycleStartDay(userId?: string): Promise<number> {
  try {
    if (userId) {
      const raw = await AsyncStorage.getItem(`@spendflow_cycle_start_day_${userId}`);
      const day = Number(raw);
      if (day >= 2 && day <= 28) return day;
    }
    const profileJson = await AsyncStorage.getItem('@spendflow_cached_profile');
    if (profileJson) {
      const day = Number(JSON.parse(profileJson)?.cycle_start_day);
      if (day >= 2 && day <= 28) return day;
    }
  } catch {
    // Ignore cache parse error
  }
  return 1;
}

/** Cycle-aware month end day for non-React code (default null = dynamic). */
async function getCycleEndDay(userId?: string): Promise<number | null> {
  try {
    if (userId) {
      const endRaw = await AsyncStorage.getItem(`@spendflow_cycle_end_day_${userId}`);
      const endDay = Number(endRaw);
      if (endDay >= 1 && endDay <= 31) return endDay;
    }
    const profileJson = await AsyncStorage.getItem('@spendflow_cached_profile');
    if (profileJson) {
      const endDay = Number(JSON.parse(profileJson)?.cycle_end_day);
      if (endDay >= 1 && endDay <= 31) return endDay;
    }
  } catch {
    // Ignore cache parse error
  }
  return null;
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

    const month = currentMonthRange(
      await getCycleStartDay(userId),
      await getCycleEndDay(userId),
    );
    const monthItems = currentItems.filter((item) => item.date >= month.from && item.date <= month.to);
    const monthTotal = sumExpenses(monthItems, currency);
    const monthlyBudget = await getEffectiveMonthlyBudget(userId);

    if (monthlyBudget > 0) {
      void checkAndNotifyBudgetThreshold(monthTotal + amount, monthlyBudget, currency);
    }

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
  const lastLoadedAt = useRef(0);

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

      // Paint instantly from the local cache on first load so the UI never
      // stares at an empty screen while the network round trip completes.
      if (pageToLoad === 0) {
        try {
          const cached = await getCachedExpenses();
          const cachedForUser = cached.filter((e) => e.user_id === userId && !e.deleted_at);
          // Apply the active filters/sort locally so the instant paint matches
          // what the server response will show (no flash of unfiltered data).
          const painted = filterAndSortCachedExpenses(cachedForUser, filters, sort);
          if (painted.length) {
            setItems((current) => (current.length > 0 ? current : painted));
            setLoading(false);
          }
        } catch {
          // Best-effort hydration; the network fetch below still runs
        }
      }

      try {
        const pageData = await listExpenses(userId, pageToLoad, filters, sort);
        // Always replace on page 0 (fresh fetch), append on subsequent pages
        setItems((current) => (replace || pageToLoad === 0 ? pageData.items : [...current, ...pageData.items]));
        setHasMore(pageData.hasMore);
        setPage(pageToLoad);
        if (pageToLoad === 0) lastLoadedAt.current = Date.now();
      } catch (err) {
        // Only fall back to cache on initial load (page 0)
        if (pageToLoad === 0) {
          const cached = await getCachedExpenses();
          if (cached.length) setItems(cached);
        }
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

  const refresh = useCallback(async (force = false) => {
    if (loadingPage.current) return;
    // Tab-focus refreshes reuse data fetched moments ago so switching tabs is
    // instant; pull-to-refresh and explicit callers pass force = true.
    if (!force && Date.now() - lastLoadedAt.current < 30_000) return;
    setRefreshing(true);
    await loadPage(0, true);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore) return;
    await loadPage(page + 1);
  }, [hasMore, loadPage, loading, loadingMore, page]);

  const save = useCallback(async (input: ExpenseInput, id?: string) => {
    if (!userId) throw new Error('No user found.');
    if (id) await updateExpense(id, input);
    else {
      await createExpense(userId, input);
      // Fire-and-forget: alert the user's OTHER signed-in devices about this new entry
      const isIncomeEntry = (input.type || 'expense') === 'income';
      void notifyOtherDevices({
        userId,
        title: isIncomeEntry ? '💰 New Income Added' : '💸 New Expense Added',
        body: `${input.currency} ${Number(input.amount).toLocaleString()}${input.description ? ` · ${input.description}` : ''}`,
        data: { kind: 'transaction', type: input.type ?? 'expense', amount: Number(input.amount) },
      });
    }
    notifyExpensesChanged();
    if ((input.type || 'expense') === 'expense') {
      void triggerExpenseNotifications(userId, Number(input.amount), input.category_id, input.description, input.currency, items);
    }
  }, [userId, items, loadPage]);

  const remove = useCallback(async (id: string) => {
    await softDeleteExpense(id);
    setItems((current) => current.filter((item) => item.id !== id));
    notifyExpensesChanged();
  }, []);

  return useMemo(
    () => ({ items, loading, loadingMore, refreshing, error, hasMore, refresh, loadMore, save, remove }),
    [error, hasMore, items, loadMore, loading, loadingMore, refresh, refreshing, remove, save],
  );
}
