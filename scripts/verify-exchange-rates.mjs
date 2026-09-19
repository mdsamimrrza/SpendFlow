// Verifies that every stored FX rate matches the official ECB source:
//   1. exchange_rates table rows  vs frankfurter.dev historical fixings
//   2. per-transaction exchange_rate_to_usd snapshots vs the same fixings
// Usage: node scripts/verify-exchange-rates.mjs [YYYY-MM-DD startDate]
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.maintenance.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.maintenance', 'utf8');
const get = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
const PEG = { USD: 1, AED: 1/3.6725, QAR: 1/3.64, SAR: 1/3.75 };
const FLOATING = ['INR','GBP','MYR','KRW','JPY','AUD','CAD'];
const start = process.argv[2] ?? '2026-08-01';

const hist = await fetch(`https://api.frankfurter.dev/v1/${start}..?base=USD&symbols=${FLOATING.join(',')}`).then(r => r.json());
const fixings = hist.rates ?? {};
const nearest = (d) => Object.keys(fixings).filter(x => x <= d).sort().pop();
const fixing = (ccy, d) => { const f = nearest(d); return f && fixings[f][ccy] ? 1/fixings[f][ccy] : null; };

let tBad = 0, tOk = 0;
const { data: tbl } = await sb.from('exchange_rates').select('currency,date,rate_to_usd').in('currency', FLOATING).gte('date', start).order('date');
for (const r of tbl ?? []) {
  const exp = fixing(r.currency, r.date);
  if (!exp) continue;
  if (Math.abs(Number(r.rate_to_usd) - exp) > 1e-6) { tBad++; console.log(`TABLE MISMATCH ${r.currency} ${r.date}: stored ${r.rate_to_usd} vs ECB ${exp.toFixed(8)}`); }
  else tOk++;
}
console.log(`1. exchange_rates table: ${tOk} OK, ${tBad} mismatches -> ${tBad === 0 ? 'PASS' : 'FAIL'}`);

let sBad = 0, sOk = 0, sSkip = 0;
for (const t of ['expenses', 'recurring_rules']) {
  const sel = t === 'expenses' ? 'id,currency,date,exchange_rate_to_usd' : 'id,currency,next_due_date,exchange_rate_to_usd';
  const dateCol = t === 'expenses' ? 'date' : 'next_due_date';
  let { data } = await sb.from(t).select(sel).gte(dateCol, start);
    if (t === 'recurring_rules') data = data.filter(r => r[dateCol] <= new Date().toISOString().slice(0,10)); // future due dates get re-stamped at generation
  for (const r of data ?? []) {
    const d = r[dateCol]?.slice(0, 10);
    const ccy = (r.currency || 'USD').toUpperCase();
    if (PEG[ccy] !== undefined) { sSkip++; continue; }
    const exp = ccy === 'NPR' ? (fixing('INR', d) ?? 0) / 1.6 : fixing(ccy, d);
    if (!exp) { sSkip++; continue; }
    const cur = Number(r.exchange_rate_to_usd);
    if (!cur || Math.abs(cur - exp) > 1e-6) { sBad++; console.log(`SNAPSHOT ${t} ${d} ${ccy}: stored ${cur ?? 'null'} vs ECB ${exp.toFixed(8)} (id ${r.id.slice(0, 8)})`); }
    else sOk++;
  }
}
console.log(`2. row snapshots: ${sOk} OK, ${sBad} wrong, ${sSkip} pegged/unknown skipped -> ${sBad === 0 ? 'PASS' : 'FAIL'}`);
