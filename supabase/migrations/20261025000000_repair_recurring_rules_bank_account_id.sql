-- Description: Repairs schema drift between 20260828020000_create_bank_accounts.sql
-- and this environment's live database. The original migration included the
-- `recurring_rules.bank_account_id` ALTER, but it was never applied here (the
-- migrations are applied manually; 20260910000000 documents the gap), so
-- deleteBankAccount() crashes with PGRST204 ("Could not find the
-- 'bank_account_id' column of 'recurring_rules' in the schema cache") the
-- moment it tries to unlink recurring rules from a deleted account.
--
-- Idempotent: identical shape to the 20260828020000 statements, guarded with
-- IF NOT EXISTS, so environments that DID apply the original are untouched.
--
-- Also re-adds the bank_account_id ownership check that 20260910000000
-- deliberately skipped for recurring_rules while the column was missing
-- ("If that column is ever added, re-add the check.").

ALTER TABLE public.recurring_rules
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_rules_bank_account_id ON public.recurring_rules(bank_account_id);

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
    -- 20261025: the column now exists (repair above) — the check deferred in
    -- 20260910000000 is re-added so a rule cannot reference another user's
    -- account, same as the expenses branch.
    if new.bank_account_id is not null and not exists (
      select 1 from public.bank_accounts b
      where b.id = new.bank_account_id
        and b.user_id = auth.uid()
    ) then
      raise exception 'SpendFlow ownership check: bank account does not belong to you';
    end if;

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
