import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Central Nepal gold rate client.
//
// The app NEVER scrapes FENEGOSIDA itself. A server-side scheduled job stores
// ONE authoritative verified rate per Nepal market day in
// `market_gold_rates`, and every app instance reads that same row.
// ─────────────────────────────────────────────────────────────────────────────

export const KATHMANDU_TZ = 'Asia/Kathmandu';
const CACHE_KEY = '@spendflow_nepal_gold_official_v1';

export interface OfficialNepalGoldRate {
  id: string;
  rate_date: string; // yyyy-mm-dd, Nepal market date (Asia/Kathmandu)
  country_code: string;
  currency_code: string;
  fine_gold_per_tola: number;
  fine_gold_per_10g: number | null;
  tejabi_gold_per_tola: number | null;
  tejabi_gold_per_10g: number | null;
  silver_per_tola: number | null;
  silver_per_10g: number | null;
  source: string;
  source_url: string | null;
  fetch_source: string;
  market_authority: string;
  fetched_at: string;
  published_at: string | null;
  status: string;
}

export interface NepalRateLookup {
  record: OfficialNepalGoldRate | null;
  /** True when the record's market date is older than today's Nepal date. */
  isStale: boolean;
}

/** Today's date (yyyy-mm-dd) in the Nepal market timezone — never the device timezone. */
export function getKathmanduToday(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KATHMANDU_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseRecord(row: Record<string, unknown>): OfficialNepalGoldRate {
  return {
    id: String(row.id),
    rate_date: String(row.rate_date),
    country_code: String(row.country_code),
    currency_code: String(row.currency_code),
    fine_gold_per_tola: Number(row.fine_gold_per_tola),
    fine_gold_per_10g: row.fine_gold_per_10g === null ? null : Number(row.fine_gold_per_10g),
    tejabi_gold_per_tola: row.tejabi_gold_per_tola === null ? null : Number(row.tejabi_gold_per_tola),
    tejabi_gold_per_10g: row.tejabi_gold_per_10g === null ? null : Number(row.tejabi_gold_per_10g),
    silver_per_tola: row.silver_per_tola === null ? null : Number(row.silver_per_tola),
    silver_per_10g: row.silver_per_10g === null ? null : Number(row.silver_per_10g),
    source: String(row.source),
    source_url: row.source_url === null ? null : String(row.source_url),
    fetch_source: String(row.fetch_source),
    market_authority: String(row.market_authority),
    fetched_at: String(row.fetched_at),
    published_at: row.published_at === null ? null : String(row.published_at),
    status: String(row.status),
  };
}

/** Persist the latest known record so cold starts / offline still show a rate. */
export async function cacheNepalRate(record: OfficialNepalGoldRate): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch {
    // cache is best-effort
  }
}

export async function getCachedNepalRate(): Promise<OfficialNepalGoldRate | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as OfficialNepalGoldRate) : null;
  } catch {
    return null;
  }
}

/**
 * Latest stored official rate, cache-first:
 * 1. Cached record whose market date == today's Kathmandu date → use immediately.
 * 2. Otherwise query Supabase for the newest authoritative row.
 * 3. Supabase unreachable → fall back to the cached (stale) record.
 */
export async function getOfficialNepalRate(): Promise<NepalRateLookup> {
  const today = getKathmanduToday();
  const cached = await getCachedNepalRate();

  if (cached && cached.rate_date === today && cached.status === 'verified') {
    return { record: cached, isStale: false };
  }

  try {
    const { data, error } = await supabase
      .from('market_gold_rates')
      .select('*')
      .eq('country_code', 'NP')
      .order('rate_date', { ascending: false })
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      const record = parseRecord(data[0] as Record<string, unknown>);
      void cacheNepalRate(record);
      return { record, isStale: record.rate_date !== today };
    }
  } catch {
    // fall through to cached value
  }

  if (cached) {
    return { record: cached, isStale: cached.rate_date !== today };
  }
  return { record: null, isStale: true };
}

/**
 * Verified daily history for charts (newest last). Only real stored days are
 * returned — gaps (Saturdays / failed fetch days) are simply absent.
 */
export async function getOfficialNepalHistory(days = 400): Promise<OfficialNepalGoldRate[]> {
  try {
    const { data, error } = await supabase
      .from('market_gold_rates')
      .select('*')
      .eq('country_code', 'NP')
      .gte('rate_date', new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10))
      .order('rate_date', { ascending: true })
      .limit(days);

    if (error || !Array.isArray(data)) return [];
    return data.map(parseRecord);
  } catch {
    return [];
  }
}
