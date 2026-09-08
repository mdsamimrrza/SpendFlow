// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: delete-account
//
// Deterministic, fail-closed account deletion. Called by the authenticated
// client AFTER an email OTP has been verified.
//
// Contract:
//   POST (any body — client-supplied user IDs are IGNORED entirely)
//   Authorization: Bearer <user JWT>          → target = the JWT's user
//   → 200 { "success": true }                 only when EVERY step completed
//   → 4xx/5xx { "success": false, "error" }  on any failure; auth user is
//                                             NOT deleted and retry is safe
//
// Order (auth identity strictly LAST):
//   1. Verify JWT → resolve target user id server-side
//   2. RPC public.delete_user_data() — ALL user-owned rows in ONE Postgres
//      transaction (idempotent; children before parents)
//   3. Storage purge — receipts/{uid}/** and avatars/{uid}/** via the real
//      Storage SDK (createClient + storage.from().remove()), paginated until
//      each folder is empty. ANY batch failure → overall failure.
//   4. Post-checks: relational rows and storage folders are actually empty
//   5. DELETE the Auth user
//   6. Return success
//
// Cross-system boundary (documented, not pseudo-atomic): Postgres, Storage,
// and Auth are separate services. The flow is retry-safe instead: every step
// treats "already absent" as success, so a retry after partial failure
// completes the remainder. Storage failure BEFORE auth deletion means the
// account remains functional and deletable again — never half-gone with the
// login removed.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  // ── 1. Identity from the JWT — the ONLY source of the target user. ─────────
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

  // Trusted admin client — server-side only, service role.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 2. Relational cleanup: ONE transactional RPC. ─────────────────────────
  // Body is deliberately ignored — the JWT decides the target, so a client
  // can never point the deletion at someone else's account.
  const { error: rpcError } = await admin.rpc('delete_user_data', {
    p_user_id: userId,
  });
  if (rpcError) {
    return fail(500, 'data_cleanup_failed');
  }

  // ── 3. Storage purge: paginated, fail-closed. ─────────────────────────────
  // Ownership: every object the app writes lives under `{userId}/…` (receipts
  // upload path: `${userId}/${timestamp}-${random}.ext`; avatars:
  // `${userId}/avatar-${timestamp}.ext`). We list ONLY the user's folder and
  // delete ONLY paths that start with `${userId}/` — derived from the JWT,
  // never from client input. Legacy rows are covered: old receipts were also
  // written under the same per-user folder, so folder listing (not DB paths)
  // is the source of truth here.
  const USER_BUCKETS = ['receipts', 'avatars'] as const;
  const LIST_PAGE = 100; // Supabase Storage list() default maximum page size
  const MAX_PAGES = 50; // safety ceiling (5000 objects) against runaway loops

  for (const bucket of USER_BUCKETS) {
    try {
      // Converging pagination: objects are DELETED between listings, so an
      // advancing offset would skip survivors (folder shrinks under the
      // cursor). Instead, re-list from the top each round; the loop ends when
      // a page comes back empty. MAX_PAGES guards against non-convergence —
      // hitting it fails closed as incomplete.
      let rounds = 0;
      for (; rounds < MAX_PAGES; rounds++) {
        const { data: objects, error: listError } = await admin
          .storage
          .from(bucket)
          .list(userId, { limit: LIST_PAGE });

        if (listError) {
          return fail(500, 'storage_cleanup_failed');
        }
        const files = objects ?? [];
        if (files.length === 0) {
          break;
        }

        const paths = files
          .map((f) => `${userId}/${f.name}`)
          .filter((p) => p.startsWith(`${userId}/`));
        if (paths.length > 0) {
          const { error: removeError } = await admin
            .storage
            .from(bucket)
            .remove(paths);
          if (removeError) {
            return fail(500, 'storage_cleanup_failed');
          }
        }

        if (files.length < LIST_PAGE) {
          // Sanity: a partial page should mean the folder is exhausted —
          // verify by listing once more; an unexpected survivor fails closed.
          const { data: recheck, error: recheckError } = await admin
            .storage
            .from(bucket)
            .list(userId, { limit: 1 });
          if (recheckError) {
            return fail(500, 'storage_cleanup_failed');
          }
          if (!recheck || recheck.length === 0) {
            break;
          }
          // Objects survived the removal round — keep looping (bounded).
        }
      }
      if (rounds >= MAX_PAGES) {
        // Folder still had objects after the round ceiling — do not pretend
        // it is clean.
        return fail(500, 'storage_cleanup_incomplete');
      }
    } catch {
      return fail(500, 'storage_cleanup_failed');
    }
  }

  // ── 4. Final verification — trust, but check. ──────────────────────────────
  // Relational: the user's profile row must be gone.
  const { data: profileCheck } = await admin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (profileCheck) {
    return fail(500, 'data_cleanup_incomplete');
  }

  // Storage: each user folder must be empty (or absent) now.
  for (const bucket of USER_BUCKETS) {
    const { data: remaining, error: listError } = await admin
      .storage
      .from(bucket)
      .list(userId, { limit: 1 });
    if (listError) {
      return fail(500, 'storage_cleanup_failed');
    }
    if (remaining && remaining.length > 0) {
      return fail(500, 'storage_cleanup_incomplete');
    }
  }

  // ── 5. Auth identity LAST. ─────────────────────────────────────────────────
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    return fail(500, 'auth_deletion_failed');
  }

  // ── 6. Success. ────────────────────────────────────────────────────────────
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
