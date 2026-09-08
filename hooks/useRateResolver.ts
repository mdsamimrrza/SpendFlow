import { useEffect, useState } from 'react';
import { buildRateResolver, type RateResolver } from '@/services/exchange';
import type { SnapshotRow } from '@/services/exchange';

/**
 * Resolves transaction amounts with their frozen rate snapshots.  Consumers
 * deliberately receive no live-rate fallback while the resolver is loading.
 */
export function useRateResolver(rows: SnapshotRow[], targetCurrency: string): RateResolver | null {
  const [resolver, setResolver] = useState<RateResolver | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolver(null);
    buildRateResolver(rows, targetCurrency)
      .then((next) => {
        if (!cancelled) setResolver(next);
      })
      .catch(() => {
        if (!cancelled) setResolver(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rows, targetCurrency]);

  return resolver;
}
