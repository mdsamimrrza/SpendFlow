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

export async function enqueueOfflineOperation(operation: Omit<OfflineOperation, 'id' | 'createdAt'>) {
  const queue = await getOfflineQueue();
  const item: OfflineOperation = {
    ...operation,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  await setOfflineQueue([...queue, item]);
  return item;
}
