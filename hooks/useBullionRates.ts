import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import {
  applyOfficialNepalRates,
  buildBullionMarketHistoryAll,
  BullionHistoryPoint,
  BullionRates,
  ComputedBullionPrices,
  computeBullionPrices,
  fetchMarketFixedBullionRates,
} from '@/services/bullion';

/** All four benchmark series for the secondary market's chart + change badges. */
export type MarketHistorySeries = Record<'gold_tola' | 'silver_tola' | 'gold_10g' | 'silver_10g', BullionHistoryPoint[]>;
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
  // Real futures-close history for non-Nepal markets (INR/QAR/…), keyed by
  // benchmark metric so the chart follows the selected card and every change
  // badge uses its own real series.
  const [marketHistory, setMarketHistory] = useState<MarketHistorySeries>({
    gold_tola: [],
    silver_tola: [],
    gold_10g: [],
    silver_10g: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBullion = useCallback(
    async (isManualRefresh = false) => {
      // Loading state shows on every load now — auto-refresh on screen open
      // fetches live data when the cached fix is stale, and the pill needs
      // its "Updating prices…" state during that fetch.
      setLoading(true);
      setError(null);
      // A market switch must never paint the other market's stale series:
      // clear the inactive store before loading so charts and change badges
      // can only ever show data that belongs to the active currency.
      if (isNepal) {
        setMarketHistory({ gold_tola: [], silver_tola: [], gold_10g: [], silver_10g: [] });
      } else {
        setNepalHistory([]);
      }
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
        } else {
          // Non-Nepal market: build all four benchmark series from real
          // futures closes at historical FX in one pass. Empty on failure —
          // the screen keeps its honest "unavailable" state.
          const series = await buildBullionMarketHistoryAll(currency, 120);
          setMarketHistory(series);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not fetch bullion rates');
      } finally {
        setLoading(false);
      }
    },
    [currency, isNepal],
  );

  useEffect(() => {
    void loadBullion(false);
  }, [loadBullion]);

  // Re-fetch when the app returns to the foreground while this screen is
  // mounted (matching the AppState pattern in utils/supabase.ts). The service's
  // session cache still short-circuits when fresh — this only triggers a live
  // fetch when the cached fix has aged past AUTO_CACHE_MAX_AGE_MS.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadBullion(false);
    });
    return () => sub.remove();
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
    marketHistory,
    refreshBullionRates: () => loadBullion(true),
  };
}
