-- SpendFlow — Priority 4: expense query indexes + recurring occurrence integrity
-- Idempotent (safe to re-run). New migration; no historical migration is modified.
-- No destructive operations: the only data change is a soft-delete repair for
-- duplicate generated occurrences (rows are preserved with deleted_at set).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Dominant history query index
--
-- Query supported (highest-frequency query in the app — listExpenses, used by
-- Dashboard, History, Analytics, Accounts, Profit & Loss and Export):
--   SELECT ... FROM expenses
--   WHERE user_id = ? AND deleted_at IS NULL [AND date BETWEEN ? AND ?] ...
--   ORDER BY date DESC, created_at DESC [LIMIT/OFFSET]
--
-- Existing coverage: expenses_user_date_idx (user_id, date) matches this shape
-- but also carries soft-deleted rows; expenses_user_deleted_idx (user_id,
-- deleted_at) does not help the date ordering. This partial composite index
-- contains only live rows, so it is smaller and matches the filter + order
-- exactly (the date DESC ordering also serves the ascending variant via a
-- backward scan).
--
-- Write overhead: one additional B-tree maintenance per expenses write.
-- Storage overhead: proportional to live rows only.
-- Column order: user_id (equality) first, date (ordering/range) second.
-- Note: CONCURRENTLY is intentionally not used — Supabase's migration runner
-- executes inside a transaction, which cannot create indexes concurrently.
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists expenses_user_live_date_idx
  on public.expenses (user_id, date desc)
  where deleted_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Recurring occurrence integrity (cross-device duplicate protection)
--
-- Enforces: one recurring rule + one occurrence date = one generated
-- transaction. Manual transactions (recurring_rule_id IS NULL) and soft-deleted
-- rows live outside the partial index, so they are never affected.
--
-- 2a. Non-destructive repair of pre-existing duplicates so the unique index
--     below cannot fail on legacy data (the cross-device race identified in
--     Priority 3 testing may already have produced duplicates). Keeps the
--     OLDEST generated occurrence per (recurring_rule_id, date) and soft-deletes
--     any later duplicates. Idempotent: after the first run no row matches.
-- ───────────────────────────────────────────────────────────────────────────
update public.expenses e
   set deleted_at = now()
  where e.recurring_rule_id is not null
    and e.deleted_at is null
    and exists (
      select 1
        from public.expenses keep_row
       where keep_row.recurring_rule_id = e.recurring_rule_id
         and keep_row.date = e.date
         and keep_row.deleted_at is null
         and (keep_row.created_at, keep_row.id) < (e.created_at, e.id)
    );

-- 2b. Database-level uniqueness. The application inserts generated occurrences
--     with upsert(ignoreDuplicates, onConflict: 'recurring_rule_id,date') →
--     INSERT ... ON CONFLICT (recurring_rule_id, date) DO NOTHING, so a
--     conflicting occurrence is skipped while the remaining rows insert;
--     genuine failures still throw and leave next_due_date untouched,
--     regenerating identically on the next run.
--     Full (non-partial) index is deliberate: PostgREST's ON CONFLICT column
--     list cannot infer a partial unique index, and PostgreSQL treats NULLs as
--     distinct — so manual transactions (recurring_rule_id IS NULL) are never
--     constrained. A soft-deleted generated occurrence still holds its
--     (rule, date) slot, which intentionally prevents its resurrection by a
--     racing device.
create unique index if not exists expenses_recurring_rule_date_unique
  on public.expenses (recurring_rule_id, date);
