import TextRecognition, {
  TextRecognitionResult,
  TextLine,
} from '@react-native-ml-kit/text-recognition';
import { CURRENCIES, CURRENCY_DETAILS } from '@/constants/app';
import { PaymentMethod } from '@/types';

export type ReceiptCurrencyCode = (typeof CURRENCIES)[number];

/**
 * Fields extracted from a receipt image via on-device ML Kit OCR. Every field
 * is best-effort and null when not confidently found — the attach flow must
 * never fail because OCR did.
 */
export interface ReceiptScan {
  /** Grand total amount in the receipt's own currency (never converted). */
  amount: number | null;
  /** Currency guessed from symbols/codes in the text, if unambiguous. */
  currency: ReceiptCurrencyCode | null;
  /** Transaction date as 'YYYY-MM-DD' (only past dates, max 1 year old). */
  date: string | null;
  /** Transaction time in the form's 'h:mm AM/PM' format, if printed. */
  time: string | null;
  /** Merchant/store name — best candidate from the top of the receipt. */
  merchant: string | null;
  /** Generic category label (English) matched against the user's categories. */
  categoryName: string | null;
  /** 'Cash' or 'Card' when the receipt states the tender explicitly. */
  paymentMethod: PaymentMethod | null;
  /** False only when OCR ran and read nothing at all (vs. read-but-unparsed). */
  hasText: boolean;
}

// ── Currency detection ──────────────────────────────────────────────────────

/**
 * Symbol/abbreviation table. CURRENCY_DETAILS symbols alone are insufficient:
 * NPR's app symbol is the ASCII 'Rs.' (not the Devanagari रू printed on
 * receipts), and QAR/SAR share the ﷼ glyph, which cannot be resolved without
 * the user's current currency as tie-breaker.
 */
const CURRENCY_SYMBOL_MATCHES: { code: ReceiptCurrencyCode; patterns: RegExp }[] = [
  // Multi-char and non-ASCII symbols first so '$' can't steal 'A$'/'C$'.
  { code: 'AUD', patterns: /\ba\$|australian\s+dollar/i },
  { code: 'CAD', patterns: /\bc\$|canadian\s+dollar/i },
  { code: 'MYR', patterns: /\brm\b|\bmyr\b|ringgit/i },
  { code: 'KRW', patterns: /₩|\bkrw\b|won\b/i },
  { code: 'JPY', patterns: /¥|\bjpy\b|yen\b/i },
  { code: 'INR', patterns: /₹|\binr\b/ },
  { code: 'GBP', patterns: /£|\bgbp\b|pound/i },
  { code: 'AED', patterns: /د\.?إ|\baed\b|dirham/i },
  { code: 'QAR', patterns: /\bqar\b|qatari/i },
  { code: 'SAR', patterns: /\bsar\b|saudi/i },
  { code: 'USD', patterns: /\$|\busd\b|dollar/i },
  // NPR last: 'Rs'/'रू' are shared with INR contexts, so require NPR hints
  // (code, रू, or 'nepal') to claim it, otherwise 'Rs.' stays ambiguous.
  // 'NRs.' is the unambiguous Nepalese-rupee abbreviation (the 'N' is the
  // country qualifier), so it claims NPR outright like the INR code does.
  { code: 'NPR', patterns: /रू|\bnpr\b|\bnrs?\b|nepal/i },
];

/** Unambiguous 'Rs' without a country hint — could be NPR or INR. */
const AMBIGUOUS_RUPEE = /\brs\.?\b|\brupees\b/i;

/**
 * Guesses the receipt currency from raw text. Tie-breaks the rupee (Rs/रू)
 * toward `preferredCurrency` when it is NPR/INR; the shared QAR/SAR ﷼ glyph
 * resolves toward the user's currency when it is one of them. Returns null
 * when nothing matches or the text stays ambiguous.
 */
export function detectReceiptCurrency(
  text: string,
  preferredCurrency: string,
): ReceiptCurrencyCode | null {
  for (const { code, patterns } of CURRENCY_SYMBOL_MATCHES) {
    if (patterns.test(text)) {
      return code;
    }
  }
  if (AMBIGUOUS_RUPEE.test(text)) {
    if (preferredCurrency === 'NPR' || preferredCurrency === 'INR') {
      return preferredCurrency as ReceiptCurrencyCode;
    }
    return null;
  }
  return null;
}

