import { useCallback, useEffect, useMemo, useState } from 'react';
import { createTransfer, deleteTransfer, getCachedTransfers, listTransfers } from '@/services/transfers';
import { Transfer, TransferInput } from '@/types';

type TransferChangeListener = () => void;
const listeners = new Set<TransferChangeListener>();

export function notifyTransfersChanged() {
  listeners.forEach((listener) => listener());
}

/**
 * Loads the user's transfers (cache-painted, then authoritative). Re-fetches
 * whenever any code calls notifyTransfersChanged() — e.g. after a transfer is
 * created on the transfer screen — so the Accounts screen stays current.
 */
export function useTransfers(userId?: string) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (useCacheFirst = true) => {
      if (!userId) {
        setLoading(false);
        return;
      }
      if (useCacheFirst) {
        try {
          const cached = await getCachedTransfers(userId);
          if (cached.length) {
            setTransfers((current) => (current.length > 0 ? current : cached));
            setLoading(false);
          }
        } catch {
          // Best-effort hydration; the network fetch below still runs
        }
      }
      try {
        const fresh = await listTransfers(userId);
        setTransfers(fresh);
      } catch (err) {
        console.warn('Failed to load transfers:', err);
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleChange = () => {
      void load(false);
    };
    listeners.add(handleChange);
    return () => {
      listeners.delete(handleChange);
    };
  }, [load]);

  const save = useCallback(
    async (input: TransferInput) => {
      if (!userId) throw new Error('No user found.');
      const created = await createTransfer(userId, input);
      setTransfers((current) => [created, ...current]);
      notifyTransfersChanged();
      return created;
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    await load(false);
  }, [load]);

  const remove = useCallback(
    async (id: string) => {
      await deleteTransfer(id, userId ?? '');
      setTransfers((current) => current.filter((t) => t.id !== id));
      notifyTransfersChanged();
    },
    [userId],
  );

  return useMemo(
    () => ({ transfers, loading, save, remove, refresh }),
    [loading, refresh, remove, save, transfers],
  );
}
