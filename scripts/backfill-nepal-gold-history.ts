import { createClient } from '@supabase/supabase-js';
import './load-maintenance-env';

/**
 * One-time maintenance: backfills market_gold_rates with Nepal's OFFICIAL
 * daily FENEGOSIDA fixes, using the association's own public history endpoint
 * (api.fenegosida.org/api/website/v1/Dashboard/datewisehistory?date=YYYY-MM-DD)
 * — the same API that powers the charts on fenegosida.org itself. No scraping,
 * no estimation: every row comes verbatim from the market authority.
 *
 * - Skips dates already stored (idempotent, safe to re-run).
 * - Saturdays/market holidays return empty → nothing stored, exactly like the
 *   daily Edge Function's stale-publication guard.
 * - Values validated with the same sanity bounds as the Edge Function.
 *
 * Usage: secrets in .env.maintenance (gitignored); run: npx tsx scripts/backfill-nepal-gold-history.ts
 */

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / service_role in environment.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const API = 'https://api.fenegosida.org/api/website/v1/Dashboard/datewisehistory';
const UA = 'SpendFlow/1.0 (+https://spendflow.app)';

interface HistoryRow {
  todayDate: string;
  rateType: string;
  baseRatePerGram: number | string;
}

interface ParsedDay {
  rate_date: string;
  fine_gold_per_tola: number;
  fine_gold_per_10g: number | null;
  silver_per_tola: number | null;
  silver_per_10g: number | null;
  published_at: string | null;
}

function toNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[,\s]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchDay(dateIso: string): Promise<ParsedDay | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${API}?date=${dateIso}`, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as HistoryRow[];
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const findRow = (keywords: string[], unit: string) =>
      rows.find((r) => {
        const t = String(r.rateType ?? '');
        return keywords.every((k) => t.includes(k)) && t.includes(unit);
      });

    const goldTola = findRow(['छापावाल', 'सुन'], 'तोला');
    const gold10g = findRow(['छापावाल', 'सुन'], 'ग्राम');
    const silverTola = findRow(['चाँदी'], 'तोला');
    const silver10g = findRow(['चाँदी'], 'ग्राम');
    if (!goldTola) return null;

    const fineGoldPerTola = toNum(goldTola.baseRatePerGram);
    if (fineGoldPerTola === null || fineGoldPerTola < 50_000 || fineGoldPerTola > 5_000_000) return null;

    return {
      rate_date: dateIso,
      fine_gold_per_tola: fineGoldPerTola,
      fine_gold_per_10g: gold10g ? toNum(gold10g.baseRatePerGram) : null,
      silver_per_tola: silverTola ? toNum(silverTola.baseRatePerGram) : null,
      silver_per_10g: silver10g ? toNum(silver10g.baseRatePerGram) : null,
      published_at: goldTola.todayDate ? `${dateIso}T04:55:00+00:00` : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { data: existing } = await supabase
    .from('market_gold_rates')
    .select('rate_date')
    .eq('country_code', 'NP');
  const have = new Set((existing ?? []).map((r) => String(r.rate_date)));
  console.log(`Already stored: ${have.size} days.`);

  const DAYS = 400;
  const rows: ParsedDay[] = [];
  let marketDays = 0;
  let misses = 0;
  for (let i = 0; i < DAYS; i += 1) {
    const d = new Date(Date.now() - i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    if (have.has(iso)) continue;
    const day = await fetchDay(iso);
    if (day) {
      rows.push(day);
      marketDays += 1;
    } else {
      misses += 1; // Saturday / holiday / fetch failure
    }
    if (i % 50 === 49) console.log(`  scanned ${i + 1}/${DAYS}…`);
  }
  console.log(`Fetched ${marketDays} official days (${misses} empty/holiday dates).`);
  if (rows.length === 0) {
    console.log('Nothing new to store.');
    return;
  }

  const CHUNK = 50;
  let stored = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r) => ({
      ...r,
      country_code: 'NP',
      currency_code: 'NPR',
      tejabi_gold_per_tola: null,
      tejabi_gold_per_10g: null,
      source: 'FENEGOSIDA',
      source_url: 'https://www.fenegosida.org',
      fetch_source: 'fenegosida_official_history_api',
      market_authority: 'FENEGOSIDA',
      status: 'verified',
    }));
    const { error } = await supabase
      .from('market_gold_rates')
      .upsert(batch, { onConflict: 'rate_date,country_code', ignoreDuplicates: true });
    if (error) {
      console.error(`Batch failed: ${error.message}`);
      process.exit(1);
    }
    stored += batch.length;
    console.log(`  upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  console.log(`Done — stored ${stored} verified official days.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
