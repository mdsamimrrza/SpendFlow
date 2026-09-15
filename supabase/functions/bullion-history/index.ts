// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: bullion-history
//
// Returns daily gold (GC=F) and silver (SI=F) futures closes for the Bullion
// screen's historical chart. Runs server-side because Yahoo's chart API does
// not send CORS headers — a browser fetch is blocked by the gateway, while
// server-side requests work fine.
//
// GET /functions/v1/bullion-history?days=120
//   → { rows: [{ date, goldUsdPerOz, silverUsdPerOz }] }
//
// Public read-only market data: no auth required, no project secrets touched.
// Responses always carry CORS headers so the web app can consume them.
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // The Supabase gateway rejects keyless requests with 401 before this
  // function runs, so callers must send `apikey` (+ `Authorization` when
  // using the key as a Bearer token). Both must be preflight-allowed for
  // browser clients.
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get('days') ?? '120');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 30), 400) : 120;
  const range = days <= 60 ? '3mo' : days <= 200 ? '1y' : '2y';
  const headers = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (SpendFlow)' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const chartUrl = (symbol: string) =>
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
    const [goldRes, silverRes] = await Promise.all([
      fetch(chartUrl('GC=F'), { headers, signal: controller.signal }),
      fetch(chartUrl('SI=F'), { headers, signal: controller.signal }),
    ]);
    if (!goldRes.ok || !silverRes.ok) {
      return new Response(JSON.stringify({ error: 'upstream failed', gold: goldRes.status, silver: silverRes.status }), {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    const parse = async (res: Response) => {
      const data = await res.json() as {
        chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
      };
      const result = data.chart?.result?.[0];
      const ts = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const byDate = new Map<string, number>();
      ts.forEach((t, i) => {
        const close = closes[i];
        if (!close) return;
        byDate.set(new Date(t * 1000).toISOString().slice(0, 10), close);
      });
      return byDate;
    };
    const goldByDate = await parse(goldRes);
    const silverByDate = await parse(silverRes);

    const rows: Array<{ date: string; goldUsdPerOz: number; silverUsdPerOz: number }> = [];
    for (const [date, gold] of goldByDate) {
      const silver = silverByDate.get(date);
      if (silver) rows.push({ date, goldUsdPerOz: gold, silverUsdPerOz: silver });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));

    return new Response(JSON.stringify({ rows: rows.slice(-days) }), { headers: CORS_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'fetch failed', detail: (e as Error).message }), {
      status: 502,
      headers: CORS_HEADERS,
    });
  } finally {
    clearTimeout(timer);
  }
});
