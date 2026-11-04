-- Description: Server-side auto-charge posting (audit 2026-10-27, A20).
-- Until now `auto_charge` rules were posted ONLY at app-open by the client's
-- generateDueRecurringExpenses() — a user who didn't open the app got no
-- ledger rows and budgets/balances under-stated. This nightly job posts due
-- slots for every active auto_charge rule directly, using the exact same
-- idempotency key the client uses: the (recurring_rule_id,
-- recurring_due_date) unique index — a slot booked by a device or a Mark
-- Paid conversion is skipped, never duplicated.
--
-- Semantic note: the CLIENT login path skips a slot when the live balance
-- check fails (insufficient balance). The server cannot reproduce that
-- client-side snapshot-rate balance math, so the nightly poster records the
-- scheduled debit unconditionally — matching real auto-debit mandate
-- behavior (the bank debits regardless of the app's opinion). Rows land in
-- the ledger with the correct slot date either way; the login-time client
-- pass stays as-is and remains idempotent against these rows.
--
-- Companion to the client change in services/recurring.ts (hoisted balance
-- context) and requires migration 20261027020000 (dedupe index pattern).

-- Mirrors services/recurring.ts nextDate() exactly, so a server-posted chain
-- and a client-posted chain never diverge: daily → +1, weekly → +7 (the
-- client ignores interval_days for both), custom → +interval_days, everything
-- else (monthly/unknown) → +1 calendar month, which clamps day-of-month like
-- date-fns addMonths (Jan 31 → Feb 28). interval_days 0/NULL on custom is
-- guarded to 30 so a pathological row can never stall the poster's cursor.
create or replace function public.advance_recurring_date(
  p_cursor date,
  p_frequency text,
  p_interval_days int
)
returns date
language sql
immutable
as $$
  select case
    when p_frequency = 'daily' then p_cursor + 1
    when p_frequency = 'weekly' then p_cursor + 7
    when p_frequency = 'custom' then p_cursor + coalesce(nullif(p_interval_days, 0), 30)
    else (p_cursor + interval '1 month')::date
  end;
$$;

create or replace function public.post_due_auto_charge_expenses()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule record;
  v_cursor date;
  v_slot date;
  v_slots int;
  v_last date;
  v_total int := 0;
begin
  for v_rule in
    select r.* from public.recurring_rules r
    where r.is_active
      and coalesce(r.mode, 'auto_charge') = 'auto_charge'
      and r.deleted_at is null
      and r.next_due_date <= current_date
      and r.bank_account_id is not null
    order by r.next_due_date
    limit 500
  loop
    v_cursor := v_rule.next_due_date;
    v_slots := 0;
    v_last := v_rule.next_due_date;

    -- Collect + post due slots (bounded per rule at 60 = two years of monthly)
    while v_cursor <= current_date and v_slots < 60 loop
      v_slot := v_cursor;
      insert into public.expenses
        (id, user_id, category_id, amount, currency, description,
         bank_account_id, date, payment_method, type, is_recurring,
         recurring_rule_id, recurring_due_date, is_synced, created_at, updated_at)
      values
        (gen_random_uuid(), v_rule.user_id, v_rule.category_id, v_rule.amount,
         v_rule.currency, v_rule.description, v_rule.bank_account_id, v_slot,
         v_rule.payment_method, 'expense', true,
         v_rule.id, v_slot, true, now(), now())
      on conflict (recurring_rule_id, recurring_due_date) do nothing;

      if found then
        v_slots := v_slots + 1;
        v_total := v_total + 1;
      end if;
      v_last := v_slot;
      v_cursor := public.advance_recurring_date(v_slot, v_rule.frequency, v_rule.interval_days);
    end loop;

    if v_slots > 0 then
      update public.recurring_rules
      set next_due_date = v_cursor, updated_at = now()
      where id = v_rule.id;
    end if;

    exit when v_total >= 500;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.post_due_auto_charge_expenses() from public, anon;
revoke all on function public.advance_recurring_date(date, text, int) from public, anon;

-- Nightly 03:00 UTC, after the bin purge (03:30 UTC is taken — this is 03:00)
select cron.schedule(
  'spendflow-auto-charge-post',
  '0 3 * * *',
  $$select public.post_due_auto_charge_expenses()$$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic per-cycle skip, called by the app (authenticated users) so a user can
-- delay / opt out of ONE installment without racing the nightly poster:
--   1. Open slot (next_due_date <= today, nothing booked yet): hard-delete any
--      stray row at that slot and advance the chain one cycle — the
--      installment never exists. Works for BOTH modes (this is the classic
--      "Skip this cycle" on a pay_on_due due card).
--   2. Booked installment (auto_charge only): the poster/client already booked
--      the slot and moved the chain exactly one cycle past it — hard-delete
--      that occurrence but KEEP the chain forward, so the cycle is cancelled,
--      not re-opened (the poster will not re-book it). pay_on_due bookings
--      are never auto-cancelled here; their undo flow (re-open for re-payment)
--      stays the correct lever.
-- Returns {"skipped_slot": date, "cancelled_booking": bool}, or NULL when
-- nothing is skippable (rule missing / not owned / chain not one cycle past).
-- SECURITY DEFINER bypasses RLS, so every statement filters by auth.uid().
-- Row is locked FOR UPDATE so a concurrent poster transaction serializes
-- against this instead of interleaving.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.skip_recurring_occurrence(p_rule_id uuid)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.recurring_rules;
  v_slot date;
begin
  select * into r
  from public.recurring_rules
  where id = p_rule_id
    and user_id = auth.uid()
    and deleted_at is null
  for update;
  if not found then
    return null;
  end if;

  -- 1) Open slot due: cancel nothing (a booked row here would mean the chain
  --    was never advanced for it — delete it too, then step forward).
  if r.next_due_date <= current_date then
    v_slot := r.next_due_date;
    delete from public.expenses
    where recurring_rule_id = r.id
      and recurring_due_date = v_slot
      and user_id = r.user_id;

    update public.recurring_rules
    set next_due_date = public.advance_recurring_date(v_slot, r.frequency, r.interval_days),
        updated_at = now()
    where id = r.id;

    return json_build_object('skipped_slot', v_slot, 'cancelled_booking', false);
  end if;

  -- 2) Latest booked auto_charge installment, chain exactly one cycle past it.
  if coalesce(r.mode, 'auto_charge') = 'auto_charge' then
    select e.recurring_due_date into v_slot
    from public.expenses e
    where e.recurring_rule_id = r.id
      and e.user_id = r.user_id
      and e.deleted_at is null
      and e.recurring_due_date is not null
    order by e.recurring_due_date desc
    limit 1;

    if v_slot is not null
       and r.next_due_date = public.advance_recurring_date(v_slot, r.frequency, r.interval_days) then
      delete from public.expenses
      where recurring_rule_id = r.id
        and recurring_due_date = v_slot
        and user_id = r.user_id
        and deleted_at is null;

      return json_build_object('skipped_slot', v_slot, 'cancelled_booking', true);
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.skip_recurring_occurrence(uuid) from public, anon;
grant execute on function public.skip_recurring_occurrence(uuid) to authenticated;
