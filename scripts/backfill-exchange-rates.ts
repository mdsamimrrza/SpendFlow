import { createClient } from '@supabase/supabase-js';
import { createExchangeService } from '../services/exchange';

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY) before running.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const exchange = createExchangeService(supabase);

async function backfillTable(table: 'expenses' | 'recurring_rules') {
  const { data, error } = await supabase
    .from(table)
    .select('id, currency, date')
    .is('exchange_rate_to_usd', null);
  if (error) throw error;
  const rows = data ?? [];
  console.log(`${table}: ${rows.length} rows need a rate snapshot`);
  if (rows.length === 0) return;

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
}

async function main() {
  await backfillTable('expenses');
  await backfillTable('recurring_rules');
  console.log('Backfill complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
