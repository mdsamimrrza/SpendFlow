-- ─────────────────────────────────────────────────────────────────────────────
-- Server-side cooldown for security-OTP sends (account deletion, email change).
--
-- The client previously called supabase.auth.signInWithOtp directly: the OTP
-- SEND step had only Supabase's global hosted rate limits — nothing stopped a
-- signed-in caller from firing unlimited send requests (mail-bombing the
-- inbox / burning provider email quota). Supabase's verify-attempt limiting
-- protects the code, not the send.
--
-- Now every security-OTP send is brokered by the send-security-otp Edge
-- Function (authenticated caller; recipient email resolved SERVER-side from
-- the JWT — a client can never make the server mail arbitrary addresses).
-- This table backs that function's per-user cooldown:
--   * one row per (user, purpose); upsert refreshes last_sent_at
--   * RLS: no policies at all — anon/authenticated/service_role cannot read
--     or write through the client API; only the function's service-role
--     connection touches it
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.security_otp_sends (
  user_id uuid not null references public.users(id) on delete cascade,
  purpose text not null check (purpose in ('account_deletion', 'email_change')),
  last_sent_at timestamptz not null default now(),
  primary key (user_id, purpose)
);

alter table public.security_otp_sends enable row level security;

-- Deliberately NO policies: the table is invisible to every client role.
-- The Edge Function uses the service role, which bypasses RLS entirely.

-- Belt-and-braces: clients never need table grants here either.
revoke all on public.security_otp_sends from anon, authenticated;
