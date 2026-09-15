/**
 * Verification run for the centralized currency display system.
 * Node-side check of formatCurrency/compactMoney semantics (data stays
 * precise; only display rounds — half away from zero, never "-0").
 * Dollar-scale currencies (USD/GBP/AED/SAR/QAR/AUD/CAD/MYR) keep 2 decimals
 * under 1,000 units; NPR/INR/KRW/JPY and 1,000+ values stay whole units.
 */

// Keep this mirror in sync with formatCurrency in utils/format.ts (the module
// itself is React-Native-free up to this function, but importing it pulls
// date-fns etc.; the logic is small and identical by construction).
const TWO_DECIMAL_CURRENCIES = new Set(['USD', 'GBP', 'AED', 'SAR', 'QAR', 'AUD', 'CAD', 'MYR']);
function formatCurrency(amount: number, currencyCode: string, locale = 'en-NP'): string {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const code = (currencyCode || 'NPR').toUpperCase();
  const useDecimals = TWO_DECIMAL_CURRENCIES.has(code) && Math.abs(safe) < 1000;
  const digits = useDecimals ? 2 : 0;
  const scale = Math.pow(10, digits);
  const rounded = Math.sign(safe) * Math.round(Math.abs(safe) * scale) / scale || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(rounded);
  } catch {
    return `${code} ${rounded.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }
}

// Keep this mirror in sync with compactMoney in utils/format.ts (threshold
// applies to the ROUNDED value: 999.6 → "1k", never "1000").
function compactMoney(amount: number): string {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe);
  if (Math.abs(rounded) >= 1000) {
    const k = rounded / 1000;
    return `${Math.abs(k) >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return String(rounded);
}

let pass = 0;
let fail = 0;
function check(name: string, actual: string, expected: string) {
  // Intl inserts non-breaking spaces (U+00A0) between code and number —
  // normalize so comparisons test the digits, not the space flavor.
  const norm = (s: string) => s.replace(/\u00A0/g, ' ');
  if (norm(actual) === norm(expected)) {
    pass += 1;
    console.log(`  PASS  ${name} → "${actual}"`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} → "${actual}" (expected "${expected}")`);
  }
}

console.log('== rounding semantics (USD — 2 decimals under 1,000) ==');
check('0.00', formatCurrency(0.00, 'USD'), '$0.00');
check('0.40', formatCurrency(0.40, 'USD'), '$0.40');
check('0.49', formatCurrency(0.49, 'USD'), '$0.49');
check('0.50', formatCurrency(0.50, 'USD'), '$0.50');
check('0.99', formatCurrency(0.99, 'USD'), '$0.99');
check('10.49', formatCurrency(10.49, 'USD'), '$10.49');
check('10.50', formatCurrency(10.50, 'USD'), '$10.50');
check('10.99', formatCurrency(10.99, 'USD'), '$10.99');
check('451.73', formatCurrency(451.73, 'USD'), '$451.73');
check('449.115', formatCurrency(449.115, 'USD'), '$449.12'); // half away from zero on cents
check('999.99', formatCurrency(999.99, 'USD'), '$999.99');
check('1000+ whole units: 1726.27', formatCurrency(1726.27, 'USD'), '$1,726');
check('1000+ whole units: 3042.22', formatCurrency(3042.22, 'USD'), '$3,042');
check('1000+ whole units: 371265.49', formatCurrency(371265.49, 'USD'), '$371,265');

console.log('== cross-currency collapse fixed (INR → USD display) ==');
check('INR 40 → $0.42', formatCurrency(40 / 94.84, 'USD'), '$0.42');
check('INR 168 → $1.77', formatCurrency(168 / 94.84, 'USD'), '$1.77');
check('INR 195 → $2.06', formatCurrency(195 / 94.84, 'USD'), '$2.06');
check('INR 225 → $2.37', formatCurrency(225 / 94.84, 'USD'), '$2.37');

console.log('== negatives (half away from zero, no -0) ==');
check('-451.73', formatCurrency(-451.73, 'USD'), '-$451.73');
check('-449.11', formatCurrency(-449.11, 'USD'), '-$449.11');
check('-0.40', formatCurrency(-0.40, 'USD'), '-$0.40');
check('-0.004', formatCurrency(-0.004, 'USD'), '$0.00');
check('-1726.27', formatCurrency(-1726.27, 'USD'), '-$1,726');

console.log('== null/undefined/NaN safety ==');
check('NaN', formatCurrency(NaN, 'USD'), '$0.00');
check('undefined', formatCurrency(undefined as unknown as number, 'USD'), '$0.00');
check('null', formatCurrency(null as unknown as number, 'USD'), '$0.00');
check('Infinity', formatCurrency(Infinity, 'USD'), '$0.00');

console.log('== all supported currencies ==');
check('MYR small 4.06', formatCurrency(4.06, 'MYR'), 'MYR 4.06');
check('MYR 3042.22', formatCurrency(3042.22, 'MYR'), 'MYR 3,042');
check('AUD 451.73', formatCurrency(451.73, 'AUD'), 'A$451.73');
check('CAD 449.11', formatCurrency(449.11, 'CAD'), 'CA$449.11');
check('JPY 50128.40', formatCurrency(50128.40, 'JPY'), '¥50,128');
check('KRW 37075.21', formatCurrency(37075.21, 'KRW'), '₩37,075');
check('INR 3042.22', formatCurrency(3042.22, 'INR'), '₹3,042');
check('NPR 3042.22', formatCurrency(3042.22, 'NPR'), 'NPR 3,042');
check('GBP small 12.49', formatCurrency(12.49, 'GBP'), '£12.49');
check('GBP 2049.61', formatCurrency(2049.61, 'GBP'), '£2,050');
check('QAR small 3.64', formatCurrency(3.64, 'QAR'), 'QAR 3.64');
check('QAR 3042.22', formatCurrency(3042.22, 'QAR'), 'QAR 3,042');
check('AED 3042.22', formatCurrency(3042.22, 'AED'), 'AED 3,042');
check('SAR 3042.22', formatCurrency(3042.22, 'SAR'), 'SAR 3,042');
// XXX is a valid ISO "no currency" code — Intl renders the generic ¤ sign
// instead of throwing; safe fallback either way.
check('bad code falls back', formatCurrency(1726.27, 'XXX'), '¤1,726');

console.log('== compactMoney (chart labels) ==');
check('compact 999.6', compactMoney(999.6), '1k');
check('compact 1726.27', compactMoney(1726.27), '1.7k');
check('compact 451.73', compactMoney(451.73), '452');
check('compact 23456', compactMoney(23456), '23.5k');
check('compact 123456', compactMoney(123456), '123k');
check('compact -451.73', compactMoney(-451.73), '-452');

console.log('== totals-before-rounding invariant ==');
const items = [10.49, 10.49, 10.49];
const preciseTotal = items.reduce((s, v) => s + v, 0); // 31.47
check('sum(10.49×3) displays as', formatCurrency(preciseTotal, 'USD'), '$31.47');
const wrongWay = items.reduce((s, v) => s + Math.round(v), 0); // 30 — anti-pattern
console.log(`  NOTE  anti-pattern (round-then-sum) would give ${wrongWay} — not used anywhere`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
