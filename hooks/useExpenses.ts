import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Expense, ExpenseFilters, ExpenseInput, SortKey } from '@/types';
import { enqueueOfflineOperation } from '@/utils/offlineQueue';
import { createExpense, getCachedExpenses, listExpenses, softDeleteExpense, updateExpense } from '@/services/expenses';

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
      if (!userId) return;
      if (loadingPage.current) return;
      loadingPage.current = true;
      setError(null);
      if (pageToLoad === 0) setLoading(true);
      else setLoadingMore(true);
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
      await refresh();
      return;
    }
    if (id) await updateExpense(id, input);
    else await createExpense(userId, input);
    await refresh();
  };

  const remove = async (id: string) => {
    const state = await NetInfo.fetch();
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (!online) {
      await enqueueOfflineOperation({
        type: 'delete',
        payload: { id, amount: 1, category_id: '', currency: 'NPR', date: new Date().toISOString().slice(0, 10), payment_method: 'Cash' },
      });
      setItems((current) => current.filter((item) => item.id !== id));
      return;
    }
    await softDeleteExpense(id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return { items, loading, loadingMore, refreshing, error, hasMore, refresh, loadMore, save, remove };
}