// ── Amount parsing ──────────────────────────────────────────────────────────

/** Total-due labels, strongest first. */
const TOTAL_KEYWORDS = [
  /grand\s*total/i,
  /net\s*(?:amount|total|payable|due)/i,
  /total\s*(?:amount|due|payable|payable\b)/i,
  /\btotal\b/i,
  /amount\s*due/i,
  /balance\s*due/i,
  /\bpayable\b/i,
  /\bbill\s*(?:amount|total)\b/i,
  /\bto\s*pay\b/i,
];

/** Lines that look like totals but never are (change, tenders, subtotals). */
const NEGATIVE_KEYWORDS =
  /sub\s*total|change|cash\s*tender|tender(ed)?\s*back|discount|savings|rounding\s*(?:up|off|adj)|saved|due\s*change/i;

/**
 * Labeled lines that carry a count or a tax figure, never the grand total —
 * 'TOTAL ITEMS 3' / 'TOTAL QTY 3' / 'TOTAL TAX 3.00'. These end in a digit,
 * so without this filter they win the labeled-total scan whenever the real
 * total line's number is followed by trailing words ('TOTAL 168.00 NR') —
 * the leading cause of misparsed totals on POS receipts. Tax words must sit
 * DIRECTLY beside the total keyword so 'TOTAL INCL. TAX 168' /
 * 'TAX INCLUSIVE TOTAL 168' (genuine grand totals) stay eligible.
 */
const NON_TOTAL_LABELED =
  /\b(?:items?|qty|quantity|pcs|pieces|articles|units)\b|\btotal\s*(?:no\.?\s*of\s*)?(?:tax|gst|cgst|sgst|igst|vat)\b|\b(?:tax|gst|cgst|sgst|igst|vat)\s*total\b/i;

/** A printed date at line end ('… 15/01/2025') — its year is a digit-run that
 *  the end-anchored amount match would swallow as '2025'. */
const DATE_AT_LINE_END = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s*$/;

/**
 * Parses a numeric token in the 12 supported currency formats:
 * '1,234.56' (en), '1.234,56' (continental), '1 234' (space-grouped),
 * '1234/-' (rupee style), 'Rs 1,234.56' (prefix symbol). Returns the numeric
 * value, or null when the token is not a plausible amount.
 */
