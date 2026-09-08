import { createClient } from '@supabase/supabase-js';
import { createExchangeService } from '../services/exchange';

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this one-time backfill.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const exchange = createExchangeService(supabase);
const round2 = (value: number) => Math.round(value * 100) / 100;
const dryRun = process.argv.includes('--dry-run');

type BackfillReport = { scanned: number; eligible: number; updated: number; skipped: number };

async function updateNprSnapshots(table: 'expenses' | 'recurring_rules', dateColumn: 'date' | 'next_due_date') {
  const { data, error } = await supabase
    .from(table)
    .select(`id, ${dateColumn}`)
    .eq('currency', 'NPR');
  if (error) throw error;

  const report: BackfillReport = { scanned: (data ?? []).length, eligible: 0, updated: 0, skipped: 0 };
  for (const row of data ?? []) {
    const date = String(row[dateColumn]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      report.skipped += 1;
      continue;
    }
    report.eligible += 1;
    const rate = await exchange.getRate('NPR', date);
    if (dryRun) continue;
    const { error: updateError } = await supabase
      .from(table)
      .update({ exchange_rate_to_usd: rate, base_currency: 'USD' })
      .eq('id', row.id);
    if (updateError) throw updateError;
    report.updated += 1;
  }
  console.log(`${table}:`, report);
  return report;
}

async function updateNprTransfers() {
  const { data, error } = await supabase
    .from('transfers')
    .select('id, amount, from_currency, to_currency, date')
    .or('from_currency.eq.NPR,to_currency.eq.NPR');
  if (error) throw error;

  const report: BackfillReport = { scanned: (data ?? []).length, eligible: 0, updated: 0, skipped: 0 };
  for (const transfer of data ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(transfer.date))) {
      report.skipped += 1;
      continue;
    }
    report.eligible += 1;
    const fromRate = await exchange.getRate(transfer.from_currency, transfer.date);
    const toRate = await exchange.getRate(transfer.to_currency, transfer.date);
    const exchangeRate = fromRate / toRate;
    if (dryRun) continue;
    const { error: updateError } = await supabase
      .from('transfers')
      .update({
        exchange_rate: exchangeRate,
        converted_amount: round2(Number(transfer.amount) * exchangeRate),
      })
      .eq('id', transfer.id);
    if (updateError) throw updateError;
    report.updated += 1;
  }
  console.log('transfers:', report);
  return report;
}

async function main() {
  console.log(dryRun ? 'NPR peg backfill dry run — no rows will be changed.' : 'NPR peg backfill execution.');
  await updateNprSnapshots('expenses', 'date');
  await updateNprSnapshots('recurring_rules', 'next_due_date');
  await updateNprTransfers();
  console.log('NPR peg backfill complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
