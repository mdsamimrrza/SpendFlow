import { createClient } from '@supabase/supabase-js';
import './load-maintenance-env';
import { createExchangeService } from '../services/exchange';

const url = process.env.SUPABASE_URL;
// audit run-1: a cross-tenant maintenance CLI must run ONLY on the
// service-role key. The old '|| SUPABASE_KEY || EXPO_PUBLIC_*' fallback chain
// silently downgraded to a publishable/anon key, which RLS turns into a
// 0-row no-op that still printed "Backfill complete." with exit code 0.
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required — client (EXPO_PUBLIC) keys cannot backfill across tenants.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const exchange = createExchangeService(supabase);

async function backfillTable(table: 'expenses' | 'recurring_rules'): Promise<{ scanned: number; updated: number }> {
  const { data, error } = await supabase
    .from(table)
    .select('id, currency, date')
    .is('exchange_rate_to_usd', null);
  if (error) throw error;
  const rows = data ?? [];
  console.log(`${table}: ${rows.length} rows need a rate snapshot`);
  if (rows.length === 0) return { scanned: 0, updated: 0 };

  const pairs = new Map<string, { currency: string; date: string }>();
  for (const row of rows) {
    pairs.set(`${row.currency}|${row.date}`, { currency: row.currency, date: row.date });
  }

  const rates = new Map<string, number>();
  let resolved = 0;
  for (const [pairKey, pair] of pairs) {
    rates.set(pairKey, await exchange.getRate(pair.currency, pair.date));
    resolved += 1;
    if (resolved % 25 === 0) {
      console.log(`  ${table}: resolved ${resolved}/${pairs.size} unique (currency, date) pairs`);
    }
  }

  let updated = 0;
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const results = await Promise.all(
      batch.map(async (row: { id: string; currency: string; date: string }) => {
        const rate = rates.get(`${row.currency}|${row.date}`);
        if (!rate) return false;
        const { error: updateError } = await supabase
          .from(table)
          .update({ exchange_rate_to_usd: rate, base_currency: 'USD' })
          .eq('id', row.id);
        if (updateError) {
          console.error(`  failed row ${row.id}:`, updateError.message);
          return false;
        }
        return true;
      }),
    );
    updated += results.filter(Boolean).length;
    console.log(`  ${table}: ${Math.min(i + CHUNK, rows.length)}/${rows.length} rows processed`);
  }
  console.log(`${table}: ${updated} rows updated`);
  return { scanned: rows.length, updated };
}

async function main() {
  const a = await backfillTable('expenses');
  const b = await backfillTable('recurring_rules');
  const scanned = a.scanned + b.scanned;
  const updated = a.updated + b.updated;
  // audit run-1: exit status must reflect the writes that actually happened —
  // never report success for a run that scanned work but updated none/partial.
  if (scanned > 0 && updated !== scanned) {
    console.error(`Backfill incomplete: ${updated}/${scanned} rows updated.`);
    process.exit(1);
  }
  console.log(`Backfill complete (${updated} rows updated).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
