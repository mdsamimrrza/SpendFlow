-- ═══════════════════════════════════════════════════════════════════════════
-- Transfers integrity + users.cycle_start_day CHECK (round 6 pentest findings
-- LOW-5, LOW-6)
--
-- SCHEMA DRIFT CONTEXT (verified live, 2026-09-11): the repo's
-- 20260905020000_create_transfers.sql DEFINES
-- transfers_distinct_accounts (CHECK from <> to), but the pentest proved a
-- self-send INSERT returned 201 against production — the live table was
-- created before that constraint existed (early schema was applied directly
-- to production; see SECURITY-NOTES §6). This migration re-asserts the repo's
-- intended invariant on the live table. Verified before adding: zero
-- self-send rows and |converted - amount*rate| = 0 on all 4 live transfers.
--
-- Findings being closed:
--   LOW-6a: transfers allowed from_account_id = to_account_id (201 live) —
--     corrupts the destination account's computed balance (the client's
--     balance math credits the destination; a self-send inflates it).
--   LOW-6b: transfers accepted an attacker-chosen converted_amount
--     inconsistent with amount × exchange_rate (rate 0.001 + converted
--     999999 → 201 live) — same-user data corruption, but the ledger's core
--     invariant is enforced server-side now.
--   LOW-5: users.cycle_start_day accepted 1 — flagged by the pentest as
--     violating the client's 2–31 rule, but READ-FIRST ANALYSIS OVERTURNED
--     THE SUGGESTED FIX: 1 IS the app's designed "standard calendar cycle"
--     default (services/auth.ts ensureProfile/updateProfile resolve missing
--     values to 1; profit-loss.tsx isDefaultCycle = start 1 + no end day),
--     and 2 real production users legitimately hold cycle_start_day = 1.
--     A CHECK(2–31) would have failed ADD CONSTRAINT on existing rows and
--     broken every default-cycle profile save. The correct DB rule is the
--     original migration's 1–31: "1 = standard calendar, 2–31 = custom".
--     (The AGENTS.md "2–31 everywhere" note refers to the CLIENT clamp for
--     custom starts — the DB keeps 1 as the sentinel default. AGENTS.md is
--     being corrected in this change to state this explicitly.)
--
-- Design notes:
--   * converted_amount consistency: |converted_amount - amount * exchange_rate|
--     <= 0.05 tolerance. The client computes round2(amount * rate) (tolerance
--     covers the rounding step); verified 0.000000 diff on every live row.
--     A recompute-server-side trigger was considered and rejected: the rate
--     is legitimately client-resolved per transfer date through the exchange
--     service and LOCKED on the row (by design, per AGENTS.md), so the DB
--     validates the arithmetic relation rather than re-deriving inputs.
--   * cycle CHECK is recreate-style (drop + add) because the live users
--     table may carry the original 1–31 check from 20260831000000 — same
--     name, same rule; re-asserting is a no-op that heals drift.
--   * Idempotent throughout.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- LOW-6a: self-send transfers are nonsense movements — reject at the DB
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.transfers
  drop constraint if exists transfers_distinct_accounts;
alter table public.transfers
  add constraint transfers_distinct_accounts
  check (from_account_id <> to_account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- LOW-6b: converted_amount must match amount × locked rate (± rounding)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.transfers
  drop constraint if exists transfers_conversion_consistency_check;
alter table public.transfers
  add constraint transfers_conversion_consistency_check
  check (abs(converted_amount - amount * exchange_rate) <= 0.05);

-- ─────────────────────────────────────────────────────────────────────────────
-- LOW-5: cycle window bounds — 1 = standard calendar (designed default),
-- 2–31 = custom start. NOT NULL with default 1 (matches 20260831000000).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.users
  drop constraint if exists users_cycle_start_day_check;
alter table public.users
  add constraint users_cycle_start_day_check
  check (cycle_start_day >= 1 and cycle_start_day <= 31);

alter table public.users
  drop constraint if exists users_cycle_end_day_check;
alter table public.users
  add constraint users_cycle_end_day_check
  check (cycle_end_day is null or (cycle_end_day >= 1 and cycle_end_day <= 31));

-- Belt-and-braces against drift on the fee rule from the repo DDL
-- (20260905020000 defines CHECK (fee >= 0); production may lack it).
alter table public.transfers
  drop constraint if exists transfers_fee_nonnegative_check;
alter table public.transfers
  add constraint transfers_fee_nonnegative_check
  check (fee >= 0);
