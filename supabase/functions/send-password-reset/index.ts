// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: send-password-reset  (public — no user session required)
//
// Broker for the login page's "Forgot password?" flow, used by BOTH clients
// (web sign-in modal, mobile forgot-password modal) in place of calling
// supabase.auth.resetPasswordForEmail directly. It adds what the raw GoTrue
// /recover endpoint cannot:
//
//   * ACCOUNT EXISTENCE CHECK — the requested email is checked against Auth
//     BEFORE any mail is sent; unknown emails get a clear "no_account" answer
//     (owner-requested UX, 2026-09-15). This re-enables account enumeration
//     that audit P3-9 had deliberately closed, so it is paid for with:
//   * SERVER-SIDE COOLDOWN — every attempt (FOUND or NOT FOUND alike) stamps
//     a per-email-hash 60s cooldown in public.password_reset_cooldown,
//     enforced in the database so it holds across function instances and
//     restarts. A bot cannot spray "does this email exist?" probes any faster
//     than one per minute per address, from anywhere.
//   * No mail is ever sent to an unregistered address (nothing to leak,
//     nothing to bounce-track).
//
// Contract (always HTTP 200 so both clients parse one shape; logical status
// in the body):
//   { "success": true }
//   { "success": false, "code": "invalid_email" | "no_account" |
//                        "cooldown_active" | "send_failed" | "bad_request" }
//
// NOTE: this is the project's first function that must run WITHOUT a verified
// caller JWT (forgot-password is, by definition, for signed-out users) —
// config.toml pins verify_jwt = false for this function only. Its abuse
// surface is exactly GoTrue's own public /recover surface plus this function's
// DB cooldown; it performs no action beyond a mail send.
// ─────────────────────────────────────────────────────────────────────────────

const COOLDOWN_SECONDS = 60;
const MOBILE_REDIRECT = 'spendflow://callback';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ success: false, code: 'bad_request' });
  }

  let parsed: { email?: unknown; channel?: unknown; origin?: unknown };
  try {
    parsed = await req.json();
  } catch {
    return json({ success: false, code: 'bad_request' });
  }

  const email = typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return json({ success: false, code: 'invalid_email' });
  }
  const channel = parsed.channel === 'native' ? 'native' : 'web';

  // Web recovery links must bounce back to the web app's own callback. The
  // client sends its origin. audit run-1: relying only on the scheme check +
  // the deployed GoTrue allowlist left the binding unverifiable in-repo, so
  // when PASSWORD_RESET_ALLOWED_ORIGINS is set (comma-separated exact
  // origins) it becomes a hard in-function gate; the GoTrue allowlist stays
  // as the second layer.
  let redirectTo = MOBILE_REDIRECT;
  if (channel === 'web') {
    try {
      const u = new URL(String(parsed.origin ?? ''));
      const origin = `${u.protocol}//${u.host}`;
      const allowlist = (Deno.env.get('PASSWORD_RESET_ALLOWED_ORIGINS') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const isLocalDev = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (allowlist.length > 0 ? !allowlist.includes(origin.toLowerCase()) && !isLocalDev : u.protocol !== 'https:' && !isLocalDev) {
        return json({ success: false, code: 'bad_request' });
      }
      redirectTo = `${origin}/auth/callback`;
    } catch {
      return json({ success: false, code: 'bad_request' });
    }
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // ── Cooldown claim BEFORE anything else (enumeration-rate limit). ─────────
  // Same atomic UPDATE-where-stale → else-check → insert pattern as
  // send-security-otp; the email is stored only as a SHA-256 hash so the
  // table leaks no address list even to a DB reader.
  const emailHash = await sha256Hex(email);
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();

  const claimUrl =
    `${supabaseUrl}/rest/v1/password_reset_cooldown` +
    `?email_hash=eq.${encodeURIComponent(emailHash)}` +
    `&last_sent_at=lte.${cooldownCutoff}`;
  const claim = await fetch(claimUrl, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
  });
  if (!claim.ok) {
    return json({ success: false, code: 'send_failed' });
  }
  const claimed = (await claim.json()) as unknown[];

  if (claimed.length === 0) {
    // Either no row yet (first attempt) or the cooldown is active.
    const probe = await fetch(
      `${supabaseUrl}/rest/v1/password_reset_cooldown` +
        `?email_hash=eq.${encodeURIComponent(emailHash)}&select=last_sent_at`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const rows = probe.ok ? ((await probe.json()) as unknown[]) : [{ guard: true }];
    if (rows.length > 0) {
      return json({ success: false, code: 'cooldown_active' });
    }
    const insert = await fetch(`${supabaseUrl}/rest/v1/password_reset_cooldown`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        // PLAIN insert (audit run-1): merge-duplicates turned a duplicate
        // primary key into a silent overwrite, so every concurrent first-time
        // request slipped through the check-then-act window. A 409 here now
        // means another request won the slot inside the same 60s window.
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email_hash: emailHash, last_sent_at: new Date().toISOString() }),
    });
    if (insert.status === 409) {
      return json({ success: false, code: 'cooldown_active' });
    }
    if (!insert.ok) {
      return json({ success: false, code: 'send_failed' });
    }
  }

  const rollbackCooldown = async () => {
    try {
      await fetch(
        `${supabaseUrl}/rest/v1/password_reset_cooldown?email_hash=eq.${encodeURIComponent(emailHash)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ last_sent_at: cooldownCutoff }),
        },
      );
    } catch {
      // Cooldown stays stamped — worst case the user waits 60s and retries.
    }
  };

  // ── Existence check: admin generate_link does NOT send mail; it answers ────
  // 404 error_code=user_not_found (current GoTrue; older builds used 400) for
  // unregistered addresses and returns the link for registered ones. Using it
  // (instead of /recover) is what lets us tell the difference BEFORE a mail
  // goes out.
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'recovery', email, password: 'unused-placeholder!' }),
  });
  if (linkRes.status === 404 || linkRes.status === 400) {
    // 404 is today's hosted GoTrue answer; 400 kept for older builds. If a
    // 400 turns out to be something else (e.g. bad request shape), surface it
    // as send_failed instead — never claim "no account" on an unknown error.
    let notFound = linkRes.status === 404;
    try {
      const errBody = await linkRes.json();
      if (errBody?.error_code === 'user_not_found') notFound = true;
    } catch {
      // body unreadable
    }
    if (notFound) {
      return json({ success: false, code: 'no_account' });
    }
  }
  if (!linkRes.ok) {
    await rollbackCooldown();
    return json({ success: false, code: 'send_failed' });
  }

  // ── Send the recovery mail. ───────────────────────────────────────────────
  const recoverRes = await fetch(
    `${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    },
  );
  if (!recoverRes.ok) {
    await rollbackCooldown();
    return json({ success: false, code: 'send_failed' });
  }

  return json({ success: true });
});
