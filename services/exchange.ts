import type { SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// USD per 1 unit of currency. Pegs are exact and permanent — never hit the API for these.
const PEGGED_USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  QAR: 1 / 3.64,
  AED: 1 / 3.6725,
  SAR: 1 / 3.75,
};

// Nepal Rastra Bank peg (in force since 1993): 1 INR = 1.60 NPR, exact and
// permanent. NPR is NOT a floating currency in this app: it never gets
// fetched from a rate API, cached in exchange_rates, or read from historical
// rows. Every NPR rate is derived from the same date's INR rate:
//   usdPerNpr = usdPerInr / 1.6
// INR itself floats against USD normally (live / historical DB / fallback).
export const NPR_PER_INR = 1.6;

// Last-resort approximation when neither DB cache nor the API can answer.
// Pegged currencies (QAR/AED/SAR) are resolved by PEGGED_USD_PER_UNIT instead,
// and NPR is derived from INR (see fallbackUsdPerUnit) — so NPR has no entry
// here by design. Values refreshed 2026-09-16; keep roughly current-era so the
// worst case is a small drift, never the old ~12% INR gap.
const FALLBACK_UNITS_PER_USD: Record<string, number> = {
  USD: 1,
  INR: 95.99,
  QAR: 3.64,
  GBP: 0.742,
  MYR: 4.0844,
  KRW: 1360.36,
  JPY: 155.08,
  AUD: 1.4031,
  CAD: 1.3913,
};

// ── Session rate memory ─────────────────────────────────────────────────────
// Historical rates never change, so they are remembered for the whole session;
// today's rate moves with the market and refreshes after a short TTL. This is
// what makes repeat balance computations instant when switching between the
// Accounts, ExpenseForm, and Transfer screens — memory instead of network.
const RATE_MEMORY_TODAY_TTL_MS = 10 * 60 * 1000;

const memoryRateCache = new Map<string, { rate: number; expiresAt: number }>();

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function rememberRate(currency: string, date: string, rate: number): void {
  memoryRateCache.set(`${currency}|${date}`, {
    rate,
    expiresAt: date >= todayIso() ? Date.now() + RATE_MEMORY_TODAY_TTL_MS : Number.POSITIVE_INFINITY,
  });
  scheduleRateMemorySave();
}

function recallRate(currency: string, date: string): number | null {
  const entry = memoryRateCache.get(`${currency}|${date}`);
  if (!entry) return null;
  if (entry.expiresAt !== Number.POSITIVE_INFINITY && Date.now() > entry.expiresAt) {
    memoryRateCache.delete(`${currency}|${date}`);
    return null;
  }
  return entry.rate;
}

// ── Rate-memory persistence (cold-start latency fix, 2026-09-15) ────────────
// The memory above used to die with the process: EVERY app relaunch re-paid a
// DB round trip (per-date INR rows for NPR users especially) plus a possibly
// 8s live-quote fetch before `useRateResolver` settled — so the dashboard
// skeleton-gated even when the expense cache had painted instantly. Historical
// rates are frozen facts, so the memory is persisted to disk; a relaunch
// answers them locally and the first paint waits on nothing.
const RATE_MEMORY_KEY = '@spen…y_v1';
const RATE_MEMORY_MAX_AGE_DAYS = 400;
const RATE_MEMORY_MAX_ENTRIES = 2500;

type PersistedRateEntry = { r: number; e: number | null }; // null = "never expires"

let rateMemoryLoaded: Promise<void> | null = null;

