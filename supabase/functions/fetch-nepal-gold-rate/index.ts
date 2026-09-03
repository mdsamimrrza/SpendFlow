// ─────────────────────────────────────────────────────────────────────────────
// Scheduled Edge Function: fetch Nepal's official daily gold rate.
//
// Invoked by pg_cron at 11:00 / 11:15 / 11:30 / 12:00 NPT (05:15 / 05:30 /
// 05:45 / 06:15 UTC). Idempotent: exits immediately when a verified record for
// today's Asia/Kathmandu date already exists, so retries never duplicate or
// overwrite the day's rate.
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (provided by the Supabase
// runtime). The service role key never leaves the server.
// ─────────────────────────────────────────────────────────────────────────────

const KATHMANDU_TZ = 'Asia/Kathmandu';
const COUNTRY_CODE = 'NP';
const MARKET_AUTHORITY = 'FENEGOSIDA';

const PRIMARY_URL = 'https://api.fenegosida.org/api/website/v1/Dashboard/today';
const PRIMARY_LABEL = 'fenegosida_official_api';
const PRIMARY_SOURCE_URL = 'https://www.fenegosida.org';

// Trusted mirror that republishes the daily FENEGOSIDA fix verbatim.
const MIRROR_URL = 'https://byajdar.com/gold-silver-price-nepal';
const MIRROR_LABEL = 'trusted_fenegosida_mirror_byajdar';

const GRAMS_PER_TOLA = 11.6638;

interface ParsedRates {
  fineGoldPerTola: number;
  fineGoldPer10g: number | null;
  tejabiGoldPerTola: number | null;
  tejabiGoldPer10g: number | null;
  silverPerTola: number | null;
  silverPer10g: number | null;
  publishedAt: string | null;
}

/** Today's date (yyyy-mm-dd) in the Nepal market timezone. */
function kathmanduToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KATHMANDU_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Date portion (yyyy-mm-dd) of an ISO timestamp rendered in Kathmandu time. */
function kathmanduDateOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KATHMANDU_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(/[,\s]/g, '')) : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ── Source adapters ───────────────────────────────────────────────────────────

