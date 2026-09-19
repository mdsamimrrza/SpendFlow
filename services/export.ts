import '@/utils/polyfills';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { buildRateResolver, type ActiveRateWindow } from '@/services/exchange';
import { Expense, UserProfile } from '@/types';
import { formatMoney, groupByCategory } from '@/utils/format';

function generateExportFileName(expenses: Expense[], ext: 'pdf' | 'xlsx' | 'csv'): string {
  const now = new Date();
  const months = Array.from(new Set(expenses.map((e) => e.date?.slice(0, 7)))).filter(Boolean);

  if (months.length === 1) {
    const [year, month] = months[0].split('-');
    const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', { month: 'long' });
    return `SpendFlow-Statement-${monthName}-${year}.${ext}`;
  }

  if (months.length > 1) {
    const sorted = [...months].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    return `SpendFlow-Statement-${start}-to-${end}.${ext}`;
  }

  const todayStr = now.toISOString().slice(0, 10);
  return `SpendFlow-Statement-${todayStr}.${ext}`;
}

/**
 * Neutralizes spreadsheet formula injection: a user-controlled value starting
 * with =, +, -, @, tab, or CR would otherwise execute as a formula when the
 * exported CSV/XLSX is opened in Excel/Sheets. Prefixing with a single quote
 * keeps the text intact but inert. Numeric amount cells never pass through here.
 */
function sanitizeSpreadsheetCell(value: unknown): string {
  const text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

/** Escapes user-controlled text before it is embedded in the PDF's HTML. */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Category icons are stored as lucide icon names for default categories
// ('home', 'landmark', 'car'…) and as emojis for custom ones. Exports can't
// render lucide names — map them to emojis; unknown names fall back to 💳.
const ICON_EMOJI: Record<string, string> = {
  utensils: '🍽️', food: '🍲', car: '🚗', transport: '🚗', fuel: '⛽',
  film: '🎬', entertainment: '🎬', 'heart-pulse': '🩺', medical: '🩺',
  zap: '⚡', utilities: '💡', 'shopping-bag': '🛍️', shopping: '🛍️',
  plane: '✈️', travel: '✈️', 'graduation-cap': '🎓', education: '🎓',
  tag: '🏷️', other: '💳', home: '🏠', rent: '🏠', house: '🏠',
  landmark: '🏦', loan: '🏦', bank: '🏦', briefcase: '💼', coins: '🪙',
  building: '🏢', 'trending-up': '📈', gift: '🎁', banknote: '💵',
  wallet: '👛', 'credit-card': '💳', 'piggy-bank': '🐷', coffee: '☕',
  dumbbell: '🏋️', pet: '🐾', pets: '🐾', baby: '👶', subscription: '🔄',
  insurance: '🛡️', savings: '🐷', phone: '📱', internet: '🌐', gym: '🏋️',
};
function categoryIcon(raw: string): string {
  if (!raw) return '💳';
  // Emoji / pictograph already? Pass through ONLY when the whole string is
  // pictographic (plus joiners/variation selectors) — an unanchored test let
  // arbitrary text like '=cmd😀' ride through to export cells.
  if (/^(?:[\u200D\uFE0F]|\p{Extended_Pictographic})+$/u.test(raw)) return raw;
  return ICON_EMOJI[raw.trim().toLowerCase()] ?? '💳';
}

function rowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
}

// ── Hermes-safe base64 ──────────────────────────────────────────────────────
// The old CSV path used btoa(unescape(encodeURIComponent(x))) — Hermes has no
// `unescape`, and the Excel path used blob.arrayBuffer() — RN's Blob polyfill
// doesn't implement it. Both threw BEFORE the save dialog ever opened (silent
// failure: no file, and the message never reached the user). These two helpers
// are pure JS and work in every RN runtime.
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array | number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += has1 ? B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += has2 ? B64_ALPHABET[b2 & 63] : '=';
  }
  return out;
}

function utf8ToBase64(str: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return bytesToBase64(bytes);
}

