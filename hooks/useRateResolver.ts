import { useCallback, useEffect, useRef, useState } from 'react';
import { buildRateResolver, type RateResolver, type SnapshotRow } from '@/services/exchange';
import { useActiveCycleWindow } from '@/hooks/useActiveCycleWindow';
import { isoDate } from '@/utils/format';

export interface RateResolverState {
  resolver: RateResolver | null;
  /** True after the FIRST settle (success or failure) — never resets on later
   *  signature rebuilds, so fresh data never re-skeletons the UI. Offline
   *  builds fail → ready still becomes true → callers render fallbacks. */
  ready: boolean;
  /** Converts one transaction for DISPLAY: rows inside the ACTIVE financial
   *  cycle price at TODAY's live rate (active month = live everywhere); rows
   *  before the cycle start stay frozen at their transaction-date rate.
   *  0 while the resolver has not settled. */
  convertAtDate: (row: { amount: number | string; currency?: string | null; date: string }) => number;
  /** ALWAYS the transaction-date basis (never today's rate) — used by the
   *  "At transaction-date rates" debugger line to cross-check the live
   *  headline against the frozen historical value. */
  convertFrozen: (row: { amount: number | string; currency?: string | null; date: string }) => number;
  /** Explicit today-only conversion (both sides at today's live cross).
   *  Returns null while rates are unresolved so callers can hide the line
   *  entirely instead of showing a wrong "today" figure. SYNCHRONOUS because
   *  today's rates are pre-fetched into the resolver's cache. */
  convertToday: (row: { amount: number | string; currency?: string | null; date: string }) => number | null;
}

/**
 * Resolves transaction amounts for display. The ACTIVE financial cycle window
 * (from the user's profile) is applied centrally here: in-window rows price at
 * today's live rate, everything before the window stays frozen — so every
 * consumer (Dashboard, History, Analytics, P&L, charts, budget cards) shows
 * the same basis without any per-screen formulas.
 */
export function useRateResolver(rows: SnapshotRow[], targetCurrency: string): RateResolverState {
  const activeWindow = useActiveCycleWindow();
  const [resolver, setResolver] = useState<RateResolver | null>(null);
  const [ready, setReady] = useState(false);
  const everReadyRef = useRef(false);

  // buildRateResolver reads only currency/date/snapshot per row, so that
  // content — not the array identity — determines the resolver.  Keying the
  // rebuild on this signature keeps callers that pass inline literals
  // (`[] as Expense[]`) or unmemoized filters from looping setState. The
  // window and today's date are part of the signature: the live-rate rule
  // re-resolves when the cycle changes or the day rolls over.
  const windowKey = `${activeWindow.from}#${activeWindow.to}`;
  const signature = `${(targetCurrency || 'USD').toUpperCase()}#${windowKey}#${isoDate()}#${rows
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
    buildRateResolver(rows, targetCurrency, { activeWindow })
      .then(settle)
      .catch(() => settle(null));
    return () => {
      cancelled = true;
    };
  }, [signature]);

  const convert = useCallback(
    (row: { amount: number | string; currency?: string | null; date: string }, basis: 'auto' | 'frozen') =>
      resolver
        ? resolver.convert(Number(row.amount), row.currency || 'NPR', targetCurrency, row.date, basis)
        : 0,
    [resolver, targetCurrency],
  );

  const convertAtDate = useCallback(
    (row: { amount: number | string; currency?: string | null; date: string }) => convert(row, 'auto'),
    [convert],
  );

  const convertFrozen = useCallback(
    (row: { amount: number | string; currency?: string | null; date: string }) => convert(row, 'frozen'),
    [convert],
  );

  // "At today's rate" conversion: both sides of the cross resolve at TODAY's live
  // rate (never the stored snapshot). Returns null while rates are unresolved so
  // callers can hide the line entirely instead of showing a wrong "today" figure.
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

  return { resolver, ready, convertAtDate, convertFrozen, convertToday };
}
