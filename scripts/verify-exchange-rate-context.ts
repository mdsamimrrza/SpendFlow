import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync('store/ExchangeRateContext.tsx', 'utf8');
const currencies = ['NPR', 'INR', 'USD', 'QAR', 'GBP', 'AED', 'SAR', 'MYR', 'KRW', 'JPY', 'AUD', 'CAD'];

assert.match(source, /const DEFAULT_RATES: Record<string, number> = \{/);
for (const currency of currencies) {
  assert.match(source, new RegExp(`\\b${currency}:`), `missing ${currency} offline fallback`);
}
assert.match(source, /let inMemoryRates: Record<string, number> = \{ \.\.\.DEFAULT_RATES \};/);
assert.doesNotMatch(source, /rates\[fromCurrency\] \?\? 1/);
assert.doesNotMatch(source, /rates\[toCurrency\] \?\? 1/);

console.log(`Exchange-rate context fallback: ${currencies.length} currencies verified`);