// Blob → base64 without relying on RN's incomplete Blob polyfill (RN's Blob
// class has NO arrayBuffer()/text()). Preferred path: RN core's native
// FileReaderModule accepts the blob's internal `data` and returns a data: URL;
// strip the prefix and the base64 is ready for the SAF write. Fallbacks: the
// WHATWG Response polyfill RN ships, then a future Blob.arrayBuffer.
async function blobToBase64(blob: Blob): Promise<string> {
  const anyBlob = blob as unknown as { arrayBuffer?: () => Promise<ArrayBuffer>; data?: unknown };
  // 1) RN core's native FileReaderModule — reads the blob's internal `data`
  //    and returns a data: URL. Guarded: if it rejects or is absent we fall
  //    through instead of failing the whole export.
  try {
    const nativeFR = (NativeModules as Record<
      string,
      { readAsDataURL?: (data: unknown) => Promise<string> } | undefined
    >)?.FileReaderModule;
    if (nativeFR?.readAsDataURL && anyBlob.data) {
      const dataUrl = await nativeFR.readAsDataURL(anyBlob.data);
      const comma = dataUrl.indexOf(',');
      if (comma >= 0) return dataUrl.slice(comma + 1);
    }
  } catch {
    // fall through to the JS-side readers
  }
  // 2) WHATWG Response polyfill (RN ships one) can read a Blob body.
  const Res = (globalThis as {
    Response?: new (body?: Blob) => { arrayBuffer: () => Promise<ArrayBuffer> };
  }).Response;
  if (Res) {
    return bytesToBase64(new Uint8Array(await new Res(blob).arrayBuffer()));
  }
  // 3) A future runtime may add Blob.arrayBuffer after all.
  if (typeof anyBlob.arrayBuffer === 'function') {
    return bytesToBase64(new Uint8Array(await anyBlob.arrayBuffer()));
  }
  throw new Error('This build cannot read the generated spreadsheet — reload the app.');
}

