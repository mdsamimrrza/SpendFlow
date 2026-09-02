import type { SupabaseClient } from '@supabase/supabase-js';

// USD per 1 unit of currency. Pegs are exact and permanent — never hit the API for these.
const PEGGED_USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  QAR: 1 / 3.64,
  AED: 1 / 3.6725,
  SAR: 1 / 3.75,
};

// Last-resort approximation when neither DB cache nor the API can answer.
const FALLBACK_UNITS_PER_USD: Record<string, number> = {
  USD: 1,
  NPR: 133.5,
  INR: 83.5,
  QAR: 3.64,
  GBP: 0.79,
};

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
    const accessKey =
      process.env.EXCHANGE_RATE_HOST_ACCESS_KEY ||
      process.env.EXPO_PUBLIC_EXCHANGE_RATE_HOST_ACCESS_KEY;
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

  async function getRate(currency: string, date: string): Promise<number> {
    const ccy = (currency || 'USD').toUpperCase();
    if (PEGGED_USD_PER_UNIT[ccy] !== undefined) return PEGGED_USD_PER_UNIT[ccy];
    if (!isIsoDate(date)) return fallbackUsdPerUnit(ccy);

    const { data: cached } = await client
      .from('exchange_rates')
      .select('rate_to_usd')
      .eq('currency', ccy)
      .eq('date', date)
      .maybeSingle();
    const cachedRate = Number(cached?.rate_to_usd);
    if (cachedRate > 0) return cachedRate;

    const units = await fetchHistoricalUnitsPerUsd(date, ccy);
    if (units) {
      const rate = round8(1 / units);
      const { error: insertError } = await client
        .from('exchange_rates')
        .upsert(
          { currency: ccy, date, rate_to_usd: rate },
          { onConflict: 'currency,date', ignoreDuplicates: true },
        );
      if (!insertError) return rate;
    }

    const { data: nearest } = await client
      .from('exchange_rates')
      .select('rate_to_usd')
      .eq('currency', ccy)
      .lte('date', date)
      .order('date', { ascending: false })
      .limit(1);
    const nearestRate = Number(nearest?.[0]?.rate_to_usd);
    if (nearestRate > 0) return nearestRate;

    return fallbackUsdPerUnit(ccy);
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

    const pending = [...missing.values()].filter((p) => !cache.has(key(p.c, p.d)));
    const CHUNK = 5;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const rates = await Promise.all(
        pending.slice(i, i + CHUNK).map(async (p) => [key(p.c, p.d), await getRate(p.c, p.d)] as const),
      );
      rates.forEach(([k, r]) => cache.set(k, r));
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
