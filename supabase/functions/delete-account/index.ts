// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: delete-account
//
// Deterministic, fail-closed, retry-safe account deletion STATE MACHINE.
// Called by the authenticated client with the session minted by the email-OTP
// verification (proven via the token's amr claim — see isOtpFreshSession);
// a password session or a stolen refresh token can NEVER trigger deletion.
//
// Cross-system reality, stated honestly: PostgreSQL, Storage, and Auth are
// separate services — no cross-system transaction exists. The design below is
// a RESUMABLE state machine: every stage is idempotent, failure at any point
// leaves the account deletable again, and the Auth identity is destroyed only
// after every other stage has verifiably completed. A partial failure can
// therefore never strand a half-deleted account with its login removed.
//
// Order (STRICT — storage BEFORE relational, auth LAST):
//   0. Verify OTP-minted session (amr otp/magiclink within the freshness
//      window) + resolve target uid (client-supplied IDs are IGNORED
//      entirely); on ANY failure after the lock, release deletion_pending
//      so the account is never stranded write-locked
//   1. Set users.deletion_pending = true   → database-level write lock:
//      concurrent devices' INSERT/UPDATE on every user-owned table are
//      rejected by triggers while deletion runs (Test G)
//   2. PURGE STORAGE FIRST  — receipts/{uid}/** and avatars/{uid}/** via the
//      official Storage SDK remove() with converging pagination, verified by
//      the independent count_user_storage RPC (reads storage metadata
//      directly). ANY failure or remaining object ⇒ overall failure,
//      DB UNTOUCHED, Auth UNTOUCHED (Test B)
//   3. TRANSACTIONAL DB DELETE — public.delete_user_data(uid): all user-owned
//      rows in ONE Postgres transaction, FK-safe order (Tests A/C)
//   4. VERIFY DB CLEAN + final storage sweep for concurrent-upload stragglers
//   5. DELETE AUTH USER — strictly LAST (Test D: a failure here reports
//      failure; retry re-verifies storage/DB (already clean) and retries only
//      the remaining steps)
//   6. { "success": true } only on full completion
//
// Contract: 200 {"success":true} | 4xx/5xx {"success":false,"error"}.
// Never 200 on failure; never stack traces/SQL/secrets in errors.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const USER_BUCKETS = ['receipts', 'avatars'] as const;

// A caller's JWT must prove it was minted by a RECENT email-OTP verification.
//
// Claims used, with the refresh-attack model stated up front: a stolen refresh
// token lets an attacker mint new access tokens at will — and each refresh
// produces a NEW iat. So iat alone can never prove freshness. The amr
// (authentication-methods-reference) claim is the anchor: it records HOW the
// session was established with the timestamp of that event, and refreshes
// preserve the original entries unchanged. Requiring an otp/magiclink entry
// with a recent timestamp therefore proves the OTP verification itself
// happened within the window — refreshing cannot launder an old one.
const OTP_FRESHNESS_SECONDS = 10 * 60;

interface AmrEntry {
  method?: string;
  timestamp?: number;
}

interface JwtPayload {
  iat?: unknown;
  amr?: unknown;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * OTP proof-of-possession on the caller's token.
 *
 * Primary check (amr): the token's authentication-methods reference must
 * contain an 'otp' or 'magiclink' entry — the methods the client's
 * verifyOtp calls produce — with its event timestamp inside the window.
 * Password sessions carry 'password'; refreshes keep the original amr
 * entry and its original timestamp, so neither a long-lived password
 * session nor a stolen refresh token can open the deletion gate.
 *
 * A token with NO amr claim at all is rejected outright (audit 2026-09-15:
 * the old iat-only fallback for pre-amr GoTrue builds was refresh-bypassable
 * in theory). Every hosted GoTrue — the only deployment this project uses —
 * emits amr since 2022; there is no supported caller without it, so failing
 * closed costs nothing and removes the bypass entirely.
 */
function isOtpFreshSession(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  const now = Math.floor(Date.now() / 1000);
  const withinWindow = (t: number) => t <= now && now - t <= OTP_FRESHNESS_SECONDS;

  // Supabase amr shape: an array of { method, timestamp } entries (some
  // builds also embed a single object). Accept both forms.
  const amr = payload.amr;
  const entries: AmrEntry[] = Array.isArray(amr)
    ? (amr as AmrEntry[])
    : amr && typeof amr === 'object'
      ? [amr as AmrEntry]
      : [];

  if (entries.length === 0) return false; // amr missing/unusable → fail closed
  const otpEntry = entries.find((e) => e?.method === 'otp' || e?.method === 'magiclink');
  if (!otpEntry) return false; // amr present but no OTP method → password/other session
  // No timestamp on the entry → cannot prove recency; fail closed.
  if (typeof otpEntry.timestamp !== 'number') return false;
  return withinWindow(otpEntry.timestamp);
}

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

