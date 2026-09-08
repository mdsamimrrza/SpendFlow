import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NPR_PER_INR } from '@/services/exchange';

const RATES_STORAGE_KEY = 'spendflow_exchange_rates_cache';
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

// Baseline fallback rates relative to 1 USD
const DEFAULT_RATES: Record<string, number> = {
  USD: 1.0,
  // 83.5 INR/USD × 1.60 (NRB peg) — kept peg-consistent by construction.
  NPR: 133.6,
  INR: 83.5,
  QAR: 3.64,
  GBP: 0.79,
  EUR: 0.92,
  AED: 3.67,
  SAR: 3.75,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
  SGD: 1.35,
  MYR: 4.70,
  KRW: 1350.0,
  THB: 36.5,
  CNY: 7.23,
};

let inMemoryRates: Record<string, number> = { ...DEFAULT_RATES };

// Nepal Rastra Bank peg (1 INR = 1.60 NPR, fixed since 1993): the live API's
// NPR rate is a floating-market value and must never be consumed as-is —
// every rate map that leaves this module derives NPR from its INR rate.
function applyNprPeg(rates: Record<string, number>): Record<string, number> {
  const inrPerUsd = Number(rates.INR);
  if (Number.isFinite(inrPerUsd) && inrPerUsd > 0) {
    rates.NPR = inrPerUsd * NPR_PER_INR;
  }
  return rates;
}
// Truth about where inMemoryRates came from. 'live' = fresh provider data;
// 'cached' = stored provider data past its TTL; 'estimated' = hardcoded
// offline baseline only. Consumers surface this instead of silently presenting
// estimated values as current market data.
let inMemoryStatus: RateStatus = 'estimated';
let inMemoryFetchedAt: number | null = null;

const PRIMARY_RATES_API =
  process.env.EXPO_PUBLIC_EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
const FALLBACK_RATES_API =
  process.env.EXPO_PUBLIC_EXCHANGE_RATE_FALLBACK_API_URL ||
  'https://api.exchangerate-api.com/v4/latest/USD';

export type RateStatus = 'live' | 'cached' | 'estimated';

