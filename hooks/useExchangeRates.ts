import { useEffect, useState, useCallback } from 'react';
import {
  convertCurrency,
  fetchExchangeRates,
  getCachedRates,
  DEFAULT_RATES,
} from '@/services/currency';

export function useExchangeRates() {
  const [rates, setRates] = useState<Record<string, number>>(getCachedRates());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchExchangeRates()
      .then((newRates) => {
        if (mounted) {
          setRates(newRates);
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

  const convert = useCallback(
    (amount: number, fromCurrency = 'NPR', toCurrency = 'NPR') => {
      return convertCurrency(amount, fromCurrency, toCurrency, rates);
    },
    [rates],
  );

  return { rates, loading, convert };
}
