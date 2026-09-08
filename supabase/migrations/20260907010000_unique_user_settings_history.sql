-- Repair: user_settings_history needs a UNIQUE constraint on
-- (user_id, effective_from). The client upserts the baseline row with
-- on_conflict = user_id,effective_from (resolution=merge-duplicates), but the
-- table only shipped with a plain index — Postgres rejects every upsert with
-- 42P10 "no unique or exclusion constraint matching the ON CONFLICT
-- specification", so the baseline silently never synced.

-- 1. Collapse duplicate (user_id, effective_from) rows first, keeping the
--    newest (latest created_at, then highest id as the tiebreaker). Without
--    this step a pre-existing duplicate would make the constraint fail.
delete from public.user_settings_history a
using public.user_settings_history b
where a.user_id = b.user_id
  and a.effective_from = b.effective_from
  and (a.created_at < b.created_at
       or (a.created_at = b.created_at and a.id > b.id));

-- 2. Unique constraint backing the ON CONFLICT target (creates its own index).
alter table public.user_settings_history
  drop constraint if exists user_settings_history_user_from_key;
alter table public.user_settings_history
  add constraint user_settings_history_user_from_key unique (user_id, effective_from);

-- 3. The original plain index is now redundant — the constraint's index
--    serves the same (user_id, effective_from) lookups.
drop index if exists public.user_settings_history_user_from_idx;
