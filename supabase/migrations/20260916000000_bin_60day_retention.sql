-- ═══════════════════════════════════════════════════════════════════════════
-- Bin: Google-Photos-style 60-day trash for expenses & recurring rules
--
-- Deleting an expense or a recurring plan now MOVES it to the Bin instead of
-- removing it: the row keeps existing with deleted_at set, the app shows a
-- per-item countdown, and after 60 days a nightly pg_cron job deletes the rows
-- for real — so the hot tables shrink on their own (DB-load reduction) without
-- waiting for every user to open the app.
--
-- 1. recurring_rules gains deleted_at (expenses already had it since P0).
--    Client queries filter deleted_at IS NULL; RLS stays owner-scoped as-is
--    (no deleted_at clause exists on any policy), so the Bin screen can list,
--    restore and purge rows with ordinary authenticated calls.
-- 2. purge_expired_bin_items(): SECURITY DEFINER sweep run by pg_cron at
--    03:30 UTC daily. Not executable by anon/authenticated — the app never
--    needs it (restore/delete-forever are plain RLS queries).
-- 3. bin_receipt_orphans: hard-deleting rows in SQL cannot remove private
--    receipt objects from Storage, so the purge records their <uid>/<file>
--    paths here and the owner's next Bin visit claims + removes them client
--    side via the existing owner-scoped storage DELETE policy.
--
-- Idempotent throughout. Re-applying after the first run is a no-op except
-- re-registering the cron job (cron.schedule upserts by job name).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trash column on recurring_rules + Bin read index
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.recurring_rules
  add column if not exists deleted_at timestamptz;

-- Mirrors expenses_user_deleted_idx: serves the Bin listing
-- (user_id = ? AND deleted_at IS NOT NULL) without touching the partial live
-- indexes used by every normal query.
create index if not exists recurring_rules_user_deleted_idx
  on public.recurring_rules(user_id, deleted_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Orphan queue for receipt files whose owning row was purged by cron
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.bin_receipt_orphans (
  user_id uuid not null references public.users(id) on delete cascade,
  path text not null,
  purged_at timestamptz not null default now()
);

-- Enabling RLS with zero policies means nobody but the definer functions below
-- (running as the table owner) can read or write this queue; cascade on user
-- deletion cleans any residue if a user leaves before draining it.
alter table public.bin_receipt_orphans enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Nightly sweep — rows older than the 60-day window leave the database
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_expired_bin_items()
returns bigint
language plpgsql
security definer
set search_path = public
as $bin$
declare
  v_cutoff timestamptz := now() - interval '60 days';
  v_expenses bigint;
  v_rules bigint;
begin
  -- Receipt paths first: once the expense row is gone the file reference is
  -- unrecoverable. Only clean `<uid>/...` storage paths are queued — legacy
  -- absolute URLs (pre-path-convention rows) are left alone rather than
  -- guess-parsed; they remain unreachable either way.
  insert into public.bin_receipt_orphans (user_id, path)
  select e.user_id, e.receipt_image_url
  from public.expenses e
  where e.deleted_at is not null
    and e.deleted_at < v_cutoff
    and e.receipt_image_url is not null
    and e.receipt_image_url not like 'http%'
    and e.receipt_image_url like e.user_id::text || '/%';

  delete from public.expenses
  where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_expenses = row_count;

  delete from public.recurring_rules
  where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_rules = row_count;

  -- Booked installments of a purged rule keep their is_recurring flag; the
  -- FK (on delete set null) detaches recurring_rule_id automatically.

  return v_expenses + v_rules;
end;
$bin$;

-- pg_cron executes as the scheduling role; the app must never call it directly.
revoke execute on function public.purge_expired_bin_items() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Client-side drain: atomically claims THIS user's queued receipt paths
--    (delete + returning in one statement, so two devices never double-remove)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_bin_receipt_orphans()
returns setof text
language sql
security definer
set search_path = public
as $bin$
  delete from public.bin_receipt_orphans
  where user_id = (select auth.uid())
  returning path;
$bin$;

revoke execute on function public.claim_bin_receipt_orphans() from public, anon;
grant execute on function public.claim_bin_receipt_orphans() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Daily schedule (03:30 UTC — quiet hour on every populated continent)
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'spendflow-bin-purge',
  '30 3 * * *',
  $cron$select public.purge_expired_bin_items();$cron$
);
