-- ═══════════════════════════════════════════════════════════════════════════
-- History UPDATE future-date lock (round 5)
--
-- Verified inconsistency: INSERT into user_settings_history /
-- category_budget_history rejected future effective_from dates (round-3
-- trigger enforce_settings_history_dates), but the UPDATE policies' WITH
-- CHECK had no upper bound — a normal authenticated client could move a
-- current-month row to ANY future date (e.g. effective_from = 2030-12-31)
-- through a direct API UPDATE.
--
-- Fix: the UPDATE WITH CHECK now enforces the same date rule as INSERT:
--   user_settings_history  → 1900-01-01 baseline
--                            OR (current month AND effective_from <= today)
--   category_budget_history → current month AND effective_from <= today
--
-- Intentionally unchanged:
--   * USING clauses (which rows may be targeted: baseline + current month) —
--     past-month rows stay immutable.
--   * DELETE — remains fully denied (no policy + revoked grant, round 2).
--   * INSERT trigger stays BEFORE INSERT; the corrected WITH CHECK is the
--     UPDATE gate, so each operation has exactly one date rule (no
--     redundant trigger added).
--   * Service-role writes (auth.uid() IS NULL) bypass RLS entirely — trusted
--     server paths are unaffected.
--
-- Idempotent: drop-if-exists before each create; same policy names.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- user_settings_history: baseline OR current-month-≤-today on the NEW row
-- ─────────────────────────────────────────────────────────────────────────────
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
      or (
        effective_from >= date_trunc('month', now())
        and effective_from <= current_date
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- category_budget_history: current-month-≤-today on the NEW row
-- (no baseline row exists for this table — every row is a dated change)
-- ─────────────────────────────────────────────────────────────────────────────
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
    and effective_from <= current_date
  );
