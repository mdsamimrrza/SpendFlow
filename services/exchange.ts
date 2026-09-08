import type { SupabaseClient } from '@supabase/supabase-js';

// USD per 1 unit of currency. Pegs are exact and permanent — never hit the API for these.
const PEGGED_USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  QAR: 1 / 3.64,
  AED: 1 / 3.6725,
  SAR: 1 / 3.75,
};

// Last-resort approximation when neither DB cache nor the API can answer.
// Pegged currencies (QAR/AED/SAR) are resolved by PEGGED_USD_PER_UNIT instead.
const FALLBACK_UNITS_PER_USD: Record<string, number> = {
  USD: 1,
  NPR: 133.5,
  INR: 83.5,
  QAR: 3.64,
  GBP: 0.79,
  MYR: 4.70,
  KRW: 1350.0,
  JPY: 155.0,
  AUD: 1.52,
  CAD: 1.36,
};

// ── Session rate memory ─────────────────────────────────────────────────────
// Historical rates never change, so they are remembered for the whole session;
// today's rate moves with the market and refreshes after a short TTL. This is
// what makes repeat balance computations instant when switching between the
// Accounts, ExpenseForm, and Transfer screens — memory instead of network.
const RATE_MEMORY_TODAY_TTL_MS = 10 * 60 * 1000;

const memoryRateCache = new Map<string, { rate: number; expiresAt: number }>();

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function rememberRate(currency: string, date: string, rate: number): void {
  memoryRateCache.set(`${currency}|${date}`, {
    rate,
    expiresAt: date >= todayIso() ? Date.now() + RATE_MEMORY_TODAY_TTL_MS : Number.POSITIVE_INFINITY,
  });
}

function recallRate(currency: string, date: string): number | null {
  const entry = memoryRateCache.get(`${currency}|${date}`);
  if (!entry) return null;
  if (entry.expiresAt !== Number.POSITIVE_INFINITY && Date.now() > entry.expiresAt) {
    memoryRateCache.delete(`${currency}|${date}`);
    return null;
  }
  return entry.rate;
}

export interface SnapshotRow {
  currency: string;
  date: string;
  exchange_rate_to_usd?: number | null;
}

