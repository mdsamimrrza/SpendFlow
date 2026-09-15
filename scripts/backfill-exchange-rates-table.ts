import { createClient } from '@supabase/supabase-js';
import './load-maintenance-env';

/**
 * One-time maintenance: populates the empty exchange_rates table with true
 * historical rates for every distinct (currency, date) actually referenced by
 * live expenses and recurring rules.
 *
 * - Source: Frankfurter (keyless, ECB data). Weekends/holidays auto-resolve to
 *   the prior business fix, which matches the client's nearest-prior lookup.
 * - Pegged currencies (QAR/AED/SAR) and NPR are deliberately NOT written —
 *   the client hardcodes pegs and derives NPR from INR; stored NPR rows are
 *   explicitly ignored by the resolver.
 * - The service_role key is required: normal clients cannot write this table.
 *
 * Usage: secrets in .env.maintenance (gitignored); run with tsx/node.
 */

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or service_role key in environment.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

interface RateRow { currency: string; date: string; rate_to_usd: number; source: string }

async function fetchFrankfurter(date: string, currency: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `https://api.frankfurter.app/${date}?from=USD&to=${encodeURIComponent(currency)}`,
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

const PEGGED = new Set(['USD', 'QAR', 'AED', 'SAR', 'NPR']);

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
      console.warn(`Skipping ${table}: ${error.message}`);
      continue;
    }
    for (const row of (data ?? []) as Record<string, string>[]) {
      const currency = String(row[currencyCol] ?? '').toUpperCase();
      const date = String(row[dateCol] ?? '');
      if (!currency || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (PEGGED.has(currency)) continue; // pegs are constants; NPR derives from INR
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
      // Second chance through the .dev mirror before giving up on this pair.
      const alt = await fetchFrankfurter(date, currency).catch(() => null);
      if (alt === null) {
        failed += 1;
        console.warn(`  no rate for ${currency} ${date}`);
        continue;
      }
      rows.push({ currency, date, rate_to_usd: Math.round((1 / alt) * 1e8) / 1e8, source: 'frankfurter_dev' });
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
