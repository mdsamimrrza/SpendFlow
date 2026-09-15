import { listCategories } from '@/services/categories';
import { listExpenses } from '@/services/expenses';
import { isoDate } from '@/utils/format';

let inFlight: Promise<void> | null = null;

/**
 * Fire-and-forget warm-up that runs DURING login — while the login screen is
 * still up — so the dashboard's first mount finds hot caches instead of
 * staging data in one by one.
 *
 * The expense query covers two calendar months back → today, unbounded — wide
 * enough to contain the dashboard's cycle window for ANY cycle_start_day. `listExpenses` page 0 writes
 * the full result to the `@spendflow_expense_cache_<uid>` key that the
 * instant cache-paint in `useExpenses` reads, so by the time the tabs mount
 * the hero card / chart / breakdown paint real data immediately. The wide
 * window also covers custom-cycle users; the cache-paint filters client-side
 * so extra rows are harmless.
 *
 * Deliberately does NOT call `notifyExpensesChanged()` — that would trigger a
 * duplicate full reload when the dashboard is already fetching.
 */
export function prefetchAfterLogin(userId: string): void {
  if (!userId || inFlight) return;
  inFlight = (async () => {
    const now = new Date();
    // Two calendar months back: a custom cycle start late in the month (day
    // 22–31) pushes the dashboard's `month.previousFrom` further back than one
    // calendar month (e.g. cycle day 25 on Sep 13 → previousFrom Jul 25). The
    // cache-paint filters client-side, so the extra cached rows are harmless.
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    await Promise.all([
      listExpenses(
        userId,
        0,
        { fromDate: isoDate(windowStart), toDate: isoDate(now), fetchAll: true },
        'date_desc',
      ),
      listCategories(userId),
    ]);
  })()
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
}
