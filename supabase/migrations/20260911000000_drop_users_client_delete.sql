-- ─────────────────────────────────────────────────────────────────────────────
-- Security hardening: remove the client-reachable `users` DELETE policy.
--
-- Root cause: the initial schema granted `users delete own row` (auth.uid() =
-- id). A client could DELETE its profile row directly, bypassing the
-- delete-account Edge Function's strict ordering (storage purge → transactional
-- relational delete → auth identity LAST). A direct delete:
--   - cascades every user-owned table while storage objects survive
--     (orphaned receipts/avatars billable forever, unreachable),
--   - leaves the Auth identity alive with no profile row,
--   - fires none of the Edge Function's verification/lock guarantees.
--
-- No client code path deletes `users` rows (verified: the only deletion flow is
-- the delete-account Edge Function, which uses the service role — unaffected by
-- RLS). Dropping the policy closes the bypass without any behavior change.
--
-- Account deletion remains available exclusively through:
--   POST /functions/v1/delete-account  (OTP-fresh session required, see
--   supabase/config.toml + the function's iat freshness window).
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "users delete own row" on public.users;

-- Belt-and-braces: also revoke the client-side DELETE grant on the table so
-- even a future accidental policy cannot re-open the path. Service role and
-- the delete_user_data() SECURITY DEFINER function (owner = postgres) are
-- unaffected.
revoke delete on public.users from authenticated, anon;
