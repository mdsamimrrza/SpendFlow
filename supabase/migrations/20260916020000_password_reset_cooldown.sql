-- ═══════════════════════════════════════════════════════════════════════════
-- send-password-reset broker support table (2026-09-15, owner-requested
-- forgot-password existence check + real server-side cooldown).
--
-- public.password_reset_cooldown: one row per password-reset requester,
-- keyed by the SHA-256 hash of the lowercased email (no raw addresses ever
-- stored). The send-password-reset Edge Function claims/refreshes a row
-- BEFORE checking existence or sending, so BOTH outcomes — account found and
-- not-found — are rate-limited to one attempt per 60 seconds per email.
-- That is the deliberate price of the existence answer being visible to
-- callers: probing "does this address exist?" is as throttled as spamming
-- real sends.
--
-- Service-role only: RLS enabled with NO policies + explicit privileges
-- revoked (same shape as security_otp_sends, 20260913000000). PostgREST
-- clients can never read, write, or see it.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.password_reset_cooldown (
  email_hash   text        not null primary key,
  last_sent_at timestamptz not null default now()
);

alter table public.password_reset_cooldown enable row level security;

revoke all on table public.password_reset_cooldown from public, anon, authenticated;
grant select, insert, update, delete on table public.password_reset_cooldown to service_role;
