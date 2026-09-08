-- ═══════════════════════════════════════════════════════════════════════════
-- Integrity & ownership hardening (round 2)
--
-- 1. user_settings_history / category_budget_history become truly append-only
--    at the database level: UPDATE and DELETE policies are dropped, so a
--    normal authenticated user can no longer rewrite or erase their own
--    audit history (previously permitted by RLS "update own" being absent —
--    but explicitly allowed by Postgres grants for authenticated by default).
-- 2. One default bank account per user — partial unique index replaces the
--    client-side "unmark others" convention.
-- 3. exchange_rates insertable rows are constrained to positive rates.
--
-- Idempotent: safe to re-run on any environment.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Append-only settings history
--
-- The client legitimately rewrites TODAY's row (recordUserSettingsChange
-- updates the current-month row while the user is still tweaking settings in
-- the same month) and refreshes the 1900-01-01 baseline. UPDATE is therefore
-- allowed ONLY for the baseline row and for rows effective in the current
-- month — older rows become immutable. DELETE is denied entirely.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. user_settings_history: past rows immutable, no deletes ever
drop policy if exists "user settings history update own" on public.user_settings_history;
drop policy if exists "user settings history update own current" on public.user_settings_history;
create policy "user settings history update own current"
  on public.user_settings_history for update to authenticated
  using (
    auth.uid() = user_id
    and (
      effective_from = date '1900-01-01'
      or effective_from >= date_trunc('month', now())
    )
  )
  with check (
    auth.uid() = user_id
    and (
      effective_from = date '1900-01-01'
      or effective_from >= date_trunc('month', now())
    )
  );

drop policy if exists "user settings history delete own" on public.user_settings_history;
-- No delete policy is (re)created: DELETE is denied for all client roles.

-- 1b. category_budget_history: same shape
drop policy if exists "category budget history update own" on public.category_budget_history;
drop policy if exists "category budget history update own current" on public.category_budget_history;
create policy "category budget history update own current"
  on public.category_budget_history for update to authenticated
  using (
    auth.uid() = user_id
    and effective_from >= date_trunc('month', now())
  )
  with check (
    auth.uid() = user_id
    and effective_from >= date_trunc('month', now())
  );

drop policy if exists "category budget history delete own" on public.category_budget_history;
-- No delete policy is (re)created.

-- 1c. Defense in depth: with no DELETE policy, RLS already denies every
-- client DELETE; revoking the table-level DELETE grant keeps that true even
-- if RLS were ever accidentally disabled. UPDATE stays granted — the
-- constrained policy above is the row-level gate for it.
revoke delete on public.user_settings_history from authenticated, anon;
revoke delete on public.category_budget_history from authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Single default bank account per user
--
-- Business rule: only one account per user may carry is_default = true.
-- A partial unique index enforces it at the database level; the existing
-- client flow (unmark others, then mark the new one) satisfies it. Legacy
-- multi-default rows are collapsed to a single winner (most recently
-- updated) before the index is created so creation cannot fail.
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Collapse any existing multi-default rows: keep one per user.
with ranked_defaults as (
  select id,
         row_number() over (
           partition by user_id
           order by updated_at desc nulls last, created_at desc
         ) as rn
  from public.bank_accounts
  where is_default = true
)
update public.bank_accounts
set is_default = false
where id in (select id from ranked_defaults where rn > 1);

-- 2b. The partial unique index.
drop index if exists bank_accounts_one_default_per_user;
create unique index bank_accounts_one_default_per_user
  on public.bank_accounts (user_id)
  where is_default = true and deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. exchange_rates sanity: rates must be positive
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exchange_rates_rate_positive'
      and conrelid = 'public.exchange_rates'::regclass
  ) then
    alter table public.exchange_rates
      add constraint exchange_rates_rate_positive
      check (rate_to_usd > 0) not valid;
  end if;
end;
$$;
