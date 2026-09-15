/* Parser smoke-test for services/receiptOcr.ts (pure functions only).
 * Run: node scripts/test-receipt-ocr.cjs
 * Transpiles the service with the project's TypeScript compiler (stripping
 * native imports via a stub module) and asserts fixtures against the
 * resulting pure JS functions. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const srcPath = path.join(__dirname, '..', 'services', 'receiptOcr.ts');
let src = fs.readFileSync(srcPath, 'utf8');

// Replace the native import with a stub that only scanReceipt uses (not under
// test); app constants/types are stubbed so transpile can run standalone.
src = src
  .replace(/import TextRecognition[\s\S]*?from '@\/react-native-ml-kit\/text-recognition';/,
    'const TextRecognition = { recognize: async () => { throw new Error("stub"); } };')
  .replace(/import \{ CURRENCIES, CURRENCY_DETAILS \} from '@\/constants\/app';/,
    `const CURRENCIES = ['NPR','INR','USD','QAR','GBP','AED','SAR','MYR','KRW','JPY','AUD','CAD'];
const CURRENCY_DETAILS = { NPR:{symbol:'Rs.'}, INR:{symbol:'₹'} };`)
  .replace(/import \{ PaymentMethod \} from '@\/types';/, 'const PaymentMethod = undefined;');

// Strip path aliases for the compiler host and transpile to CommonJS.
const transpiled = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

// Evaluate the transpiled CommonJS in a sandbox and pull the exports.
const sandbox = { exports: {} };
new Function('exports', 'require', 'module', transpiled)(
  sandbox.exports, () => null, { exports: sandbox.exports },
);
const api = sandbox.exports;

// ── Fixtures ────────────────────────────────────────────────────────────────
// Helpers to build TextRecognitionResult-shaped fixtures.
function line(text, top, height) {
  return { text, frame: { top, left: 0, width: 200, height }, elements: [], recognizedLanguages: [] };
}
function result(lines) {
  // One block containing all lines preserves reading order like ML Kit.
  return { text: lines.map((l) => l.text).join('\n'), blocks: [{ text: '', lines, recognizedLanguages: [] }] };
}

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`); }
}

// 1. NPR thermal receipt: Rs prefix, rupee-style trailing slash, keyword कुल.
{
  const r = result([
    line('Bhatbhateni Super Market', 0, 24),
    line('Kathmandu, Nepal', 30, 12),
    line('Date: 05/09/2026 Time: 10:30 AM', 60, 12),
    line('Momo 2 x 250', 150, 12),
    line('Sub Total Rs 500.00', 300, 12),
    line('TOTAL Rs 565.00/-', 340, 14),
    line('Cash Rs 600.00', 370, 12),
    line('Change Rs 35.00', 390, 12),
  ]);
  check('NPR amount', api.parseReceiptAmount(r), 565);
  check('NPR currency (Rs + Nepal)', api.detectReceiptCurrency(r.text, 'NPR'), 'NPR');
  check('NPR date (05/09/2026 day-first)', api.extractReceiptDate(r, 'NPR'), '2026-09-05');
  check('NPR time', api.extractReceiptTime(r), '10:30 AM');
  check('NPR merchant', api.extractMerchant(r), 'Bhatbhateni Super Market');
  check('NPR category (mart → Groceries)', api.guessCategoryName(api.extractMerchant(r), r.text), 'Groceries');
  check('NPR payment (paid in cash)', api.detectPaymentMethod(r), 'Cash');
}

// 2. USD restaurant: TOTAL vs SUBTOTAL vs CHANGE traps, 12-hour date.
{
  const r = result([
    line('STARBUCKS COFFEE', 0, 30),
    line('Store #1234, Seattle WA', 34, 12),
    line('09/05/2026 02:15 PM', 70, 12),
    line('Latte', 140, 12),
    line('Subtotal $12.50', 280, 12),
    line('Tax $1.13', 300, 12),
    line('TOTAL $13.63', 330, 14),
    line('Change Due $6.37', 370, 12),
  ]);
  check('USD amount (TOTAL beats CHANGE)', api.parseReceiptAmount(r), 13.63);
  check('USD currency', api.detectReceiptCurrency(r.text, 'NPR'), 'USD');
  check('USD date (09/05 month-first bias)', api.extractReceiptDate(r, 'USD'), '2026-09-05');
  check('USD time (24h 02:15 → 2:15 PM)', api.extractReceiptTime(r), '2:15 PM');
  check('USD merchant', api.extractMerchant(r), 'STARBUCKS COFFEE');
  check('USD category', api.guessCategoryName('STARBUCKS COFFEE', r.text), 'Food & Dining');
  check('USD payment unstated', api.detectPaymentMethod(r), null);
}

// 3. Card payment + continental decimal.
{
  const r = result([
    line('SHELL PETROL', 0, 26),
    line('15-01-2026', 50, 12),
    line('Diesel 12.345 L', 120, 12),
    line('TOTAL RM 95.40', 300, 14),
    line('VISA CARD', 330, 12),
  ]);
  check('MYR amount', api.parseReceiptAmount(r), 95.4);
  check('Card detection', api.detectPaymentMethod(r), 'Card');
  check('Petrol category', api.guessCategoryName('SHELL PETROL', r.text), 'Transport');
}

// 4. Amount token formats.
check('token 1,234.56', api.parseAmountToken('1,234.56'), 1234.56);
check('token 1.234,56', api.parseAmountToken('1.234,56'), 1234.56);
check('token 1234/-', api.parseAmountToken('1234/-'), 1234);
check('token Rs 1,234.56', api.parseAmountToken('Rs 1,234.56'), 1234.56);
check('token ₹999', api.parseAmountToken('₹999'), 999);
check('token rejects multi-sep', api.parseAmountToken('12.345.678,9'), null);
check('token rejects alpha', api.parseAmountToken('ABC123'), null);
check('token 1 234 space-grouped', api.parseAmountToken('1 234'), 1234);

// 5. Date sanity: future dates rejected (matches the future-date lock migration).
{
  const future = result([line('Date: 05/09/2030', 50, 12)]);
  check('future date rejected', api.extractReceiptDate(future, 'NPR'), null);
}

// 6. Rupee ambiguity: 'Rs.' with NPR preference → NPR; with USD → null.
check('Rs bias NPR', api.detectReceiptCurrency('Total Rs 500', 'NPR'), 'NPR');
check('Rs bias INR', api.detectReceiptCurrency('Total Rs 500', 'INR'), 'INR');
check('Rs bias USD → null', api.detectReceiptCurrency('Total Rs 500', 'USD'), null);

// 7. POS receipts whose grand-total number is followed by trailing words
//    ('168.00 NR' / 'Rs. 168.00 ONLY') — the end-anchored parser used to miss
//    these while 'TOTAL ITEMS 3' / 'TOTAL TAX 3.00' won the labeled scan with
//    the item count (field-reported bug: a Rs 168 receipt scanned as 3).
{
  const r = result([
    line('KALANKI DEPARTMENTAL STORE', 0, 24),
    line('Date: 11/09/2026', 30, 12),
    line('Momo 1 x 120.00', 120, 12),
    line('Chowmein 2 x 24.00', 140, 12),
    line('TOTAL ITEMS 3', 260, 12),
    line('TOTAL TAX 3.00', 280, 12),
    line('TOTAL AMOUNT: 168.00 NR', 300, 14),
    line('CASH 200.00', 330, 12),
    line('CHANGE 32.00', 350, 12),
  ]);
  check('trailing-word total beats ITEMS/TAX lines', api.parseReceiptAmount(r), 168);
  check('currency from NR code', api.detectReceiptCurrency(r.text, 'NPR'), 'NPR');
}
{
  const r = result([
    line('STORE A', 0, 24),
    line('TOTAL QTY 3', 200, 12),
    line('GRAND TOTAL : Rs. 168.00 ONLY', 240, 14),
  ]);
  check('ONLY-suffixed total beats QTY line', api.parseReceiptAmount(r), 168);
}
check('INCL. TAX total stays eligible', api.parseReceiptAmount(result([
  line('STORE B', 0, 24),
  line('TOTAL INCL. TAX 168.00', 200, 14),
])), 168);
check('line ending in a date not swallowed as year', api.parseReceiptAmount(result([
  line('STORE C', 0, 24),
  line('BILL TOTAL 15/01/2025', 200, 12),
  line('AMOUNT DUE 168', 240, 14),
])), 168);
check('genuine amount 3 still parses as 3', api.parseReceiptAmount(result([
  line('TEA STALL', 0, 24),
  line('TOTAL 3', 200, 14),
])), 3);

// 8. Bills labeled GROSS/NET instead of TOTAL (field-reported: a Rs 168 bill
//    labeled 'GROSS AMT' scanned as nothing — 'gross' was not a known label).
//    NET outranks GROSS when both appear (GROSS is pre-discount, NET is the
//    payable), and NET/GROSS WT (weight) lines never read as amounts.
{
  const r = result([
    line('STORE G', 0, 24),
    line('MOMO 120.00', 120, 12),
    line('GROSS 168.00', 290, 14),
    line('CASH 200.00', 330, 12),
  ]);
  check('GROSS-only bill parses', api.parseReceiptAmount(r), 168);
  check('GROSS AMT label', api.parseReceiptAmount(result([
    line('STORE H', 0, 24),
    line('GROSS AMT: 168.00', 200, 14),
  ])), 168);
  check('NET beats GROSS when both present (payable)', api.parseReceiptAmount(result([
    line('STORE I', 0, 24),
    line('GROSS 218.00', 180, 12),
    line('DISCOUNT 50.00', 210, 12),
    line('NET 168.00', 240, 14),
  ])), 168);
  check('NET WT weight line never reads as amount', api.parseReceiptAmount(result([
    line('GROCERY MART', 0, 24),
    line('RICE NET WT 500 G', 120, 12),
  ])), null);
  check('GROSS WT weight line excluded too', api.parseReceiptAmount(result([
    line('GROCERY MART', 0, 24),
    line('GROSS WT 500 G', 120, 12),
  ])), null);
  check('strong TOTAL outranks weak GROSS', api.parseReceiptAmount(result([
    line('STORE J', 0, 24),
    line('TOTAL 50.00', 250, 12),
    line('GROSS 168.00', 180, 12),
  ])), 50);
}

// 9. Dot-separated times/dates are not amounts (field case: a bill's printed
//    TIME 14.09.57 scanned as amount 140957 and beat the real GROSS total
//    when OCR misread 'GROSS' → 'CROSS' and the fallback decided).
check('time token 14.09.57 rejected', api.parseAmountToken('14.09.57'), null);
check('bad grouping 1.409.57 rejected', api.parseAmountToken('1.409.57'), null);
check('European grouping 1.234.567 kept', api.parseAmountToken('1.234.567'), 1234567);
check('GROSS bill with printed TIME parses the total', api.parseReceiptAmount(result([
  line('KALANKI STORE', 0, 24),
  line('MOMO 120.00', 120, 12),
  line('GROSS 168.00', 290, 14),
  line('TIME 14.09.57', 330, 12),
])), 168);
check('misread GROSS + TIME: fallback still picks 168', api.parseReceiptAmount(result([
  line('KALANKI STORE', 0, 24),
  line('MOMO 120.00', 120, 12),
  line('CROSS 168.00', 290, 14),
  line('TIME 14.09.57', 330, 12),
])), 168);
check('bare bill number skipped in fallback', api.parseReceiptAmount(result([
  line('STORE Q', 0, 24),
  line('ITEM 50.00', 200, 12),
  line('BILL NO 140957', 300, 12),
  line('TOTAL 168.00', 340, 14),
])), 168);
check('legit large amount with separators still parses', api.parseAmountToken('1,40,957'), 140957);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
