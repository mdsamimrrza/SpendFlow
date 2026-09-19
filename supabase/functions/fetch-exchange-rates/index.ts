// ─────────────────────────────────────────────────────────────────────────────
// Scheduled Edge Function: warm the shared exchange_rates table with the
// latest ECB reference fixings (via Frankfurter) for every floating currency
// SpendFlow tracks.
//
// Invoked by pg_cron daily at 16:30 UTC (the ECB fixing is published ~14:15
// CET). This is the service-owned writer the audit run-1 comment promised:
// the client went read-only on exchange_rates, so without this job the table
// rots (it had not gained a row since the one-time Sep 9 backfill) and
// historical-date resolution silently degrades to nearest-prior/stale rows.
//
// Guards learned the hard way:
//  - ONLY store dates the provider actually reports, never a date derived
//    client-side: a previous backfill asked the deprecated frankfurter.app
//    endpoint for a FUTURE date and stored its latest quote under that
//    future key, poisoning nearest-on/before lookups.
//  - A stored fixing date must never be in the future (UTC) and must not be
//    older than 4 days (a holiday gap is fine; a dead provider is not).
//  - Pegged currencies (AED/QAR/SAR/USD) and NPR are deliberately NOT stored —
//    the client hardcodes pegs and derives NPR from INR at 1.6.
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Supabase runtime env).
// Idempotent: upsert on (currency, date) — re-runs rewrite the same values.
// ─────────────────────────────────────────────────────────────────────────────

const FLOATING_SYMBOLS = ['INR', 'GBP', 'MYR', 'KRW', 'JPY', 'AUD', 'CAD'] as const;
const RATE_API = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${FLOATING_SYMBOLS.join(',')}`;

interface ProviderResponse {
  base?: string;
  date?: string;
  rates?: Record<string, unknown>;
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isPlausibleFixingDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = todayIsoUtc();
  if (date > today) return false;
  const floor = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
  return date >= floor;
}

// ── Service-role auth: identical guard to fetch-nepal-gold-rate ──────────────
// Exact match against the runtime SUPABASE_SERVICE_ROLE_KEY (what pg_cron
// presents), OR a JWT-format key that passes real HS256 signature
// verification against the project JWT secret. Never decode-and-trust.
const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseJwtPart(part: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(bytesFromB64url(part)));
  } catch {
    return null;
  }
}

async function verifyHs256(jwt: string, secret: string): Promise<boolean> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${parts[0]}.${parts[1]}`));
    return constantTimeEqual(b64urlEncode(new Uint8Array(mac)), parts[2]);
  } catch {
    return false;
  }
}

/** Verify against the runtime-injected SUPABASE_JWKS (public keys of this
 *  project, Oct JWK form) when SUPABASE_JWT_SECRET is not configured — which
 *  is the default on projects created with the new API-key system. */
async function verifyHs256WithJwks(jwt: string): Promise<boolean> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  let jwks: { keys?: Record<string, unknown>[] };
  try {
    jwks = JSON.parse(Deno.env.get('SUPABASE_JWKS') ?? '');
  } catch {
    return false;
  }
  for (const jwk of jwks.keys ?? []) {
    if (jwk.kty !== 'oct' || typeof jwk.k !== 'string') continue;
    try {
      // Rebuild from raw key material only: the published JWK lists
      // key_ops:["verify"], which would reject a ['sign'] HMAC import.
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'oct', k: jwk.k, alg: 'HS256' } as JsonWebKey,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${parts[0]}.${parts[1]}`));
      if (constantTimeEqual(b64urlEncode(new Uint8Array(mac)), parts[2])) return true;
    } catch {
      // key not usable for HMAC — try the next
    }
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isServiceRoleCaller(presentedKey: string): Promise<boolean> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (presentedKey && presentedKey === serviceKey) return true;

  const parts = presentedKey.split('.');
  if (parts.length !== 3) return false;
  const jwtSecret =
    Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('JWT_SECRET') || '';

  // Signature first — claims are only trusted after it verifies. Either the
  // configured secret or the runtime JWKS must attest this token.
  const verified = jwtSecret
    ? await verifyHs256(presentedKey, jwtSecret)
    : await verifyHs256WithJwks(presentedKey);
  if (!verified) return false;

  const header = parseJwtPart(parts[0]);
  if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return false;
  const payload = parseJwtPart(parts[1]);
  if (payload?.role !== 'service_role' || payload?.iss !== 'supabase') return false;
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return false;
  return true;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const presentedKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!(await isServiceRoleCaller(presentedKey))) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let provider: ProviderResponse | null = null;
  try {
    const res = await fetch(RATE_API, { headers: { Accept: 'application/json' } });
    if (res.ok) provider = (await res.json()) as ProviderResponse;
  } catch {
    // fall through to error response below
  }
  if (!provider || typeof provider.date !== 'string' || !provider.rates) {
    return new Response(JSON.stringify({ ok: false, error: 'provider unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isPlausibleFixingDate(provider.date)) {
    return new Response(
      JSON.stringify({ ok: false, skipped: 'implausible_fixing_date', date: provider.date }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const rows: { currency: string; date: string; rate_to_usd: number; source: string }[] = [];
  for (const ccy of FLOATING_SYMBOLS) {
    const units = Number(provider.rates[ccy]);
    if (!(units > 0)) continue;
    rows.push({
      currency: ccy,
      date: provider.date,
      rate_to_usd: Math.round((1 / units) * 1e8) / 1e8,
      source: 'frankfurter_cron',
    });
  }
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'no usable rates in response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const writeKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  let stored: Response;
  try {
    stored = await fetch(`${supabaseUrl}/rest/v1/exchange_rates?on_conflict=currency,date`, {
      method: 'POST',
      headers: {
        apikey: writeKey,
        Authorization: `Bearer ${writeKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'write request failed', detail: (e as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (!stored.ok) {
    const detail = await stored.text();
    return new Response(JSON.stringify({ ok: false, error: 'upsert failed', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, date: provider.date, currencies: rows.map((r) => r.currency) }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