async function fetchPrimary(): Promise<ParsedRates> {
  const res = await fetch(PRIMARY_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'SpendFlow/1.0 (+https://spendflow.app)' },
  });
  if (!res.ok) throw new Error(`primary source HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('primary source returned no rows');

  const findRow = (keywords: string[], unit: string) =>
    rows.find((r: { rateType?: string }) => {
      const t = String(r?.rateType ?? '');
      return keywords.every((k) => t.includes(k)) && t.includes(unit);
    });

  // छापावाल सुन = Chhapawal (fine 24K) gold; असली चाँदी = pure silver.
  // The "तोला"/"ग्राम" keyword decides the unit of todayBaseRatePerGram.
  const goldTola = findRow(['छापावाल', 'सुन'], 'तोला');
  const gold10g = findRow(['छापावाल', 'सुन'], 'ग्राम');
  const silverTola = findRow(['चाँदी'], 'तोला');
  const silver10g = findRow(['चाँदी'], 'ग्राम');

  if (!goldTola) throw new Error('primary source missing fine gold per-tola row');

  return {
    fineGoldPerTola: toNumber(goldTola.todayBaseRatePerGram)!,
    fineGoldPer10g: gold10g ? toNumber(gold10g.todayBaseRatePerGram) : null,
    tejabiGoldPerTola: null, // not published via the API; nullable column
    tejabiGoldPer10g: null,
    silverPerTola: silverTola ? toNumber(silverTola.todayBaseRatePerGram) : null,
    silverPer10g: silver10g ? toNumber(silver10g.todayBaseRatePerGram) : null,
    publishedAt: goldTola.todayDate ?? null,
  };
}

async function fetchMirror(): Promise<ParsedRates> {
  const res = await fetch(MIRROR_URL, { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`mirror HTTP ${res.status}`);
  const html = await res.text();

  const bigAfter = (labelRegex: RegExp): number | null => {
    const m = html.match(labelRegex);
    if (!m) return null;
    const num = toNumber(m[1]);
    return num;
  };

  const goldTola = bigAfter(/Fine gold \(hallmark 9999\)<\/div><div class="big">रू\s*([\d,\.]+)/i);
  const silverTola = bigAfter(/>Silver<\/div><div class="big">रू\s*([\d,\.]+)/i);
  const gold10g = bigAfter(/रू\s*([\d,\.]+)\s*per 10 g/i);

  if (goldTola === null) throw new Error('mirror missing fine gold per-tola value');

  return {
    fineGoldPerTola: goldTola,
    fineGoldPer10g: gold10g,
    tejabiGoldPerTola: null,
    tejabiGoldPer10g: null,
    silverPerTola: silverTola,
    silverPer10g: null,
    publishedAt: null,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(rates: ParsedRates): { ok: true } | { ok: false; reason: string } {
  const { fineGoldPerTola, fineGoldPer10g, silverPerTola } = rates;

  if (fineGoldPerTola === null || !Number.isFinite(fineGoldPerTola) || fineGoldPerTola <= 0) {
    return { ok: false, reason: 'fine gold per tola is not a positive number' };
  }
  // Wide sanity bounds only — reject obviously malformed values, never tune to
  // current market levels.
  if (fineGoldPerTola < 50_000 || fineGoldPerTola > 5_000_000) {
    return { ok: false, reason: `fine gold per tola out of sane range: ${fineGoldPerTola}` };
  }
  if (silverPerTola !== null && (silverPerTola < 100 || silverPerTola > 500_000)) {
    return { ok: false, reason: `silver per tola out of sane range: ${silverPerTola}` };
  }
  // Internal consistency: tola price must match the per-10g price (1 tola ≈ 11.6638 g).
  if (fineGoldPer10g !== null) {
    const impliedTola = (fineGoldPer10g * GRAMS_PER_TOLA) / 10;
    if (Math.abs(impliedTola - fineGoldPerTola) / fineGoldPerTola > 0.01) {
      return { ok: false, reason: 'fine gold tola / 10g values are inconsistent' };
    }
  }
  return { ok: true };
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';
  const today = kathmanduToday();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // Idempotency gate: today's verified record already stored → nothing to do.
  // If the check itself fails (transient DB/network hiccup) we proceed anyway —
  // the insert below is protected by ON CONFLICT DO NOTHING regardless.
  if (!force) {
    try {
      const existing = await fetch(
        `${supabaseUrl}/rest/v1/market_gold_rates?select=id,rate_date,status&country_code=eq.${COUNTRY_CODE}&rate_date=eq.${today}`,
        { headers: restHeaders },
      );
      if (existing.ok) {
        const rows = await existing.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return new Response(JSON.stringify({ ok: true, skipped: 'already_stored', rate_date: today }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    } catch {
      // gate unavailable — continue to fetch; conflict protection still applies
    }
  }

  // PRIMARY first, trusted mirror second. The stored metadata always records
  // which technical endpoint actually supplied the numbers.
  let rates: ParsedRates | null = null;
  let fetchSource = PRIMARY_LABEL;
  let sourceUrl = PRIMARY_SOURCE_URL;
  const attempts: string[] = [];

  try {
    rates = await fetchPrimary();
  } catch (e) {
    attempts.push(`${PRIMARY_LABEL}: ${(e as Error).message}`);
    try {
      rates = await fetchMirror();
      fetchSource = MIRROR_LABEL;
      sourceUrl = MIRROR_URL;
    } catch (e2) {
      attempts.push(`${MIRROR_LABEL}: ${(e2 as Error).message}`);
    }
  }

  if (!rates) {
    // All retries failed — do NOT write 0/null/fabricated prices. Yesterday's
    // verified row simply remains the latest known rate.
    return new Response(
      JSON.stringify({ ok: false, rate_date: today, error: 'all sources failed', attempts }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const validation = validate(rates);
  if (!validation.ok) {
    return new Response(
      JSON.stringify({ ok: false, rate_date: today, error: `validation failed: ${validation.reason}` }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // The published timestamp must belong to today's Nepal market day. On
  // Saturdays/holidays the source keeps the previous fix — its Kathmandu date
  // then differs from today and we correctly store nothing.
  if (rates.publishedAt) {
    const publishedDate = kathmanduDateOf(rates.publishedAt);
    if (publishedDate && publishedDate !== today) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: 'stale_publication',
          rate_date: today,
          published_date: publishedDate,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // Insert with ON CONFLICT DO NOTHING: the FIRST verified fetch of the day
  // wins and the rate then stays fixed for the rest of the day. Never updates.
  const insertBody = {
    rate_date: today,
    country_code: COUNTRY_CODE,
    currency_code: 'NPR',
    fine_gold_per_tola: rates.fineGoldPerTola,
    fine_gold_per_10g: rates.fineGoldPer10g,
    tejabi_gold_per_tola: rates.tejabiGoldPerTola,
    tejabi_gold_per_10g: rates.tejabiGoldPer10g,
    silver_per_tola: rates.silverPerTola,
    silver_per_10g: rates.silverPer10g,
    source: MARKET_AUTHORITY,
    source_url: sourceUrl,
    fetch_source: fetchSource,
    market_authority: MARKET_AUTHORITY,
    published_at: rates.publishedAt,
    status: 'verified',
  };

  let inserted: Response;
  try {
    inserted = await fetch(
      `${supabaseUrl}/rest/v1/market_gold_rates?on_conflict=rate_date,country_code`,
      {
        method: 'POST',
        headers: { ...restHeaders, Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(insertBody),
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'insert request failed', detail: (e as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!inserted.ok) {
    const detail = await inserted.text();
    return new Response(JSON.stringify({ ok: false, error: 'insert failed', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const row = await inserted.json();
  return new Response(
    JSON.stringify({
      ok: true,
      stored: Array.isArray(row) && row.length > 0 ? 'new_record' : 'already_stored',
      rate_date: today,
      fetch_source: fetchSource,
      fine_gold_per_tola: rates.fineGoldPerTola,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