function downloadWebFile(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/** Android: the SAF folder the user granted ONCE (typically Downloads). The
 *  underlying OPEN_DOCUMENT_TREE grant is persistable, so it stays valid
 *  across restarts — every later export writes there with zero prompts. */
const EXPORT_DIR_KEY = '@spendflow_export_directory';

async function safWriteFile(
  directoryUri: string,
  fileName: string,
  mimeType: string,
  base64Content: string,
) {
  const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    directoryUri,
    fileName,
    mimeType,
  );
  await FileSystem.writeAsStringAsync(newFileUri, base64Content, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Saves the file on Android into the remembered SAF folder (no prompts after
 * the first grant — pick Downloads once and every export lands there
 * silently), prompting only when no valid grant exists yet. iOS and the
 * picker-declined case fall back to the system share/save sheet.
 * Returns 'saved' when a copy was written into the granted folder, 'shared'
 * when the system share/save sheet was opened (a dismiss there is a normal
 * cancel), so callers can tell the user what actually happened.
 */
async function saveOrShareFile(
  fileUri: string,
  fileName: string,
  mimeType: string,
  base64Content?: string,
): Promise<'saved' | 'shared'> {
  // When the caller hands us base64 (PDF/CSV/XLSX), write it into OUR cache
  // first: expo-print's output lives in the host-app cache (Expo Go), which
  // both expo-file-system and expo-sharing refuse to touch ("isn't readable")
  // because their permission gate only whitelists this app's sandboxed dirs.
  // Our own cache file passes the gate for both the SAF write and the share.
  let readableUri = fileUri;
  if (base64Content && Platform.OS === 'android') {
    readableUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(readableUri, base64Content, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    let content = base64Content;
    if (!content) {
      content = await FileSystem.readAsStringAsync(readableUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    // 1. Silent save to the folder the user already granted.
    const savedDir = await AsyncStorage.getItem(EXPORT_DIR_KEY).catch(() => null);
    if (savedDir) {
      try {
        await safWriteFile(savedDir, fileName, mimeType, content);
        return 'saved';
      } catch {
        // Persisted grant was revoked (system cleanup / restored device) —
        // forget it and fall through to a fresh one-time prompt.
        await AsyncStorage.removeItem(EXPORT_DIR_KEY).catch(() => undefined);
      }
    }

    // 2. One-time grant; the picker preselects Downloads (hint honored on
    //    Android 11+, ignored on older versions).
    let promptDeclined = false;
    try {
      let hint: string | null = null;
      try {
        hint = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      } catch {
        hint = null;
      }
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
        hint,
      );
      if (permissions.granted) {
        await AsyncStorage.setItem(EXPORT_DIR_KEY, permissions.directoryUri).catch(() => undefined);
        await safWriteFile(permissions.directoryUri, fileName, mimeType, content);
        return 'saved';
      }
      promptDeclined = true;
    } catch (err) {
      console.warn('StorageAccessFramework save error, falling back to share:', err);
    }

    // The user said no to saving — offering the share sheet is fine, but a
    // failing or dismissed sheet must never surface as "Export Failed".
    if (promptDeclined) {
      try {
        await Sharing.shareAsync(readableUri, { mimeType, dialogTitle: `Save ${fileName}` });
      } catch (err) {
        console.warn('Share after declined folder prompt failed:', err);
      }
      return 'shared';
    }
  }

  // 3. iOS: system share/save sheet. Closing the sheet is a normal cancel.
  try {
    await Sharing.shareAsync(readableUri, {
      mimeType,
      dialogTitle: `Save ${fileName}`,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/cancel|dismiss|abort/i.test(msg)) throw err;
  }
  return 'shared';
}

// ── 1. CSV EXPORT ──
export async function exportCsv(expenses: Expense[]) {
  const fileName = generateExportFileName(expenses, 'csv');
  const rows = [
    ['Date', 'Type', 'Time', 'Amount', 'Currency', 'Category', 'Payment Method', 'Description', 'Notes'],
    ...expenses.map((expense) => [
      expense.date,
      expense.type || 'expense',
      expense.time || '',
      String(expense.amount),
      sanitizeSpreadsheetCell(expense.currency),
      sanitizeSpreadsheetCell(expense.categories?.name ?? 'Other'),
      sanitizeSpreadsheetCell(expense.payment_method),
      sanitizeSpreadsheetCell(expense.description ?? ''),
      sanitizeSpreadsheetCell(expense.notes ?? ''),
    ]),
  ];

  // UTF-8 BOM: without it, Windows Excel opens the file with the system ANSI
  // codepage and multi-byte emoji/currency glyphs render as CJK mojibake.
  const csvContent = '\uFEFF' + rowsToCsv(rows);

  if (Platform.OS === 'web') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadWebFile(blob, fileName);
    return 'saved';
  }

  // Native Mobile (Android / iOS)
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const base64Content = utf8ToBase64(csvContent);
  return saveOrShareFile(fileUri, fileName, 'text/csv', base64Content);
}

// ── 2. EXCEL (XLSX) EXPORT ──
export async function exportExcel(
  expenses: Expense[],
  currency = 'NPR',
  activeWindow?: ActiveRateWindow | null,
) {
  const fileName = generateExportFileName(expenses, 'xlsx');
  const resolver = await buildRateResolver(expenses, currency, { activeWindow });
  const summary = groupByCategory(expenses, currency, resolver);
  // Share base = the same converted expense-only totals the summary is built
  // from — never the raw sum of all records (income / mixed currencies would
  // push shares above 100%).
  const totalAmount = summary.reduce((s, item) => s + item.total, 0);

  const expenseRows = [
    [
      { value: 'Date' },
      { value: 'Type' },
      { value: 'Time' },
      { value: 'Amount' },
      { value: 'Currency' },
      { value: 'Category' },
      { value: 'Payment Method' },
      { value: 'Description' },
      { value: 'Notes' },
    ],
    ...expenses.map((expense) => [
      { value: expense.date },
      { value: expense.type || 'expense' },
      { value: expense.time || '' },
      { value: Number(expense.amount) },
      { value: sanitizeSpreadsheetCell(expense.currency) },
      { value: sanitizeSpreadsheetCell(expense.categories?.name ?? 'Other') },
      { value: sanitizeSpreadsheetCell(expense.payment_method) },
      { value: sanitizeSpreadsheetCell(expense.description ?? '') },
      { value: sanitizeSpreadsheetCell(expense.notes ?? '') },
    ]),
  ];

  const summaryRows = [
    [{ value: 'Category' }, { value: 'Total' }, { value: 'Share %' }],
    ...summary.map((item) => [
      { value: sanitizeSpreadsheetCell(`${categoryIcon(item.icon)} ${item.label}`) },
      { value: formatMoney(item.total, currency) },
      { value: `${totalAmount > 0 ? Math.round((item.total / totalAmount) * 100) : 0}%` },
    ]),
  ];

  const writeXlsxFileModule = await import('write-excel-file');
  const writeXlsxFile = writeXlsxFileModule.default;

  const blob = await writeXlsxFile([expenseRows, summaryRows], {
    sheets: ['Expenses Ledger', 'Category Analytics'],
  });
  if (!blob || typeof blob !== 'object') {
    throw new Error('Excel generation returned no file data');
  }

  if (Platform.OS === 'web') {
    downloadWebFile(blob, fileName);
    return 'saved';
  }

  // Native Mobile: Write to named cache file
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  const base64 = await blobToBase64(blob);

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return saveOrShareFile(
    fileUri,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64,
  );
}

// ── 3. PDF EXPORT (COMPREHENSIVE PROFESSIONAL FINANCIAL STATEMENT) ──
export async function exportPdf(
  expenses: Expense[],
  profile?: UserProfile | null,
  currency = 'NPR',
  activeWindow?: ActiveRateWindow | null,
) {
  const fileName = generateExportFileName(expenses, 'pdf');
  const now = new Date();
  // expenses.currency has no DB CHECK constraint — a crafted value must never
  // reach the HTML raw (the header and formatMoney's unknown-currency fallback
  // both interpolate it). Reduce to the 3-letter currency shape; anything
  // else falls back to the caller's currency.
  const safeCurrency = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'NPR';
  currency = safeCurrency;
  const generatedDateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Calculate Aggregates — EXPENSE OUTFLOW ONLY, every record converted to
  // the export currency. The header calls this an expense statement, so
  // income records must not inflate the totals, and every section (outflow,
  // average, payment methods, category shares, budget comparison) must share
  // ONE converted base — mixing raw and converted amounts produced shares
  // like 126% and category sums that didn't add up. The active-window rule
  // matches the screens: in-window rows price live, older rows frozen.
  const resolver = await buildRateResolver(expenses, currency, { activeWindow });
  const toExportCurrency = (e: Expense): number => {
    const curr = /^[A-Za-z]{3}$/.test(e.currency ?? '') ? (e.currency as string) : 'NPR';
    return resolver.convert(Number(e.amount) || 0, curr, currency, e.date);
  };
  const outflowRows = expenses
    .filter((e) => (e.type || 'expense') !== 'income')
    .map((e) => ({ record: e, converted: toExportCurrency(e) }));
  const totalSpent = Math.round(outflowRows.reduce((sum, r) => sum + r.converted, 0));
  const totalTransactions = outflowRows.length;
  const categorySummary = groupByCategory(expenses, currency, resolver);
  const topCategory = categorySummary[0]?.label ?? 'N/A';
  const averageSpent = totalTransactions > 0 ? Math.round(totalSpent / totalTransactions) : 0;

  // ── Budget vs Actual (profile's monthly budget, converted to export currency) ──
  const monthlyBudget = Number(profile?.monthly_budget ?? 0);
  const budgetCurrencyRaw = profile?.budget_currency ?? currency;
  const budgetCurrency = /^[A-Za-z]{3}$/.test(budgetCurrencyRaw)
    ? budgetCurrencyRaw.toUpperCase()
    : currency;
  const budgetConverted =
    monthlyBudget > 0
      ? Math.round(resolver.convert(monthlyBudget, budgetCurrency, currency, now.toISOString().slice(0, 10)))
      : 0;
  const budgetRemaining = budgetConverted - totalSpent;
  // Real usage percentage (no 100 cap) so an over-budget report says 155%,
  // not a misleading 100%. The progress bar width caps separately below.
  const budgetPctUsed =
    budgetConverted > 0 ? Math.round((totalSpent / budgetConverted) * 100) : 0;

  // ── Payment method breakdown (outflow records, converted base) ──
  const KNOWN_METHODS = ['Cash', 'Card', 'UPI', 'Other'];
  const methodTotals = new Map<string, number>();
  for (const { record: e, converted } of outflowRows) {
    const method = KNOWN_METHODS.includes(e.payment_method) ? e.payment_method : e.payment_method || 'Other';
    methodTotals.set(method, (methodTotals.get(method) ?? 0) + converted);
  }
  const methodRows = Array.from(methodTotals.entries())
    .map(([method, total]) => ({
      method,
      total,
      pct: totalSpent > 0 ? Math.round((total / totalSpent) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Category pie (pure CSS conic-gradient — renders in the print WebView) ──
  const PIE_COLORS = ['#0F5C4D', '#2563EB', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5'];
  let pieCumulative = 0;
  const pieStops: string[] = [];
  categorySummary.forEach((item, index) => {
    if (totalSpent <= 0) return;
    const start = pieCumulative;
    pieCumulative = Math.min(100, pieCumulative + (item.total / totalSpent) * 100);
    pieStops.push(`${PIE_COLORS[index % PIE_COLORS.length]} ${start.toFixed(2)}% ${pieCumulative.toFixed(2)}%`);
  });
  const pieGradient = pieStops.length > 0 ? `conic-gradient(${pieStops.join(', ')})` : '#E2E8F0';
  const pieLegend = categorySummary
    .map((item, index) => {
      const percentage = totalSpent > 0 ? Math.round((item.total / totalSpent) * 100) : 0;
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span style="width: 10px; height: 10px; border-radius: 2px; background-color: ${PIE_COLORS[index % PIE_COLORS.length]}; flex-shrink: 0;"></span>
          <span style="font-size: 11px; color: #334155; flex: 1;">${escapeHtml(item.label)}</span>
          <span style="font-size: 11px; font-weight: 700; color: #0F172A;">${percentage}%</span>
        </div>`;
    })
    .join('');
  const paymentRowsHtml = methodRows
    .map(
      (row) => `
        <tr>
          <td><span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: #F1F5F9; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">${escapeHtml(row.method)}</span></td>
          <td style="text-align: right; font-weight: 700; color: #0F172A;">${formatMoney(row.total, currency)}</td>
          <td style="text-align: right; font-weight: 600; color: #0F5C4D;">${row.pct}%</td>
        </tr>`,
    )
    .join('');

  // Render Category Breakdown Rows
  const categoryRowsHtml = categorySummary
    .map((item) => {
      const percentage = totalSpent > 0 ? Math.round((item.total / totalSpent) * 100) : 0;
      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">${escapeHtml(categoryIcon(item.icon))}</span>
              <span style="font-weight: 600; color: #1E293B;">${escapeHtml(item.label)}</span>
            </div>
          </td>
          <td style="text-align: right; font-weight: 700; color: #0F172A;">${formatMoney(item.total, currency)}</td>
          <td style="text-align: right; font-weight: 600; color: #0F5C4D;">${percentage}%</td>
          <td>
            <div style="background-color: #E2E8F0; border-radius: 999px; height: 6px; width: 100%; overflow: hidden;">
              <div style="background-color: #0F5C4D; height: 100%; width: ${percentage}%;"></div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Render Transaction Rows — outflow records only, amounts expressed in the
  // report currency so the ledger reconciles exactly with the totals above.
  const transactionRowsHtml = outflowRows
    .map(({ record: e, converted }, index) => {
      const categoryName = e.categories?.name ?? 'Uncategorized';
      const icon = categoryIcon(e.categories?.icon ?? '');
      const desc = e.description || e.notes || '—';
      const subNotes = e.description && e.notes ? `<div style="font-size: 11px; color: #64748B;">${escapeHtml(e.notes)}</div>` : '';

      return `
        <tr style="background-color: ${index % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="color: #94A3B8; font-size: 11px; font-weight: 600;">#${index + 1}</td>
          <td style="font-weight: 600; color: #334155; white-space: nowrap;">${e.date} ${e.time ? `<span style="font-size: 11px; color: #94A3B8;">${e.time}</span>` : ''}</td>
          <td>
            <span style="font-size: 13px;">${escapeHtml(icon)}</span>
            <span style="font-weight: 600; color: #1E293B;">${escapeHtml(categoryName)}</span>
          </td>
          <td>
            <div style="font-weight: 500; color: #334155;">${escapeHtml(desc)}</div>
            ${subNotes}
          </td>
          <td>
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: #F1F5F9; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase;">${escapeHtml(e.payment_method)}</span>
          </td>
          <td style="text-align: right; font-weight: 800; color: #0F5C4D; white-space: nowrap;">${formatMoney(converted, currency)}</td>
        </tr>
      `;
    })
    .join('');

  const userName = profile?.display_name || 'SpendFlow User';
  const userEmail = profile?.email || '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>SpendFlow Statement</title>
      <style>
        @page {
          size: A4;
          margin: 18mm 15mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0F172A;
          margin: 0;
          padding: 0;
          font-size: 12px;
          line-height: 1.5;
          background-color: #FFFFFF;
        }
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0F5C4D;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .brand-title {
          font-size: 26px;
          font-weight: 900;
          color: #0F5C4D;
          letter-spacing: -0.5px;
          margin: 0;
        }
        .brand-subtitle {
          font-size: 11px;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 2px;
        }
        .meta-box {
          text-align: right;
          font-size: 11px;
          color: #475569;
        }
        .meta-title {
          font-size: 14px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 4px;
        }
        .summary-cards {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }
        .card {
          flex: 1;
          background-color: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 12px;
        }
        .card-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .card-value {
          font-size: 18px;
          font-weight: 800;
          color: #0F5C4D;
          margin-top: 4px;
        }
        .card-subtext {
          font-size: 10px;
          color: #94A3B8;
          margin-top: 2px;
        }
        .section-title {
          font-size: 14px;
          font-weight: 800;
          color: #0F172A;
          margin-top: 20px;
          margin-bottom: 10px;
          border-bottom: 1px solid #E2E8F0;
          padding-bottom: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          background-color: #F1F5F9;
          color: #475569;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 8px 10px;
          text-align: left;
          border-bottom: 1px solid #CBD5E1;
        }
        td {
          padding: 9px 10px;
          border-bottom: 1px solid #E2E8F0;
          vertical-align: middle;
        }
        .footer-note {
          margin-top: 30px;
          padding-top: 12px;
          border-top: 1px dashed #CBD5E1;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #94A3B8;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="header-container">
        <div>
          <h1 class="brand-title">SpendFlow</h1>
          <div class="brand-subtitle">Official Financial Statement</div>
          <div style="margin-top: 10px; font-size: 12px; font-weight: 700; color: #1E293B;">
            Account Holder: <span style="color: #0F5C4D;">${escapeHtml(userName)}</span>
            ${userEmail ? `<span style="font-weight: 400; color: #64748B;"> (${escapeHtml(userEmail)})</span>` : ''}
          </div>
        </div>
        <div class="meta-box">
          <div class="meta-title">EXPENSE REPORT</div>
          <div><strong>Generated:</strong> ${generatedDateStr}</div>
          <div><strong>Currency:</strong> ${escapeHtml(currency)}</div>
          <div><strong>Total Transactions:</strong> ${totalTransactions}</div>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="summary-cards">
        <div class="card">
          <div class="card-label">Total Outflow</div>
          <div class="card-value">${formatMoney(totalSpent, currency)}</div>
          <div class="card-subtext">Across ${totalTransactions} expense records</div>
        </div>
        <div class="card">
          <div class="card-label">Top Category</div>
          <div class="card-value" style="font-size: 15px; color: #1E293B; margin-top: 6px;">${escapeHtml(topCategory)}</div>
          <div class="card-subtext">Highest expenditure sector</div>
        </div>
        <div class="card">
          <div class="card-label">Average Spend</div>
          <div class="card-value" style="color: #2563EB;">${formatMoney(averageSpent, currency)}</div>
          <div class="card-subtext">Per transaction average</div>
        </div>
      </div>

      <!-- Budget vs Actual -->
      ${monthlyBudget > 0 && budgetConverted > 0 ? `
      <div class="section-title">🎯 Budget vs Actual (Monthly)</div>
      <div class="summary-cards">
        <div class="card">
          <div class="card-label">Monthly Budget</div>
          <div class="card-value" style="color: #0F172A;">${formatMoney(budgetConverted, currency)}</div>
          <div class="card-subtext">Set in ${escapeHtml(budgetCurrency)}</div>
        </div>
        <div class="card">
          <div class="card-label">Exported Spending</div>
          <div class="card-value">${formatMoney(totalSpent, currency)}</div>
          <div class="card-subtext">${budgetPctUsed}% of budget used</div>
        </div>
        <div class="card">
          <div class="card-label">${budgetRemaining >= 0 ? 'Remaining' : 'Over Budget'}</div>
          <div class="card-value" style="color: ${budgetRemaining >= 0 ? '#0F5C4D' : '#DC2626'};">${formatMoney(Math.abs(budgetRemaining), currency)}</div>
          <div class="card-subtext">${budgetRemaining >= 0 ? 'Under budget' : 'Exceeded'}</div>
        </div>
      </div>
      <div style="background-color: #E2E8F0; border-radius: 999px; height: 10px; width: 100%; overflow: hidden; margin-bottom: 24px;">
        <div style="background-color: ${budgetPctUsed >= 100 ? '#DC2626' : '#0F5C4D'}; height: 100%; width: ${Math.min(100, budgetPctUsed)}%;"></div>
      </div>
      ` : ''}

      <!-- Category Pie Chart -->
      ${totalSpent > 0 ? `
      <div class="section-title">🥧 Spending by Category</div>
      <div style="display: flex; align-items: center; gap: 28px; margin-bottom: 24px;">
        <div style="position: relative; width: 150px; height: 150px; border-radius: 50%; background: ${pieGradient}; flex-shrink: 0;">
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 92px; height: 92px; border-radius: 50%; background-color: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="font-size: 8px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Total</div>
            <div style="font-size: 12px; font-weight: 800; color: #0F172A;">${formatMoney(totalSpent, currency)}</div>
          </div>
        </div>
        <div style="flex: 1;">${pieLegend}</div>
      </div>
      ` : ''}

      <!-- Category Breakdown -->
      <div class="section-title">📊 Category Breakdown</div>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th style="text-align: right;">Total Spent</th>
            <th style="text-align: right;">Share</th>
            <th style="width: 140px;">Distribution</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRowsHtml || '<tr><td colspan="4" style="text-align:center; color:#94A3B8;">No categorized expenses</td></tr>'}
        </tbody>
      </table>

      <!-- Payment Method Breakdown -->
      ${methodRows.length > 0 ? `
      <div class="section-title">💳 Payment Methods</div>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th style="text-align: right;">Total Spent</th>
            <th style="text-align: right;">Share</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRowsHtml}
        </tbody>
      </table>
      ` : ''}

      <!-- Itemized Ledger -->
      <div class="section-title">🧾 Itemized Transaction Ledger</div>
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Date</th>
            <th>Category</th>
            <th>Description & Notes</th>
            <th>Method</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transactionRowsHtml || '<tr><td colspan="6" style="text-align:center; color:#94A3B8;">No transactions found in this period</td></tr>'}
        </tbody>
      </table>

      <!-- Footer -->
      <div class="footer-note">
        <div>🔒 Verified by SpendFlow Financial Observability & Security Engine</div>
        <div>Page 1 • Auto-Generated Confidential Report</div>
      </div>
    </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return 'shared';
  }

  // Native mobile: render the PDF and ask expo-print for its BASE64 — the
  // native module reads its own output file, so we never touch the print
  // cache URI from JS. On Expo Go especially, that URI lives in the host
  // app's cache and BOTH expo-file-system and expo-sharing reject it
  // ("isn't readable") because their permission gate only whitelists this
  // app's sandboxed dirs. saveOrShareFile writes the base64 into our own
  // cache, which passes the gate for the SAF write and the share sheet.
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) throw new Error('PDF rendering returned no content');
  return saveOrShareFile(`${FileSystem.cacheDirectory}${fileName}`, fileName, 'application/pdf', base64);
}
