import { createClient } from '@supabase/supabase-js';
import './load-maintenance-env';

/**
 * Maintenance: populates the shared exchange_rates table with true historical
 * rates for every distinct (currency, date) actually referenced by live
 * expenses and recurring rules. Also run after audit fixes to warm gaps the
 * (now scheduled) pg_cron job missed.
 *
 * - Source: Frankfurter v1 (keyless, ECB data). Weekends/holidays auto-resolve
 *   to the prior business fix, which matches the client's nearest-prior lookup.
 *   The response's fixing date is VERIFIED to never post-date the request —
 *   the deprecated .app endpoint served its latest quote for future dates,
 *   which is how a stale rate got written under a future date key.
 * - Future dates are never requested: no fixing exists yet; the client uses a
 *   live quote for today/future, and the daily cron job stores the real
 *   fixing once it is published.
 * - Pegged currencies (QAR/AED/SAR) and NPR are deliberately NOT written —
 *   the client hardcodes pegs and derives NPR from INR; stored NPR rows are
 *   explicitly ignored by the resolver.
 * - The service_role key is required: normal clients cannot write this table.
 *
 * Usage: secrets in .env.maintenance (gitignored); run with tsx/node.
 */

const url = process.env.SUPABASE_URL;
// audit run-1: honor the stated invariant — service_role key REQUIRED, and
// fail on read errors instead of warn-skipping into a false 'Nothing to
// backfill.' success report.
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (client keys cannot write exchange_rates).');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

interface RateRow { currency: string; date: string; rate_to_usd: number; source: string }

/** Primary: Frankfurter v1 (ECB). The echoed fixing date must never be AFTER
 *  the requested date (a weekend/holiday fixing BEFORE it is expected and
 *  matches the client's nearest-prior lookup). */
async function fetchFrankfurter(date: string, currency: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=${encodeURIComponent(currency)}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json() as { date?: string; rates?: Record<string, number> };
    if (typeof data.date === 'string' && data.date > date) return null;
    const units = Number(data?.rates?.[currency]);
    return units > 0 ? units : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const PEGGED = new Set(['USD', 'QAR', 'AED', 'SAR', 'NPR']);

/** Second-chance fetch through the keyed exchangerate.host (server-side
 *  credential from .env.maintenance) — audit run-1: the old ".app" first tier
 *  is deprecated and answered future dates with its latest quote; retired. */
async function fetchFrankfurterDev(date: string, currency: string): Promise<number | null> {
  const accessKey = process.env.EXCHANGE_RATE_HOST_ACCESS_KEY;
  if (!accessKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `https://api.exchangerate.host/${date}?base=USD&symbols=${encodeURIComponent(currency)}&access_key=${accessKey}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number> };
    const units = Number(data?.rates?.[currency]);
    return units > 0 ? units : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function collectPairs(): Promise<{ currency: string; date: string }[]> {
  const pairs = new Map<string, { currency: string; date: string }>();

  const tables: Array<{ table: string; dateCol: string; currencyCol: string }> = [
    { table: 'expenses', dateCol: 'date', currencyCol: 'currency' },
    { table: 'recurring_rules', dateCol: 'next_due_date', currencyCol: 'currency' },
  ];

  for (const { table, dateCol, currencyCol } of tables) {
    const { data, error } = await supabase
      .from(table)
      .select(`${currencyCol}, ${dateCol}`);
    if (error) {
      // A table we cannot scan is not "nothing to backfill" — fail loudly
      // (audit run-1: warn-skip + exit 0 reported success on a blind run).
      throw new Error(`Cannot scan ${table}: ${error.message}`);
    }
    for (const row of (data ?? []) as Record<string, string>[]) {
      const currency = String(row[currencyCol] ?? '').toUpperCase();
      const date = String(row[dateCol] ?? '');
      if (!currency || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (PEGGED.has(currency)) continue; // pegs are constants; NPR derives from INR
      // Future dates have no fixing to fetch; requesting them is how the stale
      // future-dated row was created. The daily cron stores the real one.
      if (date > new Date().toISOString().slice(0, 10)) continue;
      pairs.set(`${currency}|${date}`, { currency, date });
    }
  }
  return [...pairs.values()];
}

async function main() {
  const pairs = await collectPairs();
  console.log(`Distinct non-pegged (currency, date) pairs: ${pairs.length}`);
  if (pairs.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const rows: RateRow[] = [];
  let failed = 0;
  for (const { currency, date } of pairs) {
    const units = await fetchFrankfurter(date, currency);
    if (units === null) {
      // Second chance through the keyed exchangerate.host before giving up.
      const alt = await fetchFrankfurterDev(date, currency).catch(() => null);
      if (alt === null) {
        failed += 1;
        console.warn(`  no rate for ${currency} ${date}`);
        continue;
      }
      rows.push({ currency, date, rate_to_usd: Math.round((1 / alt) * 1e8) / 1e8, source: 'exchangerate_host' });
      continue;
    }
    rows.push({ currency, date, rate_to_usd: Math.round((1 / units) * 1e8) / 1e8, source: 'frankfurter' });
  }

  console.log(`Resolved ${rows.length}/${pairs.length} pairs (${failed} missing).`);

  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('exchange_rates')
      .upsert(batch, { onConflict: 'currency,date', ignoreDuplicates: true });
    if (error) {
      console.error(`Batch ${i / CHUNK + 1} failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`  upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  console.log('exchange_rates backfill complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