/** Load the persisted memory ONCE per process; safe to await from every path. */
function ensureRateMemoryLoaded(): Promise<void> {
  if (!rateMemoryLoaded) {
    rateMemoryLoaded = (async () => {
      try {
        const raw = await AsyncStorage.getItem(RATE_MEMORY_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, PersistedRateEntry>;
        const floorDate = new Date(Date.now() - RATE_MEMORY_MAX_AGE_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const now = Date.now();
        for (const [k, v] of Object.entries(parsed)) {
          if (!v || typeof v.r !== 'number' || v.r <= 0) continue;
          const date = k.split('|')[1] ?? '';
          if (date < floorDate) continue;
          const expiresAt = v.e === null ? Number.POSITIVE_INFINITY : v.e;
          if (expiresAt !== Number.POSITIVE_INFINITY && now > expiresAt) continue;
          // Session memory wins over disk if both hold the key.
          if (!memoryRateCache.has(k)) memoryRateCache.set(k, { rate: v.r, expiresAt });
        }
      } catch {
        // Corrupt/absent storage: cold process memory, exactly the old behavior.
      }
    })();
  }
  return rateMemoryLoaded;
}

let rateMemorySaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced best-effort persist after every rememberRate burst. */
function scheduleRateMemorySave(): void {
  if (rateMemorySaveTimer) clearTimeout(rateMemorySaveTimer);
  rateMemorySaveTimer = setTimeout(() => {
    rateMemorySaveTimer = null;
    void (async () => {
      try {
        const floorDate = new Date(Date.now() - RATE_MEMORY_MAX_AGE_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const now = Date.now();
        const alive: Array<[string, { rate: number; expiresAt: number }]> = [];
        for (const [k, v] of memoryRateCache) {
          const date = k.split('|')[1] ?? '';
          if (date < floorDate || (v.expiresAt !== Number.POSITIVE_INFINITY && now > v.expiresAt)) {
            memoryRateCache.delete(k);
            continue;
          }
          alive.push([k, v]);
        }
        if (alive.length > RATE_MEMORY_MAX_ENTRIES) {
          // ISO dates sort chronologically: keep the newest, drop the oldest.
          alive.sort((a, b) => ((a[0].split('|')[1] ?? '') < (b[0].split('|')[1] ?? '') ? 1 : -1));
          alive.length = RATE_MEMORY_MAX_ENTRIES;
        }
        const out: Record<string, PersistedRateEntry> = {};
        for (const [k, v] of alive) out[k] = { r: v.rate, e: v.expiresAt === Number.POSITIVE_INFINITY ? null : v.expiresAt };
        await AsyncStorage.setItem(RATE_MEMORY_KEY, JSON.stringify(out));
      } catch {
        // Best-effort: a failed write just means the next launch is slower, never wrong.
      }
    })();
  }, 800);
}

/**
 * Seed today's floating-currency rates from the app-level live fetch
 * (store/ExchangeRateContext, which every launch performs anyway) so the
 * dashboard's resolver build answers `pair.d >= todayIso()` misses from memory
 * instead of starting a duplicate provider round trip. Input is UNITS PER 1
 * USD (er-api basis); memory stores USD per unit. Pegged currencies and USD
 * are skipped (resolved by constants), NPR by the INR derivation at read time.
 */
export function seedTodayRatesFromUnitsPerUsd(unitsPerUsd: Record<string, number>): void {
  const today = todayIso();
  for (const [ccy, u] of Object.entries(unitsPerUsd)) {
    const c = ccy.toUpperCase();
    if (c === 'USD' || c === 'NPR' || PEGGED_USD_PER_UNIT[c] !== undefined) continue;
    const units = Number(u);
    if (units > 0) rememberRate(c, today, round8(1 / units));
  }
}

/** fetch + JSON with a hard timeout — a hanging provider must never stall a resolver build. */
async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface SnapshotRow {
  currency: string;
  date: string;
  exchange_rate_to_usd?: number | null;
}

export type RateBasis = 'auto' | 'frozen';

/** Local YYYY-MM-DD window of the user's ACTIVE financial cycle. Rows inside
 *  it are priced at today's live rate (active month = live everywhere); rows
 *  before it — even one day before the cycle start — stay frozen at their
 *  transaction-date rate (closed periods = history). */
export interface ActiveRateWindow {
  from: string;
  to: string;
}

export interface RateResolver {
  usdPerUnit(currency: string, date: string, basis?: RateBasis): number;
  convert(amount: number, from: string, to: string, date: string, basis?: RateBasis): number;
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fallbackUsdPerUnit(currency: string): number {
  // NPR is pegged to INR — derive from INR's fallback, never an NPR entry.
  if (currency === 'NPR') {
    const inr = FALLBACK_UNITS_PER_USD['INR'];
    return inr && inr > 0 ? (1 / inr) / NPR_PER_INR : 1;
  }
  const units = FALLBACK_UNITS_PER_USD[currency];
  return units && units > 0 ? 1 / units : 1;
}

function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function createExchangeService(client: SupabaseClient) {
  async function fetchHistoricalUnitsPerUsd(date: string, currency: string): Promise<number | null> {
    // Server-side only. This module is also imported by the backfill script,
    // which runs in Node with real secrets. The EXPO_PUBLIC_ fallback was
    // removed — provider API keys must never be bundled into the client.
    //
    // Tier chain, each timeout-bounded so a hanging provider can never stall
    // the build: Frankfurter (keyless ECB data, covers every fetched
    // currency, weekends resolve to the prior fix) → its .dev mirror →
    // exchangerate.host with the server-side access key when one is present.
    const symbols = encodeURIComponent(currency);
    const candidates: string[] = [
      // api.frankfurter.app is retired (301s to .dev) — call the live host
      // directly, web parity (services/exchange.ts web repo).
      `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=${symbols}`,
      `https://api.frankfurter.app/${date}?from=USD&to=${symbols}`,
    ];
    const accessKey = process.env.EXCHANGE_RATE_HOST_ACCESS_KEY;
    if (accessKey) {
      candidates.push(`https://api.exchangerate.host/${date}?base=USD&symbols=${symbols}&access_key=${accessKey}`);
    }

    for (const url of candidates) {
      const data = (await fetchJsonWithTimeout(url, 8_000)) as
        | { rates?: Record<string, unknown> }
        | null;
      const units = Number(data?.rates?.[currency]);
      if (units > 0) return units;
    }
    return null;
  }

  // One query serves the whole exchange_rates table (writes are restricted to
  // trusted server-side processes, so it stays small), with a short TTL so
  // back-to-back resolver builds — e.g. an NPR account and an INR account —
  // share a single round trip. The limit bounds the payload if the table ever
  // grows unexpectedly.
  let dbRatesAt = 0;
  let dbRatesByCurrency = new Map<string, { date: string; rate: number }[]>();
  async function loadDbRates(): Promise<Map<string, { date: string; rate: number }[]>> {
    if (Date.now() - dbRatesAt < 60_000) return dbRatesByCurrency;
    const { data, error } = await client
      .from('exchange_rates')
      .select('currency, date, rate_to_usd')
      .order('date', { ascending: true })
      .limit(2000);
    if (!error && data) {
      const byCurrency = new Map<string, { date: string; rate: number }[]>();
      for (const row of data as { currency: string; date: string; rate_to_usd: number | null }[]) {
        // Nepal–India peg: stored NPR rows predate the peg and float — never
        // consume them; NPR is always derived from INR.
        if (row.currency === 'NPR') continue;
        const rate = Number(row.rate_to_usd);
        if (!(rate > 0)) continue;
        const list = byCurrency.get(row.currency) ?? [];
        list.push({ date: row.date, rate });
        byCurrency.set(row.currency, list);
      }
      dbRatesByCurrency = byCurrency;
      dbRatesAt = Date.now();
    }
    return dbRatesByCurrency;
  }

  /** Latest rate on/before `date` from an ascending-sorted list (binary search). */
  function nearestDbRate(list: { date: string; rate: number }[] | undefined, date: string): number | null {
    if (!list || list.length === 0) return null;
    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].date <= date) lo = mid + 1;
      else hi = mid - 1;
    }
    return hi >= 0 ? list[hi].rate : null;
  }

  // One live-rates call (primary API, then fallback) answers every remaining
  // currency at once — replaces the old per-currency historical fetches that
  // made balance loading take many seconds.
  let latestAt = 0;
  let latestUnits: Record<string, number> | null = null;
  async function loadLatestUnitsPerUsd(): Promise<Record<string, number> | null> {
    if (latestUnits && Date.now() - latestAt < 5 * 60_000) return latestUnits;
    const primary =
      process.env.EXPO_PUBLIC_EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
    const fallbackApi =
      process.env.EXPO_PUBLIC_EXCHANGE_RATE_FALLBACK_API_URL ||
      'https://api.exchangerate-api.com/v4/latest/USD';
    // Server-side bonus tier: the keyed exchangerate-api.com account serves
    // fresh quotes even when the two free endpoints both fail. The key env var
    // is intentionally not EXPO_PUBLIC_-prefixed so it never reaches the client.
    const keyedUrl = process.env.EXCHANGE_RATE_API_KEY
      ? `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_RATE_API_KEY}/latest/USD`
      : null;
    const urls = keyedUrl ? [primary, fallbackApi, keyedUrl] : [primary, fallbackApi];
    for (const url of urls) {
      const data = (await fetchJsonWithTimeout(url, 8_000)) as
        | { rates?: Record<string, number> }
        | null;
      if (data?.rates && typeof data.rates === 'object') {
        latestUnits = data.rates;
        // Nepal–India peg: never consume a market NPR rate — derive it.
        const inrPerUsd = Number(latestUnits.INR);
        if (Number.isFinite(inrPerUsd) && inrPerUsd > 0) {
          latestUnits.NPR = inrPerUsd * NPR_PER_INR;
        }
        latestAt = Date.now();
        return latestUnits;
      }
    }
    return null;
  }

  async function getRate(currency: string, date: string): Promise<number> {
    const ccy = (currency || 'USD').toUpperCase();
    // Persisted memory must be in place before any recall — one-time await.
    await ensureRateMemoryLoaded();
    // Nepal–India peg: NPR is derived from the same date's INR rate — never
    // fetched, never read from exchange_rates, never upserted.
    if (ccy === 'NPR') {
      const rememberedNpr = recallRate('NPR', date);
      if (rememberedNpr !== null) return rememberedNpr;
      const inr = await getRate('INR', date);
      const nprRate = round8(inr / NPR_PER_INR);
      rememberRate('NPR', date, nprRate);
      return nprRate;
    }
    if (PEGGED_USD_PER_UNIT[ccy] !== undefined) return PEGGED_USD_PER_UNIT[ccy];
    const remembered = recallRate(ccy, date);
    if (remembered !== null) return remembered;
    if (!isIsoDate(date)) return fallbackUsdPerUnit(ccy);

    // CURRENT-rate requests (date >= today) go API-FIRST — web parity
    // (docs/SYNC-STRATEGY §6.1, web fix 2026-09-15): no job refreshes
    // `exchange_rates`, so any row — however recent — can be months old and
    // silently price today's figures with a stale rate (web measured a frozen
    // INR ≈ 95.2 row vs 95.96 live, ~0.7% off every current-value display).
    // Tier order mirrors web exactly: frankfurter (ECB reference) → er-api
    // live → table (offline fallback, any age) → static fallback. DATED
    // requests keep the table-first byte-compat order below, unchanged.
    if (date >= todayIso()) {
      const liveDated = await fetchHistoricalUnitsPerUsd(date, ccy);
      if (liveDated) {
        const rate = round8(1 / liveDated);
        rememberRate(ccy, date, rate);
        return rate;
      }
      const latestUnits = await loadLatestUnitsPerUsd();
      const units = Number(latestUnits?.[ccy]);
      if (units > 0) {
        const rate = round8(1 / units);
        rememberRate(ccy, date, rate);
        return rate;
      }
    }

    const { data: cached } = await client
      .from('exchange_rates')
      .select('rate_to_usd')
      .eq('currency', ccy)
      .eq('date', date)
      .maybeSingle();
    const cachedRate = Number(cached?.rate_to_usd);
    if (cachedRate > 0) {
      rememberRate(ccy, date, cachedRate);
      return cachedRate;
    }

    const units = await fetchHistoricalUnitsPerUsd(date, ccy);
    if (units) {
      const rate = round8(1 / units);
      // Audit run-1: the client is now READ-ONLY on the shared exchange_rates
      // table. It used to best-effort upsert the provider-fetched rate here so
      // the next user got a DB cache hit — but that left a write call to
      // cross-tenant reference data in the shipped bundle, whose only control
      // was a server-side GRANT the repo had twice caught drifting from
      // production. The provider fetch above is the same source either way, and
      // the service-owned backfill (scripts/ + pg_cron) keeps the table warm, so
      // dropping the client write costs a cache hit and removes the surface.
      rememberRate(ccy, date, rate);
      return rate;
    }

    const { data: nearest } = await client
      .from('exchange_rates')
      .select('rate_to_usd')
      .eq('currency', ccy)
      .lte('date', date)
      .order('date', { ascending: false })
      .limit(1);
    const nearestRate = Number(nearest?.[0]?.rate_to_usd);
    if (nearestRate > 0) {
      rememberRate(ccy, date, nearestRate);
      return nearestRate;
    }

    const fallback = fallbackUsdPerUnit(ccy);
    rememberRate(ccy, date, fallback);
    return fallback;
  }

  async function convert(amount: number, fromCurrency: string, toCurrency: string, date: string): Promise<number> {
    const from = await getRate(fromCurrency, date);
    const to = await getRate(toCurrency, date);
    return round2(amount * (from / to));
  }

  async function convertExpense(
    expense: SnapshotRow & { amount: number | string },
    toCurrency: string,
    activeWindow?: ActiveRateWindow | null,
  ): Promise<number> {
    const amount = Number(expense.amount);
    const from = (expense.currency || 'USD').toUpperCase();
    const to = (toCurrency || 'USD').toUpperCase();
    if (from === to || !amount) return amount;
    // Active financial month = live everywhere: rows inside the active cycle
    // window re-price at TODAY's rate on both sides (the frozen snapshot is a
    // transaction-date rate and must not be used for the live basis).
    if (activeWindow && expense.date >= activeWindow.from && expense.date <= activeWindow.to) {
      const t = todayIso();
      const fromRate = await getRate(from, t);
      const toRate = await getRate(to, t);
      return round2((amount * fromRate) / toRate);
    }
    const toRate = await getRate(to, expense.date);
    // NPR rows may carry pre-peg floating snapshots — those are wrong under
    // the fixed 1 INR = 1.60 NPR rule, so NPR never uses a stored snapshot.
    const snapshot = Number(expense.exchange_rate_to_usd);
    if (snapshot > 0 && from !== 'NPR') return round2((amount * snapshot) / toRate);
    const fromRate = await getRate(from, expense.date);
    return round2((amount * fromRate) / toRate);
  }

  async function buildRateResolver(
    rows: SnapshotRow[],
    targetCurrency: string,
    options?: { activeWindow?: ActiveRateWindow | null },
  ): Promise<RateResolver> {
    const target = (targetCurrency || 'USD').toUpperCase();
    const activeWindow = options?.activeWindow ?? null;
    const cache = new Map<string, number>();
    const key = (c: string, d: string) => `${c}|${d}`;
    const missing = new Map<string, { c: string; d: string }>();

    const rowsByTargetDate = new Set<string>();
    for (const row of rows) {
      const ccy = (row.currency || 'USD').toUpperCase();
      const snap = Number(row.exchange_rate_to_usd);
      // Nepal–India peg: NPR snapshots predate the peg — never used; NPR is
      // derived from the same date's INR rate below.
      if (snap > 0 && ccy !== 'NPR') {
        cache.set(key(ccy, row.date), snap);
      } else if (PEGGED_USD_PER_UNIT[ccy] === undefined && ccy !== 'NPR') {
        missing.set(key(ccy, row.date), { c: ccy, d: row.date });
      }
      // NPR is derived from INR, so preload INR for every NPR transaction
      // date rather than falling back to a present-day/static INR rate —
      // but NEVER when an INR snapshot for that date is already seeded above
      // (the memory/DB passes below overwrite, so a stale remembered rate
      // must not clobber the row's own frozen snapshot).
      if (ccy === 'NPR' && !cache.has(key('INR', row.date))) {
        missing.set(key('INR', row.date), { c: 'INR', d: row.date });
      }
      if (ccy !== target) rowsByTargetDate.add(row.date);
    }
    for (const d of rowsByTargetDate) {
      if (PEGGED_USD_PER_UNIT[target] === undefined && target !== 'NPR' && !cache.has(key(target, d))) {
        missing.set(key(target, d), { c: target, d });
      }
      if (target === 'NPR' && !cache.has(key('INR', d))) {
        missing.set(key('INR', d), { c: 'INR', d });
      }
    }

    // Active-window live pricing: rows inside the active cycle resolve at
    // TODAY's rate, so pre-fetch every involved currency at today's date
    // (these d >= today entries are filled by the live-quote pass below and
    // make the in-window conversion fully synchronous afterwards).
    if (activeWindow) {
      const t = todayIso();
      const windowCurrencies = new Set<string>([target]);
      for (const row of rows) windowCurrencies.add((row.currency || 'USD').toUpperCase());
      for (const ccy of windowCurrencies) {
        if (ccy === 'USD' || PEGGED_USD_PER_UNIT[ccy] !== undefined) continue;
        missing.set(key(ccy, t), { c: ccy, d: t });
        if (ccy === 'NPR') missing.set(key('INR', t), { c: 'INR', d: t });
      }
    }

    // Session memory (seeded from disk on first use — see ensureRateMemoryLoaded)
    // answers repeats and yesterday's dates instantly, so a relaunch settles
    // the resolver locally with no DB round trip at all.
    await ensureRateMemoryLoaded();
    for (const [k, pair] of [...missing]) {
      // A snapshot seeded above always wins — never let the device's
      // remembered rate overwrite the row's own frozen snapshot.
      if (cache.has(k)) {
        missing.delete(k);
        continue;
      }
      const remembered = recallRate(pair.c, pair.d);
      if (remembered !== null) {
        cache.set(k, remembered);
        missing.delete(k);
      }
    }

    // Split missing into: live dates (>= today) and historical dates (< today).
    // For live dates (active month uses today's rate): try LIVE API FIRST.
    // For historical dates: DB first (frozen snapshots).
    const liveMissing = new Map(
      [...missing].filter(([, pair]) => pair.d >= todayIso()),
    );
    const historicalMissing = new Map(
      [...missing].filter(([, pair]) => pair.d < todayIso()),
    );

    // 1. LIVE API for today/future dates (active month pricing)
    if (liveMissing.size) {
      const latest = await loadLatestUnitsPerUsd();
      if (latest) {
        for (const [k, pair] of liveMissing) {
          const units = Number(latest[pair.c]);
          if (units > 0) {
            const rate = round8(1 / units);
            cache.set(k, rate);
            rememberRate(pair.c, pair.d, rate);
            liveMissing.delete(k);
          }
        }
      }
      // Any still-missing live dates fall through to DB below
    }

    // 2. DB for historical dates + any live dates the API missed
    const allStillMissing = new Map([...historicalMissing, ...liveMissing]);
    if (allStillMissing.size) {
      const dbRates = await loadDbRates();
      for (const [k, pair] of [...allStillMissing]) {
        if (cache.has(k)) {
          allStillMissing.delete(k);
          continue;
        }
        const nearest = nearestDbRate(dbRates.get(pair.c), pair.d);
        if (nearest !== null) {
          cache.set(k, nearest);
          rememberRate(pair.c, pair.d, nearest);
          allStillMissing.delete(k);
        }
      }
    }

    // Nepal–India peg: any remaining NPR entries derive from the INR rate at
    // the same date (INR entries were filled by the memory/DB/live passes
    // above), so the NPR↔INR cross-rate is exactly 1.60 on every date.
    for (const [k, pair] of [...missing]) {
      if (pair.c !== 'NPR') continue;
      const inr = cache.get(key('INR', pair.d));
      const inrRate = inr && inr > 0 ? inr : fallbackUsdPerUnit('INR');
      cache.set(k, round8(inrRate / NPR_PER_INR));
      missing.delete(k);
    }

    // Anything left falls back to static approximations.
    for (const [k, pair] of missing) {
      cache.set(k, fallbackUsdPerUnit(pair.c));
    }

    const usdPerUnit = (currency: string, date: string, basis: RateBasis = 'auto'): number => {
      const ccy = (currency || 'USD').toUpperCase();
      // 'auto' basis applies the active-month rule: a row inside the active
      // cycle window prices at TODAY's live rate; 'frozen' always resolves at
      // the row's own date (transaction-date debugger / closed periods).
      const effectiveDate =
        basis === 'auto' && activeWindow && date >= activeWindow.from && date <= activeWindow.to
          ? todayIso()
          : date;
      if (ccy === 'NPR') {
        const inr = cache.get(key('INR', effectiveDate));
        const inrRate = inr && inr > 0 ? inr : fallbackUsdPerUnit('INR');
        return round8(inrRate / NPR_PER_INR);
      }
      if (PEGGED_USD_PER_UNIT[ccy] !== undefined) return PEGGED_USD_PER_UNIT[ccy];
      return cache.get(key(ccy, effectiveDate)) ?? fallbackUsdPerUnit(ccy);
    };

    return {
      usdPerUnit,
      convert(amount, from, to, date, basis = 'auto') {
        return round2(amount * (usdPerUnit(from, date, basis) / usdPerUnit(to, date, basis)));
      },
    };
  }

  return { getRate, convert, convertExpense, buildRateResolver };
}

type ExchangeService = ReturnType<typeof createExchangeService>;
let defaultService: ExchangeService | null = null;

// Lazily resolved so Node scripts can import createExchangeService without
// pulling in the React Native supabase client (AsyncStorage).
function service(): ExchangeService {
  if (!defaultService) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { supabase } = require('@/utils/supabase');
    defaultService = createExchangeService(supabase);
  }
  return defaultService;
}

export function getRate(currency: string, date: string): Promise<number> {
  return service().getRate(currency, date);
}

export function convert(amount: number, fromCurrency: string, toCurrency: string, date: string): Promise<number> {
  return service().convert(amount, fromCurrency, toCurrency, date);
}

export function convertExpense(
  expense: SnapshotRow & { amount: number | string },
  toCurrency: string,
  activeWindow?: ActiveRateWindow | null,
): Promise<number> {
  return service().convertExpense(expense, toCurrency, activeWindow);
}

export function buildRateResolver(
  rows: SnapshotRow[],
  targetCurrency: string,
  options?: { activeWindow?: ActiveRateWindow | null },
): Promise<RateResolver> {
  return service().buildRateResolver(rows, targetCurrency, options);
}
