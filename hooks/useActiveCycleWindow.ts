import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { currentMonthRange, getNormalizedCycle } from '@/utils/format';
import type { ActiveRateWindow } from '@/services/exchange';

/**
 * The user's currently ACTIVE financial cycle window (local YYYY-MM-DD).
 * Single source for the live-rate rule: transactions dated inside this window
 * are displayed at TODAY's live exchange rate (active month = live
 * everywhere); anything dated before it — even one day before the cycle
 * start — stays frozen at its transaction-date rate (closed period = history).
 * Memoized on the cycle fields, so it never recomputes per render.
 */
export function useActiveCycleWindow(): ActiveRateWindow {
  const { profile } = useAuth();
  return useMemo(() => {
    const { startDay, endDay } = getNormalizedCycle(profile);
    const range = currentMonthRange(startDay, endDay);
    return { from: range.from, to: range.to };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.cycle_start_day, profile?.cycle_end_day]);
}
