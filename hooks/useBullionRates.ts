import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { BullionRates, computeBullionPrices, ComputedBullionPrices, fetchLiveBullionRates } from '@/services/bullion';

export function useBullionRates(targetCurrencyOverride?: string) {
  const { profile } = useAuth();
  const { rates: exchangeRates } = useExchangeRates();
  const currency = targetCurrencyOverride ?? profile?.preferred_currency ?? 'INR';

  const [rawRates, setRawRates] = useState<BullionRates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBullion = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setLoading(true);
    setError(null);
    try {
      const data = await fetchLiveBullionRates();
      setRawRates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch bullion rates');
    } finally {
      if (isManualRefresh) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBullion(false);
  }, [loadBullion]);

  const prices: ComputedBullionPrices | null = rawRates
    ? computeBullionPrices(rawRates, currency, exchangeRates)
    : null;

  return {
    rawRates,
    prices,
    loading,
    error,
    currency,
    refreshBullionRates: () => loadBullion(true),
  };
}
