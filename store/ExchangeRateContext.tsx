import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NPR_PER_INR, seedTodayRatesFromUnitsPerUsd } from '@/services/exchange';

const RATES_STORAGE_KEY = 'spendflow_exchange_rates_cache';
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

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

let inMemoryRates: Record<string, number> = {};
let inMemoryStatus: RateStatus = 'estimated';
let inMemoryFetchedAt: number | null = null;

const PRIMARY_RATES_API =
  process.env.EXPO_PUBLIC_EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';

export type RateStatus = 'live' | 'cached' | 'estimated';

async function fetchExchangeRates(): Promise<Record<string, number>> {
  // 1. Check AsyncStorage cache (only if fresh)
  const rawCache = await AsyncStorage.getItem(RATES_STORAGE_KEY);
  if (rawCache) {
    const parsed: RatesCache = JSON.parse(rawCache);
    const isFresh = Date.now() - parsed.timestamp < CACHE_EXPIRY_MS;
    if (parsed.rates && Object.keys(parsed.rates).length > 0 && isFresh) {
      inMemoryRates = applyNprPeg({ ...parsed.rates });
      inMemoryFetchedAt = parsed.timestamp;
      inMemoryStatus = 'live';
      seedTodayRatesFromUnitsPerUsd(inMemoryRates);
      return inMemoryRates;
    }
  }

  // 2. Fetch fresh live rates — PRIMARY ONLY, no fallback, no DEFAULT_RATES merge
  const response = await fetch(PRIMARY_RATES_API, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Exchange rate API failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!data?.rates) {
    throw new Error('Exchange rate API returned invalid data');
  }

  const newRates: Record<string, number> = applyNprPeg({ ...data.rates });

  inMemoryRates = newRates;
  inMemoryStatus = 'live';
  inMemoryFetchedAt = Date.now();
  seedTodayRatesFromUnitsPerUsd(newRates);
  await AsyncStorage.setItem(
    RATES_STORAGE_KEY,
    JSON.stringify({ timestamp: Date.now(), rates: newRates }),
  );
  return newRates;
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

  const fromRate = rates[fromCurrency] ?? 1;
  const toRate = rates[toCurrency] ?? 1;

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
      .catch((err) => {
        if (mounted) {
          setLoading(false);
          // Error will surface to any error boundary / Sentry
          console.error('[ExchangeRateProvider] Live fetch failed:', err);
        }
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
