import { useCallback, useEffect, useRef, useState } from 'react';
import { buildRateResolver, type RateResolver, getRate } from '@/services/exchange';
import type { SnapshotRow } from '@/services/exchange';
import { isoDate } from '@/utils/format';

export interface RateResolverState {
  resolver: RateResolver | null;
  /** True after the FIRST settle (success or failure) — never resets on later
   *  signature rebuilds, so fresh data never re-skeletons the UI. Offline
   *  builds fail → ready still becomes true → callers render fallbacks. */
  ready: boolean;
  /** Converts one transaction at its own transaction date (row snapshot first,
   *  never today's rate) into the hook's target currency; 0 while the resolver
   *  has not settled. History & Analytics hand-rolled byte-identical copies of
   *  this — this is now THE implementation. */
  convertAtDate: (row: { amount: number | string; currency?: string | null; date: string }) => number;
  /** "At today's rate" counterpart: same amount priced through TODAY's live cross
   *  on BOTH sides (brokerage market-value pattern). Returns null while rates
   *  are unresolved so callers can hide the line entirely instead of showing a
   *  wrong "today" figure. Mirrors web's useRowConverter.convertToday —
   *  SYNCHRONOUS because today's rates are pre-fetched into the resolver's cache. */
  convertToday: (row: { amount: number | string; currency?: string | null; date: string }) => number | null;
}

/**
 * Resolves transaction amounts with their frozen rate snapshots.  Consumers
 * deliberately receive no live-rate fallback while the resolver is loading.
 */
export function useRateResolver(rows: SnapshotRow[], targetCurrency: string): RateResolverState {
  const [resolver, setResolver] = useState<RateResolver | null>(null);
  const [ready, setReady] = useState(false);
  const everReadyRef = useRef(false);

  // buildRateResolver reads only currency/date/snapshot per row, so that
  // content — not the array identity — determines the resolver.  Keying the
  // rebuild on this signature keeps callers that pass inline literals
  // (`[] as Expense[]`) or unmemoized filters from looping setState.
  const signature = `${(targetCurrency || 'USD').toUpperCase()}#${rows
    .map((row) => `${(row.currency || 'USD').toUpperCase()}|${row.date}|${Number(row.exchange_rate_to_usd) || 0}`)
    .join(';')}`;

  useEffect(() => {
    let cancelled = false;
    const settle = (next: RateResolver | null) => {
      if (cancelled) return;
      setResolver(next);
      if (!everReadyRef.current) {
        everReadyRef.current = true;
        setReady(true);
      }
    };
    buildRateResolver(rows, targetCurrency)
      .then(settle)
      .catch(() => settle(null));
    return () => {
      cancelled = true;
    };
  }, [signature]);

  const convertAtDate = useCallback(
    (row: { amount: number | string; currency?: string | null; date: string }) =>
      resolver
        ? resolver.convert(Number(row.amount), row.currency || 'NPR', targetCurrency, row.date)
        : 0,
    [resolver, targetCurrency],
  );

  // "At today's rate" conversion: both sides of the cross resolve at TODAY's live
  // rate (never the stored snapshot). Returns null while rates are unresolved so
  // callers can hide the line entirely instead of showing a wrong "today" figure.
  // Mirrors web's useRowConverter.convertToday — SYNCHRONOUS because today's rates
  // are pre-fetched and cached inside the RateResolver via buildRateResolver.
  const convertToday = useCallback(
    (row: { amount: number | string; currency?: string | null; date: string }) => {
      if (!resolver) return null;
      const amount = Number(row.amount);
      const from = (row.currency || 'NPR').toUpperCase();
      const to = (targetCurrency || 'NPR').toUpperCase();
      if (!amount || from === to) return amount;
      try {
        // RateResolver.convert uses its internal cache (which includes today's rates
        // pre-fetched by buildRateResolver for every currency pair in the dataset)
        return Math.round(resolver.convert(amount, from, to, isoDate()) * 100) / 100;
      } catch {
        return null;
      }
    },
    [resolver, targetCurrency],
  );

  return { resolver, ready, convertAtDate, convertToday };
}
