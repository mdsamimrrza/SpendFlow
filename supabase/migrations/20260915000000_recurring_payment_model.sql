-- Recurring payments model: schedule-locked chains + explicit payment slots.
-- Plan: docs/recurring-plan.md
--
-- Existing users keep today's exact behavior: all pre-existing rules are
-- backfilled as `auto_charge` (login-time auto-post), anchored at their
-- current next_due_date. New rules default to `pay_on_due` (a visible due
-- card + Mark Paid tap — never silent money).

-- 1. Rule columns ----------------------------------------------------------------
alter table public.recurring_rules
  add column if not exists interval_days integer
    check (interval_days is null or (interval_days >= 1 and interval_days <= 365)),
  add column if not exists mode text not null default 'pay_on_due'
    check (mode in ('auto_charge', 'pay_on_due')),
  add column if not exists plan_start_date date;

-- Anchor existing rules at their current next slot and preserve auto-posting.
update public.recurring_rules
  set plan_start_date = next_due_date,
      mode = 'auto_charge'
  where plan_start_date is null;

-- 2. Expense occurrence slot key ---------------------------------------------------
alter table public.expenses
  add column if not exists recurring_due_date date;

-- Existing generated rows: the posting date WAS the slot date.
update public.expenses
  set recurring_due_date = date
  where recurring_rule_id is not null
    and recurring_due_date is null;

-- 3. Dedup index swap --------------------------------------------------------------
-- Old: one row per (rule, posting date) — posting dates now vary with late
-- payments, so the stable join key is the CHAIN SLOT instead. Manual rows keep
-- recurring_rule_id NULL and are excluded (NULLs are distinct).
-- NOTE: intentionally non-partial (same semantics as the index it replaces):
-- a soft-deleted occurrence keeps holding its slot so a later login never
-- resurrects a payment the user removed. "Not paid — undo" therefore HARD
-- deletes the occurrence row to free the slot again.
drop index if exists public.expenses_recurring_rule_date_unique;

create unique index if not exists expenses_recurring_rule_slot_unique
  on public.expenses (recurring_rule_id, recurring_due_date);
