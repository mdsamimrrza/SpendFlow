import { ExchangeRateContextValue, useExchangeRateContext } from '@/store/ExchangeRateContext';

/**
 * Compatibility layer for the shared exchange-rate provider.
 *
 * Before the ExchangeRateProvider existed, every call site ran its own hook
 * instance (own state + its own AsyncStorage/FX-cache check). Now this hook is
 * a thin read of the shared provider state so all screens see the same rates
 * without changing their imports.
 *
 * Public API is unchanged: { rates, loading, convert }.
 */
export function useExchangeRates(): ExchangeRateContextValue {
  return useExchangeRateContext();
}
