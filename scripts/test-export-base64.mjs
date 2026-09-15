// One-off verification: proves the pure-JS base64 helpers added to
// services/export.ts match Node's reference UTF-8 → base64 encoding
// (emoji, Devanagari, ₹, quotes, newlines, BOM included).
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../services/export.ts', import.meta.url), 'utf8');

function extract(name) {
  const start = src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} not found in services/export.ts`);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { i = j + 1; break; } }
  }
  // Strip TS annotations so plain Node can run it.
  return src.slice(start, i)
    .replace(/\(bytes: Uint8Array \| number\[\]\)/, '(bytes)')
    .replace(/\(str: string\)/, '(str)')
    .replace(/: number\[\]/g, '')
    .replace(/: string/g, '')
    .replace(/bytes: Uint8Array \| number\[\]/g, 'bytes');
}

const code = [
  "const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';",
  extract('bytesToBase64'),
  extract('utf8ToBase64'),
  'globalThis.bytesToBase64 = bytesToBase64;',
  'globalThis.utf8ToBase64 = utf8ToBase64;',
].join('\n');
(0, eval)(code);

const cases = [
  'hello',
  'café',
  '₹ 1,23,456.78',
  '🍽️ dinner with 🎉',
  'नमस्ते नेपाल',
  'quote"and,comma\nnewline',
  '\uFEFF',
  'a',
  'ab',
  'abc',
  '中文测试',
];

let pass = 0, fail = 0;
for (const s of cases) {
  const expected = Buffer.from(s, 'utf8').toString('base64');
  const got = utf8ToBase64(s);
  if (got === expected) pass++;
  else { fail++; console.log('FAIL', JSON.stringify(s), 'got', got, 'expected', expected); }
}
console.log(`BOM base64: ${utf8ToBase64('\uFEFF')} (expect 77u/ = bytes EF BB BF)`);
console.log(`utf8ToBase64: ${pass} passed, ${fail} failed`);

// ── Simulate the exported CSV first line + the import parser's header read ──
const headerLine = '\uFEFFDate,Type,Time,Amount,Currency,Category,Payment Method,Description,Notes';
const headers = headerLine.replace(/^\uFEFF/, '').split(',').map((h) => h.toLowerCase());
console.log('Import parser sees headers:', headers.join(' | '));
console.log('type column found:', headers.indexOf('type') >= 0 ? 'YES' : 'NO');
