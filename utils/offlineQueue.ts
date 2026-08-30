import AsyncStorage from '@react-native-async-storage/async-storage';
import { OFFLINE_QUEUE_KEY } from '@/constants/app';
import { OfflineOperation } from '@/types';

export async function getOfflineQueue() {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as OfflineOperation[];
}

export async function setOfflineQueue(queue: OfflineOperation[]) {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueOfflineOperation(operation: Omit<OfflineOperation, 'id' | 'createdAt'> & { localId?: string }) {
  const queue = await getOfflineQueue();
  const item: OfflineOperation = {
    ...operation,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  await setOfflineQueue([...queue, item]);
  return item;
}

/**
 * An offline-only expense has not reached the server yet. Editing it must amend
 * its queued create operation rather than enqueueing an update for a temporary ID.
 */
export async function updateQueuedCreateOperation(localId: string, payload: OfflineOperation['payload']): Promise<boolean> {
  const queue = await getOfflineQueue();
  const index = queue.findIndex((operation) => operation.type === 'create' && operation.localId === localId);
  if (index < 0) return false;

  const updated = [...queue];
  updated[index] = { ...updated[index], payload: { ...payload, id: undefined } };
  await setOfflineQueue(updated);
  return true;
}

export async function clearOfflineQueue() {
  await setOfflineQueue([]);
}
