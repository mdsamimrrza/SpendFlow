# Recurring Payments — Implementation Plan

**Mental model:** *You add a payment. If it repeats, you tick Repeat.* One save creates
today's expense + tomorrow's plan. Future cycles are either auto-posted (`auto_charge`)
or confirmed with one tap (`Mark Paid`, `pay_on_due`). The cycle chain is
**schedule-locked**: paying late never moves the chain; it is only noted.

Decisions locked in review:
- No auto-re-anchoring on late payment. Chain = `plan_start_date + N × cycle`.
- Rule edits future; occurrence edits the past. Never let a row edit mutate the rule.
- `mode` default is `pay_on_due` (safe: shows a due card instead of silently booking money).
- Row `date` = actual payment date (ledger truth); the slot key lives in
  `expenses.recurring_due_date`; dedup index on `(recurring_rule_id, recurring_due_date)`.
- Pending slots in `pay_on_due` mode have NO expense row until Mark Paid.
- i18n: every new string lands in `constants/i18n/{en,hi,ne}.ts` in the same change.
- Theme: colors only via `useTheme()`. Budget math untouched — pending plans never
  count against the month; only posted rows do.

---

## 1. Data model (migration)

**`recurring_rules` — 3 new columns**

| Column | Type | Meaning |
|---|---|---|
| `interval_days` | `int null` | used only when `frequency = 'custom'` (e.g. 28-day recharge) |
| `mode` | `text 'auto_charge' \| 'pay_on_due'`, default `pay_on_due` | auto-post vs. Mark Paid |
| `plan_start_date` | `date` | chain anchor; chain = start + N × cycle |

**`expenses` — 1 new column + index swap**

| Column | Type | Meaning |
|---|---|---|
| `recurring_due_date` | `date null` | installment slot this row satisfies |

Swap unique index `expenses_recurring_rule_date_unique (recurring_rule_id, date)`
→ `(recurring_rule_id, recurring_due_date)` — payment dates vary, slot keys don't.

**Migration backfill (zero behavior change for existing users):**
- existing rules: `plan_start_date = next_due_date` (first known slot), `mode = 'auto_charge'`
  → current auto-post behavior is preserved exactly.

## 2. Engine — `services/recurring.ts`

- `nextDate()`: add `custom` branch → `addDays(cursor, interval_days)` (fallback 30 if null).
- `createRecurringRule()` / `updateRecurringRule()`: accept `interval_days`, `mode`,
  `plan_start_date`; validate `interval_days` 1–365 when frequency is `custom`.
- `generateDueRecurringExpenses()`:
  - skip rules where `mode === 'pay_on_due'` (no silent row creation);
  - inserted rows get `recurring_due_date = slot` (and `date = slot`, on-time by definition);
  - dedup conflict target becomes `recurring_rule_id,recurring_due_date`.
- **New `markOccurrencePaid(userId, ruleId, paidDate)`** — the one shared write:
  1. slot = rule `next_due_date`; insert expense (`date = paidDate`,
     `recurring_due_date = slot`, tagged rule id, FX snapshot via `getRate(slot)`);
  2. advance `next_due_date = slot + cycle` — always chain arithmetic, never
     `paidDate + cycle`;
  3. idempotent via unique slot index (double-tap / two-device race = one row).
- **New `skipCurrentOccurrence(userId, ruleId)`** — advance chain one slot, insert nothing.
  Now runs through the server-side `skip_recurring_occurrence` RPC (migration
  `20261027030000`) so it is atomic against the nightly auto-charge poster:
  an open slot just advances the chain; if the poster already booked the slot
  (auto_charge), the booking is hard-deleted in the same transaction
  (`cancelled_booking = true`) and the chain stays forward. Falls back to the
  client-side advance when the RPC isn't deployed yet.
- **New `cancelRecurringOccurrence(userId, ruleId)`** — removes an already-BOOKED
  auto_charge installment (same RPC, requires `cancelled_booking`): deletes the
  occurrence, keeps the chain forward — the cycle is cancelled, not re-opened,
  so the poster never re-books it. pay_on_due bookings use
  `undoLatestOccurrencePayment` instead (their money really moved).
- **New `undoLatestOccurrencePayment(userId, ruleId)`** — delete the newest occurrence row
  and pull `next_due_date` back one slot; only allowed for the most recent slot.

**Server poster (`20261027030000`, audit A20):** nightly pg_cron `spendflow-auto-charge-post`
(03:00 UTC) posts due slots for every active auto_charge rule directly
(`post_due_auto_charge_expenses()`), unconditionally — no balance gating
(mandate semantics) — idempotent via the `(recurring_rule_id, recurring_due_date)`
unique index. `advance_recurring_date()` mirrors the client `nextDate()` exactly
(daily +1, weekly +7, custom +interval_days, else +1 calendar month) so server
and client chains can never diverge. Manual `pay_on_due` rules are never touched
by the server; they wait for Mark Paid indefinitely.

## 3. Add Expense form — `components/expense/ExpenseForm.tsx` (mobile + web identical)

**FINAL DECISION (review):** the in-form "REPEATS" creation block was removed.
Plans are created ONLY from the Recurring tab (create/edit modal, incl.
"Every N days" + billing mode). The Add Expense form's recurring surface is
exactly one thing — the **"Pay from plan" dropdown** (§6) that pays an
existing plan's open installment.

Kept in the form:
- Notes: collapsed `📝 Add a note (optional)` row under the quick tags,
  auto-expanded in edit mode when a note exists (`notes` column);
