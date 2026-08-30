-- An offline queue entry can be replayed after its insert reaches the server but before
-- AsyncStorage records that it was completed. Keep a per-user client ID to make that retry
-- idempotent.
alter table public.expenses
  add column if not exists client_sync_id text;

create unique index if not exists expenses_user_client_sync_id_unique
  on public.expenses (user_id, client_sync_id);
