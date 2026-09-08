// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: delete-account
//
// Deterministically deletes a user's account. Called by the authenticated
// client AFTER the app has verified an email OTP. Requires the caller's own
// JWT (the user may only delete themselves) — the service-role key performs
// the actual deletion server-side and never ships to the client.
//
// Deploy: supabase functions deploy delete-account --no-verify-jwt=false
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Identify the caller from their own JWT. Anonymous requests are rejected.
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!callerToken) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify the JWT server-side and extract the caller's id.
  let userId: string;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${callerToken}` },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    userId = (await userRes.json()).id;
    if (!userId) throw new Error('missing id');
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // The caller may only delete their own account — a target user_id in the
  // body that differs from the JWT identity is rejected outright.
  let body: { user_id?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // empty body is fine
  }
  if (body.user_id && body.user_id !== userId) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // The service role bypasses RLS. Deletion order respects FK dependencies:
  // referencing rows first, then the users/profile row, then the auth user.
  const steps: Array<[string, string, string]> = [
    ['expenses', 'DELETE', `/rest/v1/expenses?user_id=eq.${userId}`],
    ['recurring_rules', 'DELETE', `/rest/v1/recurring_rules?user_id=eq.${userId}`],
    ['transfers', 'DELETE', `/rest/v1/transfers?user_id=eq.${userId}`],
    ['device_tokens', 'DELETE', `/rest/v1/device_tokens?user_id=eq.${userId}`],
    ['notifications', 'DELETE', `/rest/v1/notifications?user_id=eq.${userId}`],
    ['user_settings_history', 'DELETE', `/rest/v1/user_settings_history?user_id=eq.${userId}`],
    ['category_budget_history', 'DELETE', `/rest/v1/category_budget_history?user_id=eq.${userId}`],
    ['bank_accounts', 'DELETE', `/rest/v1/bank_accounts?user_id=eq.${userId}`],
    ['categories', 'DELETE', `/rest/v1/categories?user_id=eq.${userId}`],
    ['users', 'DELETE', `/rest/v1/users?id=eq.${userId}`],
  ];

  const failures: string[] = [];
  for (const [name, method, path] of steps) {
    try {
      const res = await fetch(`${supabaseUrl}${path}`, { method, headers: adminHeaders });
      if (!res.ok) failures.push(name);
    } catch {
      failures.push(name);
    }
  }

  // Private storage: purge the user's receipts folder and avatars folder.
  // Listing returns up to 100 objects per call — paginate until exhausted.
  const buckets = ['receipts', 'avatars'];
  for (const bucket of buckets) {
    try {
      let after: string | undefined = undefined;
      // Hard stop at 20 pages (~2000 objects) — a user folder realistically
      // holds far fewer; this prevents an infinite loop on a poisoned folder.
      for (let page = 0; page < 20; page++) {
        const listUrl = new URL(`${supabaseUrl}/storage/v1/object/list/${bucket}`);
        listUrl.searchParams.set('prefix', `${userId}/`);
        const res = await fetch(listUrl.toString(), {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ prefix: `${userId}/`, limit: 100, ...(after ? { startafter: after } : {}) }),
        });
        if (!res.ok) break;
        const objects: Array<{ name: string }> = await res.json();
        if (!Array.isArray(objects) || objects.length === 0) break;
        const paths = objects.map((o) => `${userId}/${o.name}`);
        await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${paths.map(encodeURIComponent).join('/')}`, {
          method: 'DELETE',
          headers: adminHeaders,
        }).catch(() => {});
        if (objects.length < 100) break;
        after = objects[objects.length - 1].name;
      }
    } catch {
      // storage purge is best-effort; objects are already unreachable without
      // an owner (no signed URLs can be minted) once the account is deleted.
    }
  }

  // Data cleanup failed → do NOT delete the auth identity. The account stays
  // functional and the client can retry safely (the steps above are idempotent).
  if (failures.length > 0) {
    return new Response(JSON.stringify({ ok: false, error: 'data_cleanup_failed', failed: failures }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // All application data removed → delete the auth user. This also cascades
  // any row missed above via ON DELETE CASCADE FKs on user_id columns.
  const deleted = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (!deleted.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: 'auth_deletion_failed', detail: await deleted.text() }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