export function parseAmountToken(token: string): number | null {
  let raw = token.trim();
  // Rupee-style trailing slash: '1234/-' or '1234/-'
  const slashStyle = raw.match(/^([\d,\.\s]+)\/-?$/);
  if (slashStyle) raw = slashStyle[1];

  // Currency prefix/suffix symbols and codes are stripped before parsing.
  raw = raw
    .replace(/[₹$£₩¥﷼]|د\.?إ|रू/g, '')
    .replace(/\b(?:rs|npr|inr|usd|qar|aed|sar|myr|krw|jpy|aud|cad)\b\.?/gi, '')
    .replace(/\ba\$|\bc\$/gi, '')
    .replace(/RM(?=[\d\s])/g, '')
    .trim();

  if (!raw) return null;

  // Reject tokens with multiple decimal separators ('12.345.678') — grouping,
  // not a valid amount.
  const hasDot = (raw.match(/\./g) ?? []).length;
  const hasComma = (raw.match(/,/g) ?? []).length;
  if (hasDot > 1 && hasComma > 1) return null;

  let normalized = raw;
  if (hasComma === 1 && hasDot === 1) {
    // Whichever separator comes LAST is the decimal point.
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (hasComma > 0 && hasDot === 0) {
    // Comma-only: decimal when followed by exactly 2 digits, else grouping.
    const parts = raw.split(',');
    const last = parts[parts.length - 1];
    normalized = parts.length === 2 && last.length === 2
      ? raw.replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (hasDot > 0 && hasComma === 0) {
    // Dot-only: '1.23' stays 1.23, '1.234' → 1234. Multiple dots are an
    // amount only as strict 3-digit European grouping ('1.234.567') — any
    // other shape ('14.09.57', a printed time/date) is not an amount.
    // Field case: a bill's TIME 14.09.57 scanned as amount 140957.
    const parts = raw.split('.');
    if (parts.length === 2) {
      normalized = parts[1].length === 2 ? raw : raw.replace(/\./g, '');
    } else if (parts.slice(1).every((g) => g.length === 3)) {
      normalized = raw.replace(/\./g, '');
    } else {
      return null;
    }
  } else {
    // Space-grouped: '1 234' — verify spacing is grouping, not two numbers.
    const spaced = raw.match(/^[\d]+(\s[\d]{3})+$/);
    if (spaced && !/\d\s+\d/.test(raw.replace(/\s(?=\d{3}\b)/g, ''))) {
      normalized = raw.replace(/\s/g, '');
    } else if (/\s/.test(raw)) {
      return null;
    }
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) return null;
  return value;
}

/**
 * Extracts the amount from a labeled line. Primary: the number at the very
 * end of the line ('TOTAL 1,234.56', 'TOTAL 168/-'). Fallback: the right-most
 * parseable whitespace token — POS totals frequently trail the number with a
 * currency code or the word 'ONLY' ('TOTAL AMOUNT: 168.00 NR',
 * 'GRAND TOTAL : Rs. 168.00 ONLY'), which the end anchor cannot see.
 */
function parseTrailingAmount(line: string): number | null {
  if (!DATE_AT_LINE_END.test(line)) {
    const endMatch = line.match(/(?:[\d,\.\s]+\d)(?:\s*\/?-?)?$/);
    if (endMatch) {
      const value = parseAmountToken(endMatch[0]);
      if (value !== null) return value;
    }
  }
  const tokens = line.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const value = parseAmountToken(tokens[i]);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Finds the grand total on a receipt. Strategy, in order of confidence:
 * 1. Lines containing an explicit total label whose number is the right-most
 *    numeric token, and the LARGEST such value when several labeled totals
 *    exist (grand total beats a 'Total Rs 100' among several).
 * 2. Fallback: the largest plausible amount in the bottom third of the
 *    receipt (where POS systems print the total), if the image has frames.
 */
export function parseReceiptAmount(
  result: TextRecognitionResult,
): number | null {
  const lines = allLines(result);
  if (lines.length === 0) return null;

  let bestLabeled: number | null = null;
  for (const line of lines) {
    if (NEGATIVE_KEYWORDS.test(line.text)) continue;
    if (NON_TOTAL_LABELED.test(line.text)) continue;
    if (!TOTAL_KEYWORDS.some((kw) => kw.test(line.text))) continue;
    const value = parseTrailingAmount(line.text);
    if (value !== null && (bestLabeled === null || value > bestLabeled)) {
      bestLabeled = value;
    }
  }

  if (bestLabeled !== null) return bestLabeled;

  // Weak labels — some bills print only 'GROSS' / 'NET' and never 'TOTAL'
  // (field-reported: a Rs 168 bill labeled 'GROSS AMT' scanned as nothing).
  // Tried only when no strong label exists, because on invoices that print
  // both, GROSS is pre-discount and NET is the payable — so NET outranks
  // GROSS regardless of size. 'NET WT'/'GROSS WT' (weight) lines are
  // excluded: 500 g is not Rs 500.
  const weakScan = (keyword: RegExp): number | null => {
    let best: number | null = null;
    for (const line of lines) {
      if (NEGATIVE_KEYWORDS.test(line.text)) continue;
      if (NON_TOTAL_LABELED.test(line.text)) continue;
      if (/\bwt\b|\bweight\b/i.test(line.text)) continue;
      if (!keyword.test(line.text)) continue;
      const value = parseTrailingAmount(line.text);
      if (value !== null && (best === null || value > best)) {
        best = value;
      }
    }
    return best;
  };
  const net = weakScan(/\bnet\b/i);
  if (net !== null) return net;
  const gross = weakScan(/\bgross\b/i);
  if (gross !== null) return gross;

  // Frame-based bottom-third fallback (frames are optional in the wrapper's
  // result shape — guard for their absence).
  const framed = lines.filter((l): l is TextLine & { frame: { top: number; height: number } } =>
    typeof l.frame?.top === 'number' && typeof l.frame?.height === 'number',
  );
  if (framed.length === 0) return null;

  const maxTop = Math.max(...framed.map((l) => l.frame.top + l.frame.height));
  const bottomStart = maxTop * 0.6;
  let bestBottom: number | null = null;
  for (const line of framed) {
    if (line.frame.top < bottomStart) continue;
    // The bottom third usually contains the tendered amount and change —
    // both LARGER than the total. Without these exclusions the fallback
    // returns the cash paid whenever OCR split the 'TOTAL' label and its
    // number across two lines (field-verified: 168 receipt scanned as 200).
    if (NEGATIVE_KEYWORDS.test(line.text)) continue;
    if (NON_TOTAL_LABELED.test(line.text)) continue;
    if (/\bcash\b|\btender|\bprevious\b|\bwt\b|\bweight\b/i.test(line.text)) continue;
    for (const token of line.text.split(/\s+/)) {
      // Unseparated 6+ digit runs are bill numbers, times or phone fragments —
      // a real total that large always carries separators ('1,40,957').
      if (/^\d{6,}$/.test(token)) continue;
      const value = parseAmountToken(token);
      if (value !== null && (bestBottom === null || value > bestBottom)) {
        bestBottom = value;
      }
    }
  }
  return bestBottom;
}

// ── Date & time parsing ─────────────────────────────────────────────────────

/** Month names/abbreviations as printed: '15 Jan 2025', 'Jan 15, 2025'. */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Currencies whose receipts commonly print DD/MM/YYYY (day first). */
const DAY_FIRST_CURRENCIES = new Set([
  'NPR', 'INR', 'GBP', 'AUD', 'AED', 'QAR', 'SAR', 'MYR', 'JPY',
]);

/**
 * Formats a Y/M/D triple into 'YYYY-MM-DD', returning null for impossible
 * calendar values (month 13, day 32) and for dates in the future or older
 * than one year (receipts are for just-made purchases).
 */
function buildIsoDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const oneYearAgo = new Date(today.getTime() - 365 * 24 * 3600 * 1000);
  if (dt.getTime() > today.getTime() || dt.getTime() < oneYearAgo.getTime()) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Extracts the receipt date as 'YYYY-MM-DD'. Supported printed patterns:
 * YYYY-MM-DD, DD/MM/YYYY (+ YY), MM/DD/YYYY, DD-MMM-YYYY, MMM DD, YYYY.
 * When day/month are both ≤ 12, order is resolved by currency convention
 * (rupee/pound/dirham/yen areas print day-first, USD/CAD month-first);
 * still ambiguous → null rather than guessing wrong.
 */
export function extractReceiptDate(
  result: TextRecognitionResult,
  currencyBias: ReceiptCurrencyCode | null,
): string | null {
  const text = result.text;

  // ISO first — unambiguous.
  const iso = text.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if (iso) {
    const built = buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (built) return built;
  }

  const numeric = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (numeric) {
    let d = Number(numeric[1]);
    let m = Number(numeric[2]);
    let y = Number(numeric[3]);
    if (y < 100) y += 2000;
    if (d > 12 && m <= 12) {
      // Day-first resolved by itself.
      const built = buildIsoDate(y, m, d);
      if (built) return built;
    }
    if (m > 12 && d <= 12) {
      // Month-first resolved by itself.
      const built = buildIsoDate(y, m, d);
      if (built) return built;
    }
    if (d <= 12 && m <= 12) {
      const dayFirst = DAY_FIRST_CURRENCIES.has(currencyBias ?? 'NPR');
      const built = dayFirst
        ? buildIsoDate(y, m, d)
        : buildIsoDate(y, d, m);
      if (built) return built;
    }
  }

  // '15 Jan 2025' / 'Jan 15, 2025'
  const monthName = text.match(
    /\b(\d{1,2})\s*[-\/ ]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[-\/, ]\s*(\d{2,4})\b/i,
  );
  if (monthName) {
    let y = Number(monthName[3]);
    if (y < 100) y += 2000;
    return buildIsoDate(y, MONTHS[monthName[2].toLowerCase()], Number(monthName[1]));
  }
  const monthNameFirst = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[-\/ ]\s*(\d{1,2})\s*[-\/, ]\s*(\d{2,4})\b/i,
  );
  if (monthNameFirst) {
    let y = Number(monthNameFirst[3]);
    if (y < 100) y += 2000;
    return buildIsoDate(y, MONTHS[monthNameFirst[1].toLowerCase()], Number(monthNameFirst[2]));
  }

  return null;
}

/**
 * Extracts the receipt time in 'h:mm AM/PM' (the form's format). Accepts
 * printed 12-hour ('10:30 AM', '10.30 am') and 24-hour ('14:23', '14:23:45')
 * formats; rejects impossible hours/minutes.
 */
export function extractReceiptTime(result: TextRecognitionResult): string | null {
  const text = result.text;
  const twelve = text.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)\b/i);
  if (twelve) {
    let h = Number(twelve[1]);
    const min = Number(twelve[2]);
    if (h >= 1 && h <= 12 && min < 60) {
      if (h === 12) h = 12;
      const suffix = twelve[3].toUpperCase();
      return `${h}:${String(min).padStart(2, '0')} ${suffix}`;
    }
  }
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):(\d{2})(?::\d{2})?\b/);
  if (twentyFour) {
    const h = Number(twentyFour[1]);
    const min = Number(twentyFour[2]);
    if (min < 60) {
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${String(min).padStart(2, '0')} ${suffix}`;
  }
  }
  return null;
}

// ── Merchant extraction ─────────────────────────────────────────────────────

/** Lines that are never the merchant even when large (contact/tax/footer noise). */
const NON_MERCHANT_PATTERNS =
  /gst|vat|tax\s*id|pan|reg(?:\.|istration)?\s*no|tel|phone|mobile|www\.|https?|@[a-z]|\.com|\.net|\.np\b|invoice|bill|receipt|cash\s*memo|customer|copy|thank/i;

/** Digit-heavy lines are amounts/phones, not names. */
function isDigitHeavy(text: string): boolean {
  const digits = (text.match(/\d/g) ?? []).length;
  return digits / text.length > 0.4;
}

/**
 * Finds the merchant name: the tallest text line (OCR frame height is a good
 * proxy for font size) in the top 20% of the receipt that is not contact/
 * tax/footer noise and is not digit-heavy. Falls back to the first clean
 * line of the receipt. Returns null when nothing qualifies.
 */
export function extractMerchant(result: TextRecognitionResult): string | null {
  const lines = allLines(result);
  if (lines.length === 0) return null;

  const framed = lines.filter((l): l is TextLine & { frame: { top: number; height: number } } =>
    typeof l.frame?.top === 'number' && typeof l.frame?.height === 'number' &&
    l.frame.height > 0,
  );

  const headerZone: { text: string; height: number }[] = [];
  if (framed.length > 0) {
    const maxBottom = Math.max(...framed.map((l) => l.frame.top + l.frame.height));
    const headerLimit = maxBottom * 0.2;
    for (const line of framed) {
      if (line.frame.top <= headerLimit) headerZone.push({ text: line.text, height: line.frame.height });
    }
  }
  if (headerZone.length === 0) {
    for (const line of lines.slice(0, 5)) {
      headerZone.push({ text: line.text, height: 0 });
    }
  }

  const clean = headerZone.filter(
    (l) => l.text.trim().length >= 3 && !NON_MERCHANT_PATTERNS.test(l.text) && !isDigitHeavy(l.text),
  );
  if (clean.length === 0) return null;

  const tallest = clean.reduce((a, b) => (b.height > a.height ? b : a));
  const name = tallest.text.replace(/\s{2,}/g, ' ').trim();
  return name.length >= 3 ? name : null;
}

// ── Category & payment guessing ─────────────────────────────────────────────

/**
 * Merchant/full-text keyword table mapped to common user category names.
 * The returned label is matched (case-insensitive substring, either
 * direction) against the user's actual categories at apply-time — no match
 * means null, we never create categories from OCR.
 */
const CATEGORY_KEYWORDS: { category: string; patterns: RegExp }[] = [
  { category: 'Food & Dining', patterns: /caf[eé]|coffee|tea\b|momo|restaurant|kitchen|bistro|bakery|eatery|dhaba|food|pizza|burger|sandwich|hotel\b|dinner|lunch|snack/i },
  { category: 'Groceries', patterns: /grocer|supermarket|super\s*market|mart\b|bazaar|departmental|store\b|provision/i },
  { category: 'Transport', patterns: /petrol|fuel|diesel|gas\s*station|garage|taxi|cab\b|uber|ride|pathao|indrive|bus|train|airline|flight|parking|highway|toll/i },
  { category: 'Health', patterns: /pharmac|medical|clinic|hospital|drug\s*store|apothe|dental|health|lab\b|diagnostic|optic/i },
  { category: 'Shopping', patterns: /shop\b|shopping|boutique|apparel|clothing|fashion|footwear|shoe|jewel|emporium|store\b/i },
  { category: 'Entertainment', patterns: /cinema|movie|theatre|theater|game|entertainment|netflix|spotify|concert|event|ticket/i },
  { category: 'Utilities', patterns: /electric|water\s*bill|internet|broadband|wifi|telecom|ntc|ntc\b|nepal\s*telecom|worldlink|vianet|utility|gas\s*bill/i },
  { category: 'Education', patterns: /school|college|university|tuition|academy|institute|book\s*store|stationery|education/i },
  { category: 'Bills & Fees', patterns: /insurance|emi\b|loan|bank\s*charge|fee\b|fine\b|penalty|renewal|subscription/i },
];

/**
 * Guesses a category label from the merchant name and, as a weaker signal,
 * the full receipt text (e.g. a pharmacy receipt whose header didn't
 * survive OCR but line items mention 'paracetamol'). Returns null on no hit.
 */
export function guessCategoryName(
  merchant: string | null,
  fullText: string,
): string | null {
  if (merchant) {
    for (const { category, patterns } of CATEGORY_KEYWORDS) {
      if (patterns.test(merchant)) return category;
    }
  }
  // Full-text pass is weaker: require the keyword near the top (merchant
  // block) to avoid random matches in line items.
  const topText = fullText.split('\n').slice(0, 10).join('\n');
  for (const { category, patterns } of CATEGORY_KEYWORDS) {
    if (patterns.test(topText)) return category;
  }
  return null;
}

/**
 * Detects the tender type when the receipt states it: 'CASH' → Cash,
 * VISA/Mastercard/debit/credit card → Card, UPI/GPay/PhonePe/eSewa/Khalti
 * (Nepal/India digital wallets) → UPI. Returns null when not stated.
 */
export function detectPaymentMethod(result: TextRecognitionResult): PaymentMethod | null {
  const text = result.text;
  if (/\bcash\b/i.test(text) && !/card/i.test(text)) return 'Cash';
  if (/visa|master\s*card|mastercard|rupay|debit\s*card|credit\s*card|card\s*payment/i.test(text)) return 'Card';
  if (/\bupi\b|gpay|google\s*pay|phonepe|esewa|e-sewa|khalti|ime\s*pay|qris/i.test(text)) return 'UPI';
  return null;
}

// ── Orchestration ───────────────────────────────────────────────────────────

/** Flattens all recognized lines across blocks, in reading order. */
function allLines(result: TextRecognitionResult): TextLine[] {
  const lines: TextLine[] = [];
  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Runs on-device Latin-script OCR on a receipt image and extracts every
 * field it can. Pure best-effort: any failure (native module missing, bad
 * image, unreadable text) returns an all-null scan — the receipt attach
 * flow must never break because OCR did. `preferredCurrency` only breaks
 * the NPR/INR rupee-symbol tie; it never forces the guess.
 */
export async function scanReceipt(
  uri: string,
  preferredCurrency: string,
): Promise<ReceiptScan> {
  const emptyScan: ReceiptScan = {
    amount: null,
    currency: null,
    date: null,
    time: null,
    merchant: null,
    categoryName: null,
    paymentMethod: null,
    hasText: false,
  };
  try {
    const result = await TextRecognition.recognize(uri);
    if (!result || !result.text || !result.text.trim()) return emptyScan;

    if (__DEV__) {
      // Dev-only visibility into what the scanner actually read — misparse
      // reports arrive as screenshots, and the raw lines make them debuggable.
      console.log(
        '[receiptOcr] lines:',
        result.text.replace(/\n+/g, ' | ').slice(0, 400),
      );
    }

    const currency = detectReceiptCurrency(result.text, preferredCurrency);
    const merchant = extractMerchant(result);
    return {
      amount: parseReceiptAmount(result),
      currency,
      date: extractReceiptDate(result, currency),
      time: extractReceiptTime(result),
      merchant,
      categoryName: guessCategoryName(merchant, result.text),
      paymentMethod: detectPaymentMethod(result),
      hasText: true,
    };
  } catch (err) {
    // Most common cause: the installed app binary predates this dependency
    // (the native module isn't linked until a fresh dev-client build).
    console.warn('[receiptOcr] scan failed:', err instanceof Error ? err.message : err);
    return emptyScan;
  }
}
