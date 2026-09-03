import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import {
  applyOfficialNepalRates,
  BullionRates,
  ComputedBullionPrices,
  computeBullionPrices,
  fetchMarketFixedBullionRates,
} from '@/services/bullion';
import {
  getOfficialNepalHistory,
  getOfficialNepalRate,
  NepalRateLookup,
  OfficialNepalGoldRate,
} from '@/services/nepalGold';

export function useBullionRates(targetCurrencyOverride?: string) {
  const { profile } = useAuth();
  const { rates: exchangeRates } = useExchangeRates();
  const currency = targetCurrencyOverride ?? profile?.preferred_currency ?? 'INR';
  const isNepal = currency.toUpperCase() === 'NPR';

  const [rawRates, setRawRates] = useState<BullionRates | null>(null);
  const [nepalOfficial, setNepalOfficial] = useState<OfficialNepalGoldRate | null>(null);
  const [nepalOfficialStale, setNepalOfficialStale] = useState(false);
  const [nepalHistory, setNepalHistory] = useState<OfficialNepalGoldRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBullion = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setLoading(true);
      setError(null);
      try {
        // Base benchmark (also serves as offline fallback and non-Nepal markets).
        const data = await fetchMarketFixedBullionRates(currency, isManualRefresh);
        setRawRates(data);

        if (isNepal) {
          // Official central daily rate: read from Supabase, never scraped on-device.
          // History loads alongside so day-over-day change and charts use real data.
          const lookup: NepalRateLookup = await getOfficialNepalRate();
          setNepalOfficial(lookup.record);
          setNepalOfficialStale(lookup.isStale);

          const history = await getOfficialNepalHistory();
          setNepalHistory(history);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not fetch bullion rates');
      } finally {
        if (isManualRefresh) setLoading(false);
      }
    },
    [currency, isNepal],
  );

  useEffect(() => {
    void loadBullion(false);
  }, [loadBullion]);

  let prices: ComputedBullionPrices | null = rawRates
    ? computeBullionPrices(rawRates, currency, exchangeRates)
    : null;

  // Overlay the authoritative FENEGOSIDA daily fix for Nepal when available.
  if (prices && isNepal && nepalOfficial) {
    prices = applyOfficialNepalRates(prices, nepalOfficial);
  }

  return {
    rawRates,
    prices,
    loading,
    error,
    currency,
    nepalOfficial,
    nepalOfficialStale,
    nepalHistory,
    refreshBullionRates: () => loadBullion(true),
  };
}
