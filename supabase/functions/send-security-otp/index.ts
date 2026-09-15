// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: send-security-otp
//
// Broker for security-critical OTP emails (account deletion, email change).
// Previously the client called supabase.auth.signInWithOtp directly, which put
// the SEND step entirely on Supabase's hosted rate limits — a signed-in user
// could fire unlimited sends (mail-bombing their own inbox, burning provider
// email quota). Verify-attempt limiting protects the CODE, not the send.
//
// Guarantees enforced here:
//   * Caller must be authenticated (gateway verifies the JWT signature; the
//     service role re-resolves the user from the token — client-supplied
//     identity is never trusted).
//   * Recipient email is resolved SERVER-SIDE from the Auth user record.
//     The client cannot make this function email anyone but themselves.
//   * shouldCreateUser: false — an OTP send can never silently mint an Auth
//     identity (matters for deleted accounts mid-flow).
//   * Per-user, per-purpose cooldown (60s) in public.security_otp_sends —
//     one send per minute, enforced in the database so it holds across
//     function instances and restarts.
//
// Contract: 200 {"success":true} | 4xx/5xx {"success":false,"error"}.
// Errors are coarse on purpose: never leaks account state, emails, or SQL.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COOLDOWN_SECONDS = 60;
const VALID_PURPOSES = new Set(['account_deletion', 'email_change']);

Deno.serve(async (req: Request) => {
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ success: false, error }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') {
    return fail(405, 'method_not_allowed');
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // ── 1. Resolve the caller from their JWT — never from the body. ──────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!callerToken) {
    return fail(401, 'unauthorized');
  }

  let userId: string;
  let userEmail: string;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${callerToken}` },
    });
    if (!userRes.ok) {
      return fail(401, 'unauthorized');
    }
    const body = await userRes.json();
    if (!body?.id || !body?.email) {
      return fail(401, 'unauthorized');
    }
    userId = body.id as string;
    userEmail = body.email as string;
  } catch {
    return fail(401, 'unauthorized');
  }

  // ── 2. Purpose is a fixed enum — reject anything else. ────────────────────
  let purpose = 'account_deletion';
  try {
    const parsed = await req.json().catch(() => ({}));
    if (parsed && typeof parsed.purpose === 'string') {
      purpose = parsed.purpose;
    }
  } catch {
    // No body → default purpose (account_deletion).
  }
  if (!VALID_PURPOSES.has(purpose)) {
    return fail(400, 'invalid_purpose');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 3. Cooldown check + claim, atomically. ────────────────────────────────
  // A single UPDATE with a WHERE guard both checks the window and stamps the
  // new timestamp — no read-then-write race between concurrent requests.
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();

  // Try to refresh an existing row first…
  const { data: updated, error: updateError } = await admin
    .from('security_otp_sends')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .lte('last_sent_at', cooldownCutoff)
    .select('user_id')
    .maybeSingle();

  if (updateError) {
    return fail(500, 'cooldown_check_failed');
  }

  if (!updated) {
    // No row updated: either no row exists yet, or the cooldown is active.
    const { data: existing } = await admin
      .from('security_otp_sends')
      .select('last_sent_at')
      .eq('user_id', userId)
      .eq('purpose', purpose)
      .maybeSingle();

    if (existing) {
      return fail(429, 'cooldown_active');
    }

    // First send for this (user, purpose) — insert the claim. A unique-violation
    // here means a concurrent request won the insert race: treat as cooldown.
    // Any other insert failure (e.g. FK — no public.users row for a brand-new
    // account whose profile creation failed) must NOT read as a cooldown; the
    // caller sees a retryable error instead of a silent 60s lockout.
    const { error: insertError } = await admin
      .from('security_otp_sends')
      .upsert(
        { user_id: userId, purpose, last_sent_at: new Date().toISOString() },
        { onConflict: 'user_id,purpose' },
      );
    if (insertError) {
      const isUniqueViolation = (insertError as { code?: string }).code === '23505';
      return isUniqueViolation ? fail(429, 'cooldown_active') : fail(500, 'cooldown_store_failed');
    }
  }

  // ── 4. Send the OTP — recipient and options are fully server-controlled. ──
  // Admin-auth API: creates/returns nothing about account state beyond sending.
  const sendRes = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      email: userEmail,
      create_user: false,
    }),
  });

  if (!sendRes.ok) {
    // The send failed; do not hold the cooldown stamp against the user's next
    // attempt — roll back to the pre-check state so a retry isn't punished for
    // a provider hiccup. Best-effort.
    try {
      await admin
        .from('security_otp_sends')
        .update({ last_sent_at: cooldownCutoff })
        .eq('user_id', userId)
        .eq('purpose', purpose);
    } catch {
      // Cooldown stays stamped — worst case the user waits 60s and retries.
    }
    return fail(502, 'otp_send_failed');
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