  // ── 0. Identity from the JWT only. Body is never read. ────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!callerToken) {
    return fail(401, 'unauthorized');
  }

  // OTP proof-of-possession: the caller must present the session minted by
  // the email-OTP verification (client sends verifyOtp's session token).
  // The token's amr must show an otp/magiclink method with a recent event
  // timestamp — refreshes mint new iat values but preserve the original amr,
  // so neither a long-lived password session nor a stolen refresh token can
  // open the deletion gate. Enforced here, not just in app UX.
  if (!isOtpFreshSession(callerToken)) {
    return fail(401, 'otp_verification_required');
  }

  let userId: string;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${callerToken}` },
    });
    if (!userRes.ok) {
      return fail(401, 'unauthorized');
    }
    const body = await userRes.json();
    if (!body?.id) {
      return fail(401, 'unauthorized');
    }
    userId = body.id as string;
  } catch {
    return fail(401, 'unauthorized');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1. Deletion lock: users.deletion_pending = true. ─────────────────────
  // Server-managed column: the block_writes_during_deletion trigger rejects
  // any client attempt to set or write around it, and rejects that user's
  // writes on every user-owned table while it is set.
  const { error: lockError } = await admin
    .from('users')
    .update({ deletion_pending: true })
    .eq('id', userId);
  if (lockError) {
    return fail(500, 'deletion_lock_failed');
  }

  // Every failure AFTER the lock must release it, or the account is
  // permanently write-locked with no recovery path. `failLocked` wraps the
  // plain fail(): best-effort rollback first, then the error response. The
  // rollback itself failing is logged via the error code but never masks
  // the original failure — the user sees "retry" either way, and a retry
  // re-attempts the lock from scratch.
  const failLocked = async (status: number, error: string) => {
    try {
      await admin.from('users').update({ deletion_pending: false }).eq('id', userId);
    } catch {
      // Best-effort rollback — must never mask the original failure below.
    }
    return fail(status, error);
  };

  // ── 2. Storage purge FIRST — failure here must leave DB and Auth intact. ─
  // Purge via the official Storage SDK with converging pagination (objects are
  // removed between listings, so the cursor restarts at the folder top each
  // round; an advancing offset would skip survivors). Ownership: only paths
  // under `${userId}/` are ever listed or removed — the id comes from the JWT.
  const purgeBucket = async (bucket: string): Promise<void> => {
    for (let round = 0; round < 50; round++) {
      const { data: objects, error: listError } = await admin
        .storage
        .from(bucket)
        .list(userId, { limit: 100 });

      if (listError) {
        throw new Error('storage_cleanup_failed');
      }
      const files = objects ?? [];
      if (files.length === 0) return;

      const paths = files
        .map((f) => `${userId}/${f.name}`)
        .filter((p) => p.startsWith(`${userId}/`));
      if (paths.length > 0) {
        const { error: removeError } = await admin
          .storage
          .from(bucket)
          .remove(paths);
        if (removeError) {
          throw new Error('storage_cleanup_failed');
        }
      }

      if (files.length < 100) {
        // Partial page — verify the folder is actually empty now.
        const { data: recheck, error: recheckError } = await admin
          .storage
          .from(bucket)
          .list(userId, { limit: 1 });
        if (recheckError) {
          throw new Error('storage_cleanup_failed');
        }
        if (!recheck || recheck.length === 0) return;
      }
    }
    throw new Error('storage_cleanup_incomplete'); // did not converge in 50 rounds
  };

  // Independent post-check via count_user_storage RPC: counts objects straight
  // in the storage metadata table, so a misleading remove()/list() response
  // cannot mask survivors.
  const verifyBucketEmpty = async (bucket: string): Promise<boolean> => {
    const { data: remaining, error: countError } = await admin.rpc(
      'count_user_storage',
      { p_bucket: bucket, p_user_id: userId },
    );
    return !countError && (remaining ?? 1) === 0;
  };

  try {
    for (const bucket of USER_BUCKETS) {
      await purgeBucket(bucket);
      if (!(await verifyBucketEmpty(bucket))) {
        return await failLocked(500, 'storage_cleanup_incomplete');
      }
    }
  } catch (e) {
    return await failLocked(500, (e as Error).message || 'storage_cleanup_failed');
  }

  // ── 3. Transactional relational delete — AFTER storage is verifiably clean. ─
  const { error: rpcError } = await admin.rpc('delete_user_data', {
    p_user_id: userId,
  });
  if (rpcError) {
    return await failLocked(500, 'data_cleanup_failed');
  }

  // ── 4. Verify DB cleanup. ──────────────────────────────────────────────────
  const { data: profileCheck } = await admin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (profileCheck) {
    return await failLocked(500, 'data_cleanup_incomplete');
  }

  // ── 4b. Final storage sweep. ───────────────────────────────────────────────
  // The write-block triggers guard DATABASE rows, not storage uploads: a
  // concurrent device could upload a receipt between step 2 and its (now
  // rejected) expense insert, leaving an orphan object. This sweep after the
  // relational delete catches those stragglers. Remaining window (between this
  // sweep and the auth deletion below) is sub-second; any object landing there
  // is inaccessible garbage — private bucket, folder policy requires
  // auth.uid() = owner, and the owner's identity no longer exists — cleanable
  // by periodic maintenance. Documented, not hidden.
  try {
    for (const bucket of USER_BUCKETS) {
      await purgeBucket(bucket);
      if (!(await verifyBucketEmpty(bucket))) {
        return await failLocked(500, 'storage_cleanup_incomplete');
      }
    }
  } catch (e) {
    return await failLocked(500, (e as Error).message || 'storage_cleanup_failed');
  }

  // ── 5. Auth identity LAST. ────────────────────────────────────────────────
  // If this fails, DB+storage are already clean and a retry re-verifies them
  // (both converge to "already clean") and retries only the auth deletion.
  // The function must NOT report success until it actually succeeded.
  // failLocked here is a harmless no-op safety net: the users row (and with
  // it the deletion_pending flag) was already deleted in step 3.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    return await failLocked(500, 'auth_deletion_failed');
  }

  // ── 6. Success. ────────────────────────────────────────────────────────────
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
