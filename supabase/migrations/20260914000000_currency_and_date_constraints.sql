-- ═══════════════════════════════════════════════════════════════════════════
-- Client-only validation → DB constraints (round 6 pentest findings MEDIUM-3,
-- MEDIUM-4, LOW-7)
--
-- Verified live before this migration (read-only scan, 2026-09-11): every
-- stored currency value matches ^[A-Z]{3}$, no expense date is future or
-- pre-2000, and max stored amount is 40,807 — so these ADD CONSTRAINTs
-- cannot fail on existing rows.
--
-- Findings being closed:
--   MEDIUM-3: expenses.currency (and sibling currency columns) accepted
--     arbitrary strings — "<img src=x>" was stored verbatim. The client's
--     escapeHtml/sanitizeSpreadsheetCell guards hold, but the DB is the real
--     boundary and had no rule.
--   MEDIUM-4: expense dates were unbounded in the DB — INSERT/UPDATE with
--     2027-06-01 and 1999-01-01 both succeeded. Future-dated rows never land
--     in any budget cycle, silently skewing analytics.
--   LOW-7: expenses.amount is UNBOUNDED numeric (initial schema) — the
--     pentest stored 9999999999999999 verbatim. The client already caps at
--     MAX_AMOUNT = 1e12 (services/expenses.ts); this mirrors that at the
--     boundary.
--
-- Design notes:
--   * COLLATION TRAP (why COLLATE "C"): PostgreSQL evaluates regex bracket
--     ranges in the column's collation order. Under glibc en_US.UTF-8
--     (Supabase's default), letters interleave as A a B b … Z z, so a bare
--     [A-Z] matches lowercase a–y — 'npr' would PASS '~ ^[A-Z]{3}$'.
--     Forcing COLLATE "C" makes the range byte-order (0x41–0x5A, strict
--     uppercase ASCII) regardless of database locale.
--   * ISO-4217-shaped rule: exactly 3 strict-uppercase letters. The app's 12
--     enabled currencies all match; client writers .toUpperCase() before
--     insert; all live rows conform.
--   * Date window: date >= '2000-01-01' AND date <= current_date + 1.
--     The +1 day of future slack is deliberate: current_date in Postgres is
--     UTC, but the user base spans UTC+5:45 (Nepal) to UTC+9 (Korea/Japan).
--     A Kathmandu user entering "today" between local midnight and 05:45
--     writes a date one day ahead of UTC today; without slack the constraint
--     would reject legitimate entries. One day of slack preserves the
--     analytics fix (nothing lands months/years out) while staying
--     timezone-correct. The client date picker never offers future dates
--     (isoDate() = local today) and recurring generation only posts
--     already-due occurrences, so legitimate writes never exceed the window.
--   * recurring_rules.next_due_date stays deliberately UNBOUNDED on the
--     upper end: next_due_date IS a future date by design ("rent due on the
--     1st of next month"). Only its lower bound is pinned.
--   * transfers.date gets the same window (same client isoDate() source).
--   * Recreate-style idempotency: drop constraint if exists + add — safe to
--     re-run, and safe to apply even if a partial version already ran.
--   * Service-role writes (backfills, edge functions) bypass RLS but NOT
--     these CHECKs — every such writer was verified to write conforming
--     values (backfills write 'USD' base_currency; recurring generation
--     writes the rule's stored currency; both conform).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Currency format CHECKs — everywhere a client-writable currency column lives
-- ─────────────────────────────────────────────────────────────────────────────

-- expenses (MEDIUM-3 primary target)
alter table public.expenses
  drop constraint if exists expenses_currency_format_check;
alter table public.expenses
  add constraint expenses_currency_format_check
  check ((currency COLLATE "C") ~ '^[A-Z]{3}$');

alter table public.expenses
  drop constraint if exists expenses_base_currency_format_check;
alter table public.expenses
  add constraint expenses_base_currency_format_check
  check (base_currency is null or (base_currency COLLATE "C") ~ '^[A-Z]{3}$');

-- recurring_rules (client-writable on rule create; feeds generated expenses)
alter table public.recurring_rules
  drop constraint if exists recurring_rules_currency_format_check;
alter table public.recurring_rules
  add constraint recurring_rules_currency_format_check
  check ((currency COLLATE "C") ~ '^[A-Z]{3}$');

alter table public.recurring_rules
  drop constraint if exists recurring_rules_base_currency_format_check;
alter table public.recurring_rules
  add constraint recurring_rules_base_currency_format_check
  check (base_currency is null or (base_currency COLLATE "C") ~ '^[A-Z]{3}$');

-- transfers (from_currency / to_currency are client-supplied)
alter table public.transfers
  drop constraint if exists transfers_from_currency_format_check;
alter table public.transfers
  add constraint transfers_from_currency_format_check
  check ((from_currency COLLATE "C") ~ '^[A-Z]{3}$');

alter table public.transfers
  drop constraint if exists transfers_to_currency_format_check;
alter table public.transfers
  add constraint transfers_to_currency_format_check
  check ((to_currency COLLATE "C") ~ '^[A-Z]{3}$');

-- bank_accounts (account currency, set via wizard / edit)
alter table public.bank_accounts
  drop constraint if exists bank_accounts_currency_format_check;
alter table public.bank_accounts
  add constraint bank_accounts_currency_format_check
  check ((currency COLLATE "C") ~ '^[A-Z]{3}$');

-- users (preferred currency is client-selectable)
alter table public.users
  drop constraint if exists users_preferred_currency_format_check;
alter table public.users
  add constraint users_preferred_currency_format_check
  check ((preferred_currency COLLATE "C") ~ '^[A-Z]{3}$');

-- user_settings_history.budget_currency already has a length-3 check from
-- 20260905010000 — tighten it to the same strict-uppercase shape so the
-- append-only audit trail can't be seeded with garbage via a client insert.
alter table public.user_settings_history
  drop constraint if exists user_settings_history_budget_currency_check;
alter table public.user_settings_history
  add constraint user_settings_history_budget_currency_check
  check (budget_currency is null or (budget_currency COLLATE "C") ~ '^[A-Z]{3}$');

-- ─────────────────────────────────────────────────────────────────────────────
-- Date window CHECKs (MEDIUM-4)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.expenses
  drop constraint if exists expenses_date_window_check;
alter table public.expenses
  add constraint expenses_date_window_check
  check (date >= date '2000-01-01' and date <= current_date + 1);

alter table public.transfers
  drop constraint if exists transfers_date_window_check;
alter table public.transfers
  add constraint transfers_date_window_check
  check (date >= date '2000-01-01' and date <= current_date + 1);

-- recurring_rules.next_due_date: future dates are its purpose — lower bound
-- only (rules scheduled in the past generate catch-up posts dated ≤ today).
alter table public.recurring_rules
  drop constraint if exists recurring_rules_next_due_date_lower_bound_check;
alter table public.recurring_rules
  add constraint recurring_rules_next_due_date_lower_bound_check
  check (next_due_date >= date '2000-01-01');

-- ─────────────────────────────────────────────────────────────────────────────
-- Amount sanity (LOW-7) — mirror the client's MAX_AMOUNT (1e12) at the DB.
-- expenses.amount is UNBOUNDED numeric by initial schema, so the CHECK is the
-- only bound there; recurring_rules.amount is also plain numeric.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.expenses
  drop constraint if exists expenses_amount_upper_bound_check;
alter table public.expenses
  add constraint expenses_amount_upper_bound_check
  check (amount <= 1000000000000);

alter table public.recurring_rules
  drop constraint if exists recurring_rules_amount_upper_bound_check;
alter table public.recurring_rules
  add constraint recurring_rules_amount_upper_bound_check
  check (amount <= 1000000000000);
