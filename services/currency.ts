import AsyncStorage from '@react-native-async-storage/async-storage';

const RATES_STORAGE_KEY = 'spendflow_exchange_rates_cache';
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

// Baseline fallback rates relative to 1 USD
export const DEFAULT_RATES: Record<string, number> = {
  USD: 1.0,
  NPR: 133.5,
  INR: 83.5,
  EUR: 0.92,
  GBP: 0.79,
};

interface RatesCache {
  timestamp: number;
  rates: Record<string, number>;
}

let inMemoryRates: Record<string, number> = { ...DEFAULT_RATES };

const PRIMARY_RATES_API =
  process.env.EXPO_PUBLIC_EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
const FALLBACK_RATES_API =
  process.env.EXPO_PUBLIC_EXCHANGE_RATE_FALLBACK_API_URL ||
  'https://api.exchangerate-api.com/v4/latest/USD';

export async function fetchExchangeRates(): Promise<Record<string, number>> {
  try {
    // 1. Check AsyncStorage cache
    const rawCache = await AsyncStorage.getItem(RATES_STORAGE_KEY);
    if (rawCache) {
      const parsed: RatesCache = JSON.parse(rawCache);
      const isFresh = Date.now() - parsed.timestamp < CACHE_EXPIRY_MS;
      if (parsed.rates && Object.keys(parsed.rates).length > 0) {
        inMemoryRates = { ...DEFAULT_RATES, ...parsed.rates };
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
      const newRates: Record<string, number> = {
        USD: 1.0,
        NPR: Number(data.rates.NPR) || DEFAULT_RATES.NPR,
        INR: Number(data.rates.INR) || DEFAULT_RATES.INR,
        EUR: Number(data.rates.EUR) || DEFAULT_RATES.EUR,
        GBP: Number(data.rates.GBP) || DEFAULT_RATES.GBP,
      };

      inMemoryRates = newRates;
      await AsyncStorage.setItem(
        RATES_STORAGE_KEY,
        JSON.stringify({ timestamp: Date.now(), rates: newRates }),
      );
      return newRates;
    }
  } catch (error) {
    // Fallback gracefully to in-memory or cached rates
  }

  return inMemoryRates;
}

export function getCachedRates(): Record<string, number> {
  return inMemoryRates;
}

/**
 * Converts an amount from one currency to another using the provided rates (relative to USD).
 */
export function convertCurrency(
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
