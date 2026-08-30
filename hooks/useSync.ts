import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getOfflineQueue, clearOfflineQueue } from '@/utils/offlineQueue';
import { notifyExpensesChanged, removeOfflineEntries } from '@/hooks/useExpenses';
import { EXPENSE_CACHE_KEY } from '@/constants/app';

export function useSync(userId?: string) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const q = await getOfflineQueue();
      setPendingCount(q.length);
      return q.length;
    } catch {
      setPendingCount(0);
      return 0;
    }
  }, []);

  const clearQueue = useCallback(async () => {
    const queue = await getOfflineQueue();
    const localIds = queue.map((op) => op.localId).filter(Boolean) as string[];
    await clearOfflineQueue();
    setPendingCount(0);
    if (localIds.length > 0) {
      await removeOfflineEntries(localIds);
      notifyExpensesChanged();
    }
  }, []);

  const clearAllLocalData = useCallback(async () => {
    // Nuclear option: wipe ALL local expense data and queue
    await Promise.all([
      clearOfflineQueue(),
      AsyncStorage.removeItem(EXPENSE_CACHE_KEY),
      AsyncStorage.removeItem('@spendflow_cached_profile'),
    ]);
    setPendingCount(0);
    notifyExpensesChanged();
  }, []);

  const processQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = await getOfflineQueue();
    if (!queue.length) {
      setPendingCount(0);
      return;
    }

    // Offline transaction creation has been retired. Remove old pending entries
    // so temporary offline IDs can never be sent to Supabase as UUIDs.
    syncingRef.current = true;
    setSyncing(true);
    try {
      const localIds = queue.map((operation) => operation.localId).filter(Boolean) as string[];
      await clearOfflineQueue();
      if (localIds.length > 0) await removeOfflineEntries(localIds);
      setPendingCount(0);
      notifyExpensesChanged();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshCount();

    if (userId) {
      void processQueue();
    }

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(connected);
      if (connected && userId) {
        void processQueue();
      }
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userId) {
        void refreshCount().then((count) => {
          if (count > 0) void processQueue();
        });
      }
    });

    return () => {
      unsubscribeNet();
      appStateSub.remove();
    };
  }, [processQueue, refreshCount, userId]);

  return useMemo(
    () => ({ isOnline, pendingCount, syncing, refreshCount, processQueue, clearQueue, clearAllLocalData }),
    [isOnline, pendingCount, processQueue, refreshCount, syncing, clearQueue, clearAllLocalData],
  );
}
