-- Drop redundant expenses indexes identified against the app's actual query
-- patterns. Safe: every live query is covered by expenses_user_live_date_idx
-- (user_id + date DESC, deleted_at IS NULL partial).
--
-- 1. expenses_date_idx / expenses_date_idx1 — global date-only indexes that no
--    query can use: RLS scopes every read to user_id, so date filters always
--    ride a user_id-leading index. idx1 is an exact duplicate of idx anyway.
-- 2. expenses_user_date_idx — superseded by the partial live index; soft-deleted
--    rows are never queried back (no trash/restore feature reads them).

drop index if exists public.expenses_date_idx;
drop index if exists public.expenses_date_idx1;
drop index if exists public.expenses_user_date_idx;

-- 3. expenses_user_client_sync_id_unique — dead until an offline queue exists
--    again: utils/offlineQueue.ts is gone and createExpense() never sets the
--    column, so every row is NULL. Postgres unique indexes don't conflict on
--    NULLs, so this enforces nothing and no query can use it — pure write
--    amplification. The column itself stays as the ready hook for a future
--    queue; re-create this index in the same migration that reintroduces one
--    (upsert onConflict 'user_id,client_sync_id' requires it — see 42P10).
drop index if exists public.expenses_user_client_sync_id_unique;

-- NOTE: if the table is large and live (writes in flight), run these as
-- DROP INDEX CONCURRENTLY instead — directly in the Supabase SQL editor,
-- one statement at a time (CONCURRENTLY cannot run inside a transaction,
-- so it can't ship in this migration file on Supabase):
--   drop index concurrently if exists public.expenses_date_idx;
--   drop index concurrently if exists public.expenses_date_idx1;
--   drop index concurrently if exists public.expenses_user_date_idx;
--   drop index concurrently if exists public.expenses_user_client_sync_id_unique;
