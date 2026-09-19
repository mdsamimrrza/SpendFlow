import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.maintenance', 'utf8');
const get = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
const APPLY = process.env.APPLY === '1';

const PEG = { USD: 1, AED: 1/3.6725, QAR: 1/3.64, SAR: 1/3.75 };
const FLOATING = ['INR','GBP','MYR','KRW','JPY','AUD','CAD'];

// 1. load all money rows (expenses + recurring_rules; transfers are locked-by-design, skipped)
const tables = ['expenses'];
const all = {};
for (const t of tables) {
  const { data, error } = await sb.from(t).select('id,currency,date,exchange_rate_to_usd,base_currency');
  if (error) { console.log(t, 'ERR', error.message); process.exit(1); }
  all[t] = data;
  console.log(t, data.length, 'rows');
}

// 2. fetch ECB fixings for the full date span
const dates = Object.values(all).flat().map(r => r.date).sort();
const start = dates[0], end = new Date().toISOString().slice(0,10);
const url = `https://api.frankfurter.dev/v1/${start}..${end}?base=USD&symbols=${FLOATING.join(',')}`;
const hist = await fetch(url).then(r => r.json());
const fixings = hist.rates ?? {};   // date -> { INR: units, ... }
console.log('fixings loaded:', Object.keys(fixings).length, 'days from', start, 'to', end);

function nearestFixing(date) {
  const keys = Object.keys(fixings).filter(d => d <= date).sort();
  return keys[keys.length - 1] ?? null;
}
function expectedRate(ccy, date) {
  if (PEG[ccy] !== undefined) return PEG[ccy];
  if (ccy === 'NPR') {
    const f = nearestFixing(date);
    if (!f || !fixings[f].INR) return null;
    return fixings[f].INR && (1/fixings[f].INR)/1.6;
  }
  const f = nearestFixing(date);
  if (!f || !fixings[f][ccy]) return null;
  return 1/fixings[f][ccy];
}

// 3. re-stamp snapshots where they differ
let diffs = 0, checked = 0, noFixing = 0;
for (const t of tables) {
  for (const r of all[t]) {
    checked++;
    const exp = expectedRate(r.currency, r.date);
    if (exp == null) { noFixing++; continue; }
    const cur = Number(r.exchange_rate_to_usd);
    if (cur && Math.abs(cur - exp) < 1e-8) continue;
    diffs++;
    if (diffs <= 15) console.log(`  ${t} ${r.date} ${r.currency} ${r.id.slice(0,8)}: ${cur ?? 'null'} -> ${exp.toFixed(8)}`);
    if (APPLY) {
      const { error } = await sb.from(t).update({ exchange_rate_to_usd: exp, base_currency: 'USD' }).eq('id', r.id);
      if (error) console.log('  UPDATE ERR', r.id.slice(0,8), error.message);
    }
  }
}
console.log(`checked=${checked} diffs=${diffs} noFixing=${noFixing} ${APPLY ? '(APPLIED)' : '(DRY RUN)'}`);

// 4. warm exchange_rates table for every referenced (floating ccy, date) not yet present
const { data: existing } = await sb.from('exchange_rates').select('currency,date');
const have = new Set((existing ?? []).map(r => `${r.currency}|${r.date}`));
const pairs = new Set();
for (const t of tables) for (const r of all[t]) {
  const f = nearestFixing(r.date);
  if (!f) continue;
  for (const c of FLOATING) if (fixings[f][c]) pairs.add(`${c}|${f}`);
}
let toInsert = [...pairs].filter(p => !have.has(p)).map(p => {
  const [ccy, d] = p.split('|');
  return { currency: ccy, date: d, rate_to_usd: 1/fixings[d][ccy], source: 'frankfurter_backfill' };
});
console.log('table rows to insert:', toInsert.length, 'of', pairs.size, 'referenced pairs');
if (APPLY && toInsert.length) {
  for (let i = 0; i < toInsert.length; i += 200) {
    const { error } = await sb.from('exchange_rates').upsert(toInsert.slice(i, i+200), { onConflict: 'currency,date', ignoreDuplicates: true });
    if (error) console.log('INSERT ERR', error.message);
  }
  console.log('table warmed');
}
