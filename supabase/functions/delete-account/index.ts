// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: delete-account
//
// Deterministic, fail-closed, retry-safe account deletion STATE MACHINE.
// Called by the authenticated client AFTER an email OTP has been verified.
//
// Cross-system reality, stated honestly: PostgreSQL, Storage, and Auth are
// separate services — no cross-system transaction exists. The design below is
// a RESUMABLE state machine: every stage is idempotent, failure at any point
// leaves the account deletable again, and the Auth identity is destroyed only
// after every other stage has verifiably completed. A partial failure can
// therefore never strand a half-deleted account with its login removed.
//
// Order (STRICT — storage BEFORE relational, auth LAST):
//   0. Verify JWT → target uid (client-supplied IDs are IGNORED entirely)
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
        return fail(500, 'storage_cleanup_incomplete');
      }
    }
  } catch (e) {
    return fail(500, (e as Error).message || 'storage_cleanup_failed');
  }

  // ── 3. Transactional relational delete — AFTER storage is verifiably clean. ─
  const { error: rpcError } = await admin.rpc('delete_user_data', {
    p_user_id: userId,
  });
  if (rpcError) {
    return fail(500, 'data_cleanup_failed');
  }

  // ── 4. Verify DB cleanup. ──────────────────────────────────────────────────
  const { data: profileCheck } = await admin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (profileCheck) {
    return fail(500, 'data_cleanup_incomplete');
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
        return fail(500, 'storage_cleanup_incomplete');
      }
    }
  } catch (e) {
    return fail(500, (e as Error).message || 'storage_cleanup_failed');
  }

  // ── 5. Auth identity LAST. ────────────────────────────────────────────────
  // If this fails, DB+storage are already clean and a retry re-verifies them
  // (both converge to "already clean") and retries only the auth deletion.
  // The function must NOT report success until it actually succeeded.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    return fail(500, 'auth_deletion_failed');
  }

  // ── 6. Success. ────────────────────────────────────────────────────────────
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