export interface RateResolver {
  usdPerUnit(currency: string, date: string): number;
  convert(amount: number, from: string, to: string, date: string): number;
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fallbackUsdPerUnit(currency: string): number {
  const units = FALLBACK_UNITS_PER_USD[currency];
  return units && units > 0 ? 1 / units : 1;
}

function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function createExchangeService(client: SupabaseClient) {
  async function fetchHistoricalUnitsPerUsd(date: string, currency: string): Promise<number | null> {
    // Server-side only. This module is also imported by the backfill script,
    // which runs in Node with real secrets. The EXPO_PUBLIC_ fallback was
    // removed — provider API keys must never be bundled into the client.
    const accessKey = process.env.EXCHANGE_RATE_HOST_ACCESS_KEY;
    const url = new URL(`https://api.exchangerate.host/${date}`);
    url.searchParams.set('base', 'USD');
    url.searchParams.set('symbols', currency);
    if (accessKey) url.searchParams.set('access_key', accessKey);
    try {
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      const units = Number(data?.rates?.[currency]);
      return units > 0 ? units : null;
    } catch {
      return null;
    }
  }

  // One query serves the whole exchange_rates table (writes are restricted to
  // trusted server-side processes, so it stays small), with a short TTL so
  // back-to-back resolver builds — e.g. an NPR account and an INR account —
  // share a single round trip. The limit bounds the payload if the table ever
  // grows unexpectedly.
  let dbRatesAt = 0;
  let dbRatesByCurrency = new Map<string, { date: string; rate: number }[]>();
  async function loadDbRates(): Promise<Map<string, { date: string; rate: number }[]>> {
    if (Date.now() - dbRatesAt < 60_000) return dbRatesByCurrency;
    const { data, error } = await client
      .from('exchange_rates')
      .select('currency, date, rate_to_usd')
      .order('date', { ascending: true })
      .limit(2000);
    if (!error && data) {
      const byCurrency = new Map<string, { date: string; rate: number }[]>();
      for (const row of data as { currency: string; date: string; rate_to_usd: number | null }[]) {
        const rate = Number(row.rate_to_usd);
        if (!(rate > 0)) continue;
        const list = byCurrency.get(row.currency) ?? [];
        list.push({ date: row.date, rate });
        byCurrency.set(row.currency, list);
      }
      dbRatesByCurrency = byCurrency;
      dbRatesAt = Date.now();
    }
    return dbRatesByCurrency;
  }

  /** Latest rate on/before `date` from an ascending-sorted list (binary search). */
  function nearestDbRate(list: { date: string; rate: number }[] | undefined, date: string): number | null {
    if (!list || list.length === 0) return null;
    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].date <= date) lo = mid + 1;
      else hi = mid - 1;
    }
    return hi >= 0 ? list[hi].rate : null;
  }

  // One live-rates call (primary API, then fallback) answers every remaining
  // currency at once — replaces the old per-currency historical fetches that
  // made balance loading take many seconds.
  let latestAt = 0;
  let latestUnits: Record<string, number> | null = null;
  async function loadLatestUnitsPerUsd(): Promise<Record<string, number> | null> {
    if (latestUnits && Date.now() - latestAt < 5 * 60_000) return latestUnits;
    const primary =
      process.env.EXPO_PUBLIC_EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
    const fallbackApi =
      process.env.EXPO_PUBLIC_EXCHANGE_RATE_FALLBACK_API_URL ||
      'https://api.exchangerate-api.com/v4/latest/USD';
    for (const url of [primary, fallbackApi]) {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.rates && typeof data.rates === 'object') {
          latestUnits = data.rates as Record<string, number>;
          latestAt = Date.now();
          return latestUnits;
        }
      } catch {
        // try the next source
      }
    }
    return null;
  }

  async function getRate(currency: string, date: string): Promise<number> {
    const ccy = (currency || 'USD').toUpperCase();
    if (PEGGED_USD_PER_UNIT[ccy] !== undefined) return PEGGED_USD_PER_UNIT[ccy];
    const remembered = recallRate(ccy, date);
    if (remembered !== null) return remembered;
    if (!isIsoDate(date)) return fallbackUsdPerUnit(ccy);

    const { data: cached } = await client
      .from('exchange_rates')
      .select('rate_to_usd')
      .eq('currency', ccy)
      .eq('date', date)
      .maybeSingle();
    const cachedRate = Number(cached?.rate_to_usd);
    if (cachedRate > 0) {
      rememberRate(ccy, date, cachedRate);
      return cachedRate;
    }

    const units = await fetchHistoricalUnitsPerUsd(date, ccy);
    if (units) {
      const rate = round8(1 / units);
      // Writing the fetched rate to the shared table is best-effort — normal
      // users no longer have INSERT permission on exchange_rates (trusted
      // server-side processes own that data). A denied write resolves as an
      // error result, never a throw, and must not stop the client from using
      // the rate it already resolved.
      await client
        .from('exchange_rates')
        .upsert(
          { currency: ccy, date, rate_to_usd: rate },
          { onConflict: 'currency,date', ignoreDuplicates: true },
        );
      rememberRate(ccy, date, rate);
      return rate;
    }

    const { data: nearest } = await client
      .from('exchange_rates')
      .select('rate_to_usd')
      .eq('currency', ccy)
      .lte('date', date)
      .order('date', { ascending: false })
      .limit(1);
    const nearestRate = Number(nearest?.[0]?.rate_to_usd);
    if (nearestRate > 0) {
      rememberRate(ccy, date, nearestRate);
      return nearestRate;
    }

    const fallback = fallbackUsdPerUnit(ccy);
    rememberRate(ccy, date, fallback);
    return fallback;
  }

  async function convert(amount: number, fromCurrency: string, toCurrency: string, date: string): Promise<number> {
    const from = await getRate(fromCurrency, date);
    const to = await getRate(toCurrency, date);
    return round2(amount * (from / to));
  }

  async function convertExpense(
    expense: SnapshotRow & { amount: number | string },
    toCurrency: string,
  ): Promise<number> {
    const amount = Number(expense.amount);
    const from = (expense.currency || 'USD').toUpperCase();
    const to = (toCurrency || 'USD').toUpperCase();
    if (from === to || !amount) return amount;
    const toRate = await getRate(to, expense.date);
    const snapshot = Number(expense.exchange_rate_to_usd);
    if (snapshot > 0) return round2((amount * snapshot) / toRate);
    const fromRate = await getRate(from, expense.date);
    return round2((amount * fromRate) / toRate);
  }

  async function buildRateResolver(rows: SnapshotRow[], targetCurrency: string): Promise<RateResolver> {
    const target = (targetCurrency || 'USD').toUpperCase();
    const cache = new Map<string, number>();
    const key = (c: string, d: string) => `${c}|${d}`;
    const missing = new Map<string, { c: string; d: string }>();

    const rowsByTargetDate = new Set<string>();
    for (const row of rows) {
      const ccy = (row.currency || 'USD').toUpperCase();
      const snap = Number(row.exchange_rate_to_usd);
      if (snap > 0) {
        cache.set(key(ccy, row.date), snap);
      } else if (PEGGED_USD_PER_UNIT[ccy] === undefined) {
        missing.set(key(ccy, row.date), { c: ccy, d: row.date });
      }
      if (ccy !== target) rowsByTargetDate.add(row.date);
    }
    for (const d of rowsByTargetDate) {
      if (PEGGED_USD_PER_UNIT[target] === undefined) {
        missing.set(key(target, d), { c: target, d });
      }
    }

    // Session memory answers repeats instantly (screen switches, re-renders).
    for (const [k, pair] of [...missing]) {
      const remembered = recallRate(pair.c, pair.d);
      if (remembered !== null) {
        cache.set(k, remembered);
        missing.delete(k);
      }
    }

    // One DB round trip answers the rest via nearest-known-date.
    if (missing.size) {
      const dbRates = await loadDbRates();
      for (const [k, pair] of [...missing]) {
        const nearest = nearestDbRate(dbRates.get(pair.c), pair.d);
        if (nearest !== null) {
          cache.set(k, nearest);
          rememberRate(pair.c, pair.d, nearest);
          missing.delete(k);
        }
      }
    }

    // Still nothing? One live-rates call answers every remaining currency.
    if (missing.size) {
      const latest = await loadLatestUnitsPerUsd();
      if (latest) {
        for (const [k, pair] of [...missing]) {
          const units = Number(latest[pair.c]);
          if (units > 0) {
            const rate = round8(1 / units);
            cache.set(k, rate);
            rememberRate(pair.c, pair.d, rate);
            missing.delete(k);
          }
        }
      }
    }

    // Anything left falls back to static approximations.
    for (const [k, pair] of missing) {
      cache.set(k, fallbackUsdPerUnit(pair.c));
    }

    const usdPerUnit = (currency: string, date: string): number => {
      const ccy = (currency || 'USD').toUpperCase();
      if (PEGGED_USD_PER_UNIT[ccy] !== undefined) return PEGGED_USD_PER_UNIT[ccy];
      return cache.get(key(ccy, date)) ?? fallbackUsdPerUnit(ccy);
    };

    return {
      usdPerUnit,
      convert(amount, from, to, date) {
        return round2(amount * (usdPerUnit(from, date) / usdPerUnit(to, date)));
      },
    };
  }

  return { getRate, convert, convertExpense, buildRateResolver };
}

type ExchangeService = ReturnType<typeof createExchangeService>;
let defaultService: ExchangeService | null = null;

// Lazily resolved so Node scripts can import createExchangeService without
// pulling in the React Native supabase client (AsyncStorage).
function service(): ExchangeService {
  if (!defaultService) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { supabase } = require('@/utils/supabase');
    defaultService = createExchangeService(supabase);
  }
  return defaultService;
}

export function getRate(currency: string, date: string): Promise<number> {
  return service().getRate(currency, date);
}

export function convert(amount: number, fromCurrency: string, toCurrency: string, date: string): Promise<number> {
  return service().convert(amount, fromCurrency, toCurrency, date);
}

export function convertExpense(
  expense: SnapshotRow & { amount: number | string },
  toCurrency: string,
): Promise<number> {
  return service().convertExpense(expense, toCurrency);
}

export function buildRateResolver(rows: SnapshotRow[], targetCurrency: string): Promise<RateResolver> {
  return service().buildRateResolver(rows, targetCurrency);
}
