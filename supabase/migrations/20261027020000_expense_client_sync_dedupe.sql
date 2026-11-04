-- Description: Server-side duplicate-expense guard. createExpense now stamps
-- a fresh client_sync_id on every save attempt; this per-user partial unique
-- index makes a retried/replayed insert fail with a clear unique violation
-- instead of silently creating a second record. (The original index was
-- dropped in 20260907020000 when the offline queue was removed; the column
-- stayed as a "future hook" — this restores it, scoped to live rows only so
-- the recurring dedup index and normal reuse of the column stay unaffected.)

create index if not exists expenses_user_client_sync_id_unique
  on public.expenses (user_id, client_sync_id)
  where client_sync_id is not null and deleted_at is null;
