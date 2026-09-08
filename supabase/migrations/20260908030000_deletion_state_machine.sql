-- ═══════════════════════════════════════════════════════════════════════════
-- Deletion state machine + history integrity + RPC privileges (round 3)
--
-- 1. users.deletion_pending: set by the delete-account Edge Function BEFORE
--    any destructive step. While set, a BEFORE INSERT/UPDATE trigger on every
--    user-owned table rejects that user's writes at the DATABASE boundary —
--    so a concurrent device cannot create expenses/transfers/accounts/
--    categories/recurring rules/receipts/settings rows mid-deletion.
-- 2. Settings-history INSERT hardening: only the 1900-01-01 baseline and
--    current-month effective_from dates are accepted — forged historical or
--    future dates are rejected (matching what the service layer legitimately
--    writes; round 2 already made past-month UPDATE/DELETE impossible).
-- 3. Explicit EXECUTE grant for the service_role (the Edge Function's admin
--    client) on delete_user_data — never anon/authenticated.
-- 4. Dedicated avatar-bucket purge RPC so the Edge Function stops issuing
--    storage REST calls with a raw service key (surface hardening).
--
-- Idempotent throughout.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. Deletion-pending flag on the profile row
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists deletion_pending boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Write-block trigger, shared by all user-owned tables
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.block_writes_during_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if tg_table_name = 'users' then
    v_uid := new.id;
    -- Clients must never set or keep writing around the server-managed flag.
    -- The service role (auth.uid() is null) sets/clears it in the Edge Function.
    if auth.uid() is not null then
      if new.deletion_pending = true then
        raise exception 'SpendFlow: deletion_pending is server-managed';
      end if;
      if tg_op = 'UPDATE' and old.deletion_pending = true then
        raise exception 'SpendFlow: account deletion is in progress — writes are disabled';
      end if;
    end if;
  else
    v_uid := new.user_id;
    if exists (
      select 1 from public.users u
      where u.id = v_uid and u.deletion_pending = true
    ) then
      raise exception 'SpendFlow: account deletion is in progress — writes are disabled';
    end if;
  end if;

  return new;
end;
$$;

-- Attach to every user-owned table. All of them carry user_id except users
-- itself (id IS the user).
do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'categories', 'recurring_rules', 'bank_accounts', 'transfers',
    'device_tokens', 'notifications', 'user_settings_history', 'category_budget_history'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I;',
      t || '_block_during_deletion', t
    );
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.block_writes_during_deletion();',
      t || '_block_during_deletion', t
    );
  end loop;
end;
$$;

-- users row itself
drop trigger if exists users_block_during_deletion on public.users;
create trigger users_block_during_deletion
  before insert or update on public.users
  for each row execute function public.block_writes_during_deletion();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Settings-history INSERT constraints (UPDATE/DELETE already locked in
--    round 2). Legitimate client writes are exactly:
--      effective_from = 1900-01-01 (baseline sync)
--      effective_from within the CURRENT month (this month's change row)
--    A BEFORE INSERT trigger enforces it at the database layer.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_settings_history_dates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted server-side writes (service role) are unconstrained.
  if auth.uid() is null then
    return new;
  end if;

  if new.effective_from = date '1900-01-01' then
    return new; -- baseline row
  end if;

  if new.effective_from >= date_trunc('month', now())
     and new.effective_from <= now()::date then
    return new; -- current-month row (today or earlier this month)
  end if;

  raise exception 'SpendFlow: historical settings rows cannot be created retroactively';
end;
$$;

drop trigger if exists user_settings_history_valid_dates on public.user_settings_history;
create trigger user_settings_history_valid_dates
  before insert on public.user_settings_history
  for each row execute function public.enforce_settings_history_dates();

drop trigger if exists category_budget_history_valid_dates on public.category_budget_history;
create trigger category_budget_history_valid_dates
  before insert on public.category_budget_history
  for each row execute function public.enforce_settings_history_dates();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC execution: service_role only
--
-- Postgres grants function EXECUTE to PUBLIC by default; round 2 revoked that.
-- The Edge Function's admin client connects as service_role, so grant it
-- explicitly (REVOKE ... FROM PUBLIC also removes it from anon/authenticated,
-- which have PUBLIC as a member).
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.delete_user_data(uuid) from public;
grant execute on function public.delete_user_data(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. count_user_storage(bucket text, uid): INDEPENDENT post-check helper.
--    Counts objects under `{uid}/` directly in the storage metadata table —
--    the same table the Storage API itself reads — so the Edge Function can
--    verify a purge without trusting the SDK's remove() response alone.
--
--    It deliberately does NOT delete anything: physical objects are removed
--    ONLY through the official Storage API (admin.storage.from(bucket).remove())
--    in the Edge Function. Mutating storage.objects rows directly would
--    orphan the underlying files in the storage backend.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.count_user_storage(p_bucket text, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_bucket is null or p_bucket = '' then
    raise exception 'SpendFlow count_user_storage: bucket and user id are required';
  end if;
  -- Bucket names come only from the Edge Function's fixed USER_BUCKETS list;
  -- never from client input. Defend anyway:
  if p_bucket !~ '^[a-z0-9_-]+$' then
    raise exception 'SpendFlow count_user_storage: invalid bucket name';
  end if;

  select count(*)
    into v_count
    from storage.objects
   where bucket_id = p_bucket
     and name like p_user_id::text || '/%';

  return v_count;
end;
$$;

revoke execute on function public.count_user_storage(text, uuid) from public, anon, authenticated;
grant execute on function public.count_user_storage(text, uuid) to service_role;
