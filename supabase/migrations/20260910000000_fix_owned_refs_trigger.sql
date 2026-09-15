-- Description: Fixes `record "new" has no field "category_id"` breaking ALL
-- authenticated writes to `transfers` (and the same class of failure for
-- recurring_rules updates, via `bank_account_id`).
--
-- Root cause: validate_owned_references() ran a "shared" new.category_id
-- check for every table its trigger is attached to — but `transfers` has no
-- category_id column, so any authenticated INSERT/UPDATE (auth.uid() non-null)
-- crashed before the write. It also references new.bank_account_id in the
-- recurring_rules branch, and this project's live schema never added that
-- column to recurring_rules (the ALTER lives in
-- 20260828020000_create_bank_accounts.sql but was never applied), so
-- recurring-rule updates crashed the same way.
--
-- Fix: scope every column check to its own table inside the tg_table_name
-- branches. No cross-table column references remain, so each table only ever
-- touches fields it actually has.

create or replace function public.validate_owned_references()
returns trigger
language plpgsql
as $$
declare
  v_user uuid := new.user_id;
begin
  -- Trusted server-side context (service role): auth.uid() is null there.
  -- Admin tooling may write across users by design; RLS is bypassed for it.
  if auth.uid() is null then
    return new;
  end if;

  if v_user is distinct from auth.uid() then
    raise exception 'SpendFlow ownership check: cannot write a row for another user';
  end if;

  if tg_table_name = 'expenses' then
    if new.category_id is not null and not exists (
      select 1 from public.categories c
      where c.id = new.category_id
        and c.user_id = auth.uid()
    ) then
      raise exception 'SpendFlow ownership check: category does not belong to you';
    end if;
    if new.bank_account_id is not null and not exists (
      select 1 from public.bank_accounts b
      where b.id = new.bank_account_id
        and b.user_id = auth.uid()
    ) then
      raise exception 'SpendFlow ownership check: bank account does not belong to you';
    end if;
    if new.recurring_rule_id is not null and not exists (
      select 1 from public.recurring_rules r
      where r.id = new.recurring_rule_id
        and r.user_id = auth.uid()
    ) then
      raise exception 'SpendFlow ownership check: recurring rule does not belong to you';
    end if;

  elsif tg_table_name = 'recurring_rules' then
    if new.category_id is not null and not exists (
      select 1 from public.categories c
      where c.id = new.category_id
        and c.user_id = auth.uid()
    ) then
      raise exception 'SpendFlow ownership check: category does not belong to you';
    end if;
    -- bank_account_id deliberately NOT checked here: this project's live
    -- recurring_rules table has no such column (the ALTER in
    -- 20260828020000_create_bank_accounts.sql was never applied to this
    -- environment). If that column is ever added, re-add the check.

  elsif tg_table_name = 'transfers' then
    -- transfers has no category_id — the shared check used to crash here.
    if not exists (
      select 1 from public.bank_accounts b
      where b.id = new.from_account_id
        and b.user_id = auth.uid()
    ) then
      raise exception 'SpendFlow ownership check: source account does not belong to you';
    end if;
    if not exists (
      select 1 from public.bank_accounts b
      where b.id = new.to_account_id
        and b.user_id = auth.uid()
    ) then
      raise exception 'SpendFlow ownership check: destination account does not belong to you';
    end if;

  elsif tg_table_name = 'category_budget_history' then
    if new.category_id is not null and not exists (
      select 1 from public.categories c
      where c.id = new.category_id
        and c.user_id = auth.uid()
    ) then
      raise exception 'SpendFlow ownership check: category does not belong to you';
    end if;
  end if;

  return new;
end;
$$;

-- Triggers are unchanged (they already exist from 20260908000000); the
-- function body swap takes effect immediately for all four tables.
