-- ─────────────────────────────────────────────────────────────────────────────
-- Security hardening: pin search_path on every SECURITY DEFINER function.
--
-- A SECURITY DEFINER function runs with its DEFINER's privileges. Without an
-- explicit search_path, Postgres resolves unqualified names (function calls
-- like now(), operators, type casts) against the CALLER's search_path — the
-- classic privilege-escalation pattern where an attacker places a hostile
-- schema/object earlier in their own path and the definer's query resolves
-- against it.
--
-- Inventory of SECURITY DEFINER functions (verified across all migrations):
--   public.trigger_fetch_nepal_gold_rate()  — pg_cron helper; NO search_path
--   public.delete_user_data(uuid)           — search_path = public
--   public.block_writes_during_deletion()    — search_path = public
--   public.enforce_settings_history_dates()  — search_path = public
--   public.count_user_storage(text, uuid)   — search_path = public, storage
-- (public.validate_owned_references and public.set_updated_at are INVOKER
--  — not affected; left untouched.)
--
-- Pin policy: pg_catalog FIRST (never shadowable), then only the schemas the
-- function genuinely reads. All object references inside these functions are
-- schema-qualified (vault.decrypted_secrets, public.*, storage.objects), so
-- tightening the path changes no behavior — it only removes the attack
-- surface. `pg_catalog` must be present because unqualified built-ins (now(),
-- date_trunc(), auth.uid(), operators) resolve there.
--
-- ALTER FUNCTION ... SET search_path survives function re-creation? No —
-- CREATE OR REPLACE keeps the SET clause, but these ALTERs are idempotent
-- and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_cron helper: previously UNPINNED — the highest-risk one (invoked daily
-- by cron, runs vault.secret reads).
alter function public.trigger_fetch_nepal_gold_rate()
  set search_path = pg_catalog, public;

-- Transactional deletion RPC (called by the delete-account Edge Function).
alter function public.delete_user_data(p_user_id uuid)
  set search_path = pg_catalog, public;

-- Write-block trigger shared by every user-owned table.
alter function public.block_writes_during_deletion()
  set search_path = pg_catalog, public;

-- Settings-history date enforcement trigger.
alter function public.enforce_settings_history_dates()
  set search_path = pg_catalog, public;

-- Independent storage-count helper (reads storage.objects metadata).
alter function public.count_user_storage(p_bucket text, p_user_id uuid)
  set search_path = pg_catalog, public, storage;

-- Note: auth.uid() / auth.role() live in the `auth` schema (extensions/auth),
-- which is part of the caller-visible path only via Supabase's defaults; the
-- functions above pin pg_catalog+public but Supabase's auth schema functions
-- are themselves SECURITY DEFINER and resolved through the `auth` schema
-- alias that the platform registers in pg_catalog-adjacent namespaces.
-- If this project ever renames that schema, these ALTERs must be revisited —
-- the functions still execute auth.uid() correctly under Supabase platform
-- defaults (auth is in every role's default search_path via the platform's
-- role settings), and unqualified auth.* calls are safe because no other
-- schema can define uid() with a matching signature in the pinned path.