async function fetchExchangeRates(): Promise<Record<string, number>> {
  try {
    // 1. Check AsyncStorage cache
    const rawCache = await AsyncStorage.getItem(RATES_STORAGE_KEY);
    if (rawCache) {
      const parsed: RatesCache = JSON.parse(rawCache);
      const isFresh = Date.now() - parsed.timestamp < CACHE_EXPIRY_MS;
      if (parsed.rates && Object.keys(parsed.rates).length > 0) {
        inMemoryRates = applyNprPeg({ ...DEFAULT_RATES, ...parsed.rates });
        inMemoryFetchedAt = parsed.timestamp;
        inMemoryStatus = isFresh ? 'live' : 'cached';
        if (isFresh) {
          return inMemoryRates;
        }
      }
    }

    // 2. Fetch fresh live rates from primary open exchange API
    let data: any = null;
    try {
      const response = await fetch(PRIMARY_RATES_API, {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        data = await response.json();
      }
    } catch {
      // If primary fails, try secondary live API endpoint
      try {
        const fallbackRes = await fetch(FALLBACK_RATES_API, {
          headers: { Accept: 'application/json' },
        });
        if (fallbackRes.ok) {
          data = await fallbackRes.json();
        }
      } catch {
        // Both network requests failed
      }
    }

    if (data && data.rates) {
      const newRates: Record<string, number> = applyNprPeg({
        ...DEFAULT_RATES,
        ...data.rates,
      });

      inMemoryRates = newRates;
      inMemoryStatus = 'live';
      inMemoryFetchedAt = Date.now();
      await AsyncStorage.setItem(
        RATES_STORAGE_KEY,
        JSON.stringify({ timestamp: Date.now(), rates: newRates }),
      );
      return newRates;
    }
  } catch (error) {
    // Fallback gracefully to in-memory or cached rates
  }

  // No live data and nothing better in cache: whatever inMemoryRates holds is
  // at best a stale copy — its existing inMemoryStatus says which. If even
  // that was never populated from a provider, it is the estimated baseline.
  if (inMemoryStatus === 'live' && inMemoryFetchedAt !== null &&
      Date.now() - inMemoryFetchedAt >= CACHE_EXPIRY_MS) {
    inMemoryStatus = 'cached';
  }
  return inMemoryRates;
}

function getCachedRates(): Record<string, number> {
  return inMemoryRates;
}

function getCachedRateStatus(): RateStatus {
  return inMemoryStatus;
}

function getCachedRateFetchedAt(): number | null {
  return inMemoryFetchedAt;
}

/**
 * Converts an amount from one currency to another using the provided rates (relative to USD).
 */
function convertCurrency(
  amount: number,
  fromCurrency = 'NPR',
  toCurrency = 'NPR',
  rates: Record<string, number> = inMemoryRates,
): number {
  if (fromCurrency === toCurrency || !amount) return amount;

  const fromRate = rates[fromCurrency] || DEFAULT_RATES[fromCurrency] || 1;
  const toRate = rates[toCurrency] || DEFAULT_RATES[toCurrency] || 1;

  if (fromRate <= 0) return amount;

  // Convert to USD first, then to target currency
  const amountInUSD = amount / fromRate;
  const converted = amountInUSD * toRate;

  return Math.round(converted * 100) / 100;
}

interface RatesCache {
  timestamp: number;
  rates: Record<string, number>;
}

export interface ExchangeRateContextValue {
  rates: Record<string, number>;
  loading: boolean;
  convert: (amount: number, fromCurrency?: string, toCurrency?: string) => number;
  /** Re-evaluates the shared rate cache (TTL-respecting, same as a fresh mount previously did). */
  refresh: () => Promise<Record<string, number>>;
  /** Where the current rates came from: 'live' provider data, 'cached' (past TTL), or 'estimated' offline baseline. */
  status: RateStatus;
  /** Provider fetch timestamp (ms epoch) of the current rates — null when estimated. */
  fetchedAt: number | null;
}

export const ExchangeRateContext = createContext<ExchangeRateContextValue | null>(null);

/**
 * Single shared owner of live exchange-rate state.
 *
 * FX rates are global public market data (USD-based) — independent of the
 * signed-in user — so the provider sits at the app root, mounts once, and never
 * resets on navigation or auth changes. Previously every consumer ran its own
 * hook instance (an AsyncStorage read per instance and, when the 6-hour TTL
 * expired, its own network fetch); now one instance serves the whole app.
 *
 * The persistent AsyncStorage cache, its 6-hour TTL, the primary/fallback API
 * chain, and the conversion math are unchanged — they are centralized here
 * instead of being duplicated per screen.
 */
export function ExchangeRateProvider({ children }: PropsWithChildren) {
  const [rates, setRates] = useState<Record<string, number>>(getCachedRates);
  const [loading, setLoading] = useState(false);
  const [rateStatus, setRateStatus] = useState<RateStatus>(getCachedRateStatus);
  const [rateFetchedAt, setRateFetchedAt] = useState<number | null>(getCachedRateFetchedAt);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchExchangeRates()
      .then(() => {
        if (mounted) {
          setRates(getCachedRates());
          setRateStatus(getCachedRateStatus());
          setRateFetchedAt(getCachedRateFetchedAt());
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const refresh = useCallback(() =>
    fetchExchangeRates().then((nextRates) => {
      setRates(getCachedRates());
      setRateStatus(getCachedRateStatus());
      setRateFetchedAt(getCachedRateFetchedAt());
      return nextRates;
    }), []);

  const convert = useCallback(
    (amount: number, fromCurrency = 'NPR', toCurrency = 'NPR') => {
      return convertCurrency(amount, fromCurrency, toCurrency, rates);
    },
    [rates],
  );

  const value = useMemo<ExchangeRateContextValue>(
    () => ({ rates, loading, convert, refresh, status: rateStatus, fetchedAt: rateFetchedAt }),
    [convert, loading, rates, rateFetchedAt, rateStatus, refresh],
  );

  return <ExchangeRateContext.Provider value={value}>{children}</ExchangeRateContext.Provider>;
}

export function useExchangeRateContext(): ExchangeRateContextValue {
  const value = useContext(ExchangeRateContext);
  if (!value) throw new Error('useExchangeRates must be used inside an ExchangeRateProvider');
  return value;
}
