import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createExpense, softDeleteExpense, updateExpense } from '@/services/expenses';
import { getOfflineQueue, setOfflineQueue } from '@/utils/offlineQueue';

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

  const processQueue = useCallback(async () => {
    if (!userId || syncingRef.current) return;
    const queue = await getOfflineQueue();
    if (!queue.length) {
      setPendingCount(0);
      return;
    }

    syncingRef.current = true;
    setSyncing(true);

    const remaining = [...queue];
    try {
      while (remaining.length) {
        const operation = remaining[0];
        try {
          if (operation.type === 'create') await createExpense(userId, operation.payload);
          if (operation.type === 'update' && operation.payload.id) await updateExpense(operation.payload.id, operation.payload);
          if (operation.type === 'delete' && operation.payload.id) await softDeleteExpense(operation.payload.id);
        } catch (opErr) {
          console.warn('[Sync] Offline op failed:', opErr);
        }
        remaining.shift();
        await setOfflineQueue(remaining);
        setPendingCount(remaining.length);
      }
      setPendingCount(0);
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
    () => ({ isOnline, pendingCount, syncing, refreshCount, processQueue }),
    [isOnline, pendingCount, processQueue, refreshCount, syncing],
  );
}