- "Part of a plan — manage →" badge on rule-linked rows in edit mode
  (row edits never touch the rule);
- Delete on a rule-linked row → three-way dialog: *This payment only* /
  *Cancel plan too* / Cancel.

## 4. Recurring tab — `app/(tabs)/recurring.tsx`

Rule card redesign — paid state derived from the latest occurrence row:

```
📱 Mobile Recharge          28-day plan
[ DUE · overdue 5 days ]  ← red until actioned
₹289 · next due Oct 14 · plan from Sep 16
✓ Sep 16 (on time)  ✓ Oct 19 (late 5)  ○ Nov 11 pending
                   [ Mark Paid ]  [ Skip this cycle ]
```

- Pending slot → `[Mark Paid]` (opens Add Expense prefilled with the plan) +
  `[Skip this cycle]`; the payment is only posted after the user reviews and
  saves the form. Add Expense applies its normal linked-account balance guard;
  after a just-posted payment offer `[Not paid — undo]`
  (calls `undoLatestOccurrencePayment`; most recent slot only).
- Timeline strip: past slots from actual rows (✓ + late N), current slot
  (pending/due/paid), 2 future slots as grey chain positions.
- Rule edit sheet: frequency/interval change re-derives `next_due_date` from the
  last due slot (not from today); `mode` toggle; `Shift anchor…` (explicit new
  `plan_start_date` for plans that re-validate from recharge day);
  stats line `Late N× in last M · avg X days`.

## 5. Web record view + dashboard

**Record preview rule (mobile vs desktop):** the live record preview is a
desktop right-rail element only. Below 1024px there is NO preview anywhere —
the form itself is the source (the sticky save bar already mirrors the
type-colored total), and a duplicated preview card on phones just wastes the
viewport. The Notes field is part of the form at every breakpoint (collapsed
"📝 Add a note" row under the quick tags; auto-expanded in edit mode when a
note exists).

- Record **Recurrence** line: `Recurring · 28-day plan (from Sep 16)` +
  `Slot due Oct 14 · Paid Oct 19 · 5 days late ✓`.
- Dashboard `Bills due` strip: count + worst overdue chip → Recurring tab.
- Notifications: keep due-date reminder for both modes; `pay_on_due` re-prompts
  daily while overdue (local, quiet hours respected).

## 6. Pay-from-plan dropdown (replaces the auto-detected chip)

**Placement (review):** NOT at the top of the form. It renders as a quiet
dashed pill directly under the amount hero card — `🔁 Pay from plan (N)` —
and only expands into the full dropdown card when tapped (or stays expanded
after a plan is picked, with a `✕ Change` pill to clear). A normal add-expense
must still look like a normal add-expense.

Add Expense (add mode, expense, when active rules exist) shows a
**"Pay from plan"** dropdown listing active rules with amount + slot state
(`Due today` / `Overdue 5d · slot due Oct 14` / `next due Nov 11`).

Selecting a rule **auto-fills** amount / category / currency / description /
payment channel / account and sets the date to **today**. There are no
recurrence-creation controls in the form — plans are created in the Recurring
tab only (§3). On save the form calls `payPlanFromForm()`:

1. Books the rule's open slot with the FORM's values (a corrected price wins
   and self-updates the rule) — `date` = payment date, slot key preserved,
   unique slot index still blocks double-booking ("already paid" error).
2. **Re-anchors the chain from the payment date**: next due = paid date +
   cycle — "everything starts counting from today" (validity-style plans like
   the 28-day recharge).

This is deliberately different from the Recurring tab's former direct Mark
Paid write. Dashboard and Recurring-tab Mark Paid now open this same form path,
so every payment is reviewed, balance-checked, and saved through the normal
expense flow.

## 7. Phases

1. **P1 — Engine:** migration + types + `custom` branch + mode-skip + `markOccurrencePaid`
   /`skip`/`undo`. Existing rules default to preserved behavior.
2. **P2 — Recurring tab:** card redesign, Mark Paid/Skip/undo, timeline, edit guards.
3. **P3 — Add Expense:** Pay-from-plan dropdown + Notes field + edit badges/delete dialog (REPEATS creation block removed in review).
4. **P4 — Auto-detected duplicate chip shipped, then replaced by the P3 dropdown (user-initiated); dashboard bills-due strip stays.**

**Non-goals:** no auto-re-anchoring on late payment; no rule editing from expense
edit; no partial/split recurrences.

## 8. SQL (to run via Supabase)

```sql
-- See supabase/migrations/20260915000000_recurring_payment_model.sql for the
-- authoritative version, incl. backfill: existing rules become plan_start_date
-- = next_due_date, mode = 'auto_charge' (behavior preserved); expenses get
-- recurring_due_date = date for tagged rows; the (rule, date) unique index is
-- replaced by (recurring_rule_id, recurring_due_date), non-partial by design —
-- soft-deleted occurrences keep holding their slot; "undo" hard-deletes.
alter table public.recurring_rules
  add column interval_days integer check (interval_days between 1 and 365),
  add column mode text not null default 'pay_on_due'
    check (mode in ('auto_charge','pay_on_due')),
  add column plan_start_date date;

alter table public.expenses
  add column recurring_due_date date;

drop index expenses_recurring_rule_date_unique;
create unique index expenses_recurring_rule_slot_unique
  on public.expenses (recurring_rule_id, recurring_due_date);
```
