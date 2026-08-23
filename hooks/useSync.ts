import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { createExpense, softDeleteExpense, updateExpense } from '@/services/expenses';
import { getOfflineQueue, setOfflineQueue } from '@/utils/offlineQueue';

export function useSync(userId?: string) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refreshCount() {
    setPendingCount((await getOfflineQueue()).length);
  }

  async function processQueue() {
    if (!userId || syncing) return;
    const queue = await getOfflineQueue();
    if (!queue.length) {
      setPendingCount(0);
      return;
    }
    setSyncing(true);
    const remaining = [...queue];
    try {
      while (remaining.length) {
        const operation = remaining[0];
        if (operation.type === 'create') await createExpense(userId, operation.payload);
        if (operation.type === 'update' && operation.payload.id) await updateExpense(operation.payload.id, operation.payload);
        if (operation.type === 'delete' && operation.payload.id) await softDeleteExpense(operation.payload.id);
        remaining.shift();
        await setOfflineQueue(remaining);
      }
      setPendingCount(0);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    refreshCount().catch(() => setPendingCount(0));
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(connected);
      if (connected) processQueue().catch(() => undefined);
    });
    return unsubscribe;
  }, [userId]);

  return { isOnline, pendingCount, syncing, refreshCount, processQueue };
}
