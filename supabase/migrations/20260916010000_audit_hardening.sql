-- ═══════════════════════════════════════════════════════════════════════════
-- Audit hardening (2026-09-15 full-repo audit, items M1/M3/L1/L3)
--
-- 1. M1 — Deletion-lock TTL + self-heal. users.deletion_pending previously
--    had no expiry: if the delete-account Edge Function died between locking
--    and completing (container kill mid-request), the account was stranded
--    write-locked forever with no client-visible recovery. The lock is now
--    timestamped (deletion_pending_at, stamped by the trigger itself — no
--    caller can forge or clear it) and treated as EXPIRED 60 minutes after it
--    was taken: subsequent writes unblock automatically and the next UPDATE
--    through the users branch clears the stale flag. A healthy deletion run
--    always finishes (or failLocked-releases) within seconds of taking the
--    lock, so the TTL can never release a lock out from under a live run.
--
-- 2. M3 — delete_user_data defense-in-depth. Execution has always rested on
--    grants (service_role only). A SECURITY DEFINER wipe-any-account RPC is
--    one stray `grant ... to public` away from a disaster (Postgres grants
--    EXECUTE to PUBLIC on function CREATE by default). The function now ALSO
--    inspects the PostgREST jwt-claims GUC and refuses any REST-authenticated
--    caller whose role is not service_role. Direct SQL (no GUC) still runs —
--    only superuser/service contexts can reach the database that way anyway.
--
-- 3. L1 — users.email is now server-authoritative. The email-change flow
--    updates GoTrue only, so users.email drifted (stale display data and a
--    client-writable identity column). A SECURITY DEFINER BEFORE trigger
--    copies auth.users.email over any value any caller writes — signup,
--    email change, and the profile create path all converge on the real one.
--
-- 4. L3 — Trigger-function privileges. The Supabase defaults grant every
--    function EXECUTE to PUBLIC; the definer RPCs were tightened in the
--    20260908/20260912 rounds but the four trigger functions were missed.
--    They error outside trigger context (and INVOKER ones can only do what
--    the firing role could anyway), so this is strict defense-in-depth:
--    replace PUBLIC with explicit anon/authenticated/service_role grants —
--    the exact roles that fire triggers through PostgREST — revoking access
--    from any other role PUBLIC would have covered.
--
-- Idempotent throughout. Re-pin search_path wherever CREATE OR REPLACE
-- recreates a definer function (20260912000000's pin must not regress).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Deletion-lock timestamp + TTL-aware write-block trigger.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists deletion_pending_at timestamptz;

create or replace function public.block_writes_during_deletion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
begin
  if tg_table_name = 'users' then
    v_uid := new.id;

    if auth.uid() is not null then
      -- CLIENT writers.
      if old.deletion_pending = true then
        if old.deletion_pending_at is null
           or old.deletion_pending_at >= now() - interval '60 minutes'
        then
          -- Live lock: block (PostgREST carries the old true into NEW for
          -- unrelated updates, so this covers every client write mid-deletion).
          raise exception 'SpendFlow: account deletion is in progress — writes are disabled';
        end if;
        -- M1 self-heal: a lock older than 60 minutes is an orphan of a
        -- crashed deletion run. Clear it so the account recovers itself on
        -- the next write; the flag cannot come back on this row via clients.
        new.deletion_pending    := false;
        new.deletion_pending_at := null;
      end if;
      if new.deletion_pending = true then
        raise exception 'SpendFlow: deletion_pending is server-managed';
      end if;
    else
      -- SERVICE role (delete-account Edge Function) — the only writer allowed
      -- to set/clear the flag; no self-heal here so a deliberate RE-LOCK of
      -- a stuck/expired flag wins instead of being cleared. The trigger owns
      -- the stamp: setting true refreshes it (initial lock or re-lock), the
      -- true→false release clears it.
      if new.deletion_pending = true then
        new.deletion_pending_at := now();
      elsif old.deletion_pending = true then
        new.deletion_pending_at := null;
      end if;
    end if;
  else
    v_uid := new.user_id;
    -- M1 TTL: only a LIVE lock (taken within the last 60 minutes; null stamp
    -- means legacy pre-column lock → treated as expired) blocks writes on
    -- user-owned tables.
    if exists (
      select 1 from public.users u
      where u.id = v_uid
        and u.deletion_pending = true
        and u.deletion_pending_at is not null
        and u.deletion_pending_at >= now() - interval '60 minutes'
    ) then
      raise exception 'SpendFlow: account deletion is in progress — writes are disabled';
    end if;
  end if;

  return new;
end;
$$;

-- Re-pin (CREATE OR REPLACE keeps SET clauses only when present on the new
-- definition; the pin above is included, this ALTER is belt-and-braces).
alter function public.block_writes_during_deletion()
  set search_path = pg_catalog, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. delete_user_data: in-function caller-role guard (grants stay as they are).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claims jsonb;
begin
  -- Defense-in-depth (audit M3): refuse any REST-authenticated caller that
  -- is not the service role, independent of the GRANT history. PostgREST
  -- sets request.jwt.claims per transaction; an empty/absent GUC means this
  -- is direct SQL (superuser/service maintenance context), which the grants
  -- already bound to trusted roles.
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if v_claims is not null
     and coalesce(v_claims->>'role', '') <> 'service_role' then
    raise exception 'SpendFlow: delete_user_data is service-role only'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Children first (FKs into categories / bank_accounts are RESTRICT).
  delete from public.expenses              where user_id = p_user_id;
  delete from public.recurring_rules       where user_id = p_user_id;
  delete from public.transfers             where user_id = p_user_id;
  delete from public.category_budget_history where user_id = p_user_id;
  delete from public.bank_accounts         where user_id = p_user_id;
  delete from public.categories           where user_id = p_user_id;
  delete from public.user_settings_history where user_id = p_user_id;
  delete from public.device_tokens         where user_id = p_user_id;
  delete from public.notifications         where user_id = p_user_id;

  -- Profile row last (everything above also cascades from it, but the
  -- explicit delete makes the transaction's intent self-evident).
  -- bin_receipt_orphans is ON DELETE CASCADE (20260916000000:42).
  delete from public.users                  where id = p_user_id;
end;
$$;

revoke execute on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. users.email is server-authoritative, mirrored from auth.users.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_users_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text;
begin
  -- auth.users.email is the single truth for identity. Copy it over whatever
  -- any caller (including service-role REST writes) put on NEW; null auth
  -- email (e.g. an OAuth row mid-link) leaves the existing value untouched.
  select u.email into v_email from auth.users u where u.id = new.id;
  if v_email is not null and coalesce(new.email, '') <> v_email then
    new.email := v_email;
  end if;
  return new;
end;
$$;

alter function public.sync_users_email_from_auth()
  set search_path = pg_catalog, public;

drop trigger if exists users_sync_email_from_auth on public.users;
create trigger users_sync_email_from_auth
  before insert or update on public.users
  for each row execute function public.sync_users_email_from_auth();

-- One-time repair of rows that already drifted (email changes updated only
-- GoTrue historically — see services/auth.ts change-email flow).
update public.users u
   set email = a.email
  from auth.users a
 where u.id = a.id
   and a.email is not null
   and u.email is distinct from a.email;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger-function privileges: PUBLIC revoked, API roles explicit.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_updated_at()',
    'public.validate_owned_references()',
    'public.block_writes_during_deletion()',
    'public.enforce_settings_history_dates()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', fn);
  end loop;
end;
$$;
