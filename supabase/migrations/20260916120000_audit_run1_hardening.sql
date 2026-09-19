-- ─────────────────────────────────────────────────────────────────────────────
-- Audit run-1 hardening (2026-09-16) — external security audit follow-ups.
--
-- Idempotent like every other migration here (safe to re-apply), and additive:
-- nothing in this file loosens an existing control.
--   1. claim_device_token() — atomic device-token claim/transfer so an
--      account switch on a shared install doesn't strand the previous
--      owner's row (financial pushes kept arriving on the handed-off device).
--   2. enforce_receipt_image_path() — expenses.receipt_image_url becomes plain
--      free text client-side; bind NEW values to the row owner's own receipts
--      folder so no tenant can plant another tenant's '<uid>/<file>' path for
--      later signing. (Only expenses has a receipt column — recurring rules
--      store none; their paid-expense rows flow through expenses anyway.)
--   3. market_gold_rates write revokes — mirror the exchange_rates
--      defense-in-depth pattern (RLS-off fallback).
--   4. sync_users_email_from_auth execute sealing — it shipped with the
--      default PUBLIC execute grant; seal it to the roles that actually
--      fire the trigger (service_role) instead of every REST caller.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ── Atomic push-token claim ------------------------------------------------
create or replace function public.claim_device_token(
  p_expo_push_token text,
  p_platform text default null,
  p_device_name text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(p_expo_push_token, '') = '' then
    raise exception 'token required' using errcode = '22023';
  end if;

  -- SECURITY DEFINER (owner postgres) bypasses RLS, so this single statement
  -- can clear a row still owned by a PREVIOUS account on this install. The
  -- caller proves knowledge of its own device's Expo token; only the device
  -- that received the token can ever present it.
  delete from public.device_tokens
   where expo_push_token = p_expo_push_token;

  insert into public.device_tokens (user_id, expo_push_token, platform, device_name, updated_at)
  values (v_uid, p_expo_push_token, p_platform, p_device_name, now())
  on conflict (expo_push_token) do update
     set user_id = excluded.user_id,
         platform = excluded.platform,
         device_name = excluded.device_name,
         updated_at = now();
end;
$$;

revoke all on function public.claim_device_token(text, text, text) from public, anon;
grant execute on function public.claim_device_token(text, text, text) to authenticated;

-- 2 ── Receipt-path ownership binding ----------------------------------------
-- Accepted shapes (anything else is rejected at write time):
--   • raw path '<own-uid>/…'                     — the only form the app uploads
--   • legacy storage URL '…/object/[public/]receipts/<own-uid>/…'
--   • NULL                                        — untouched legacy rows on
--     UPDATE keep their stored value (only a CHANGED value is validated), so
--     historical free-text/external URLs never block ordinary edits.
create or replace function public.enforce_receipt_image_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  v_url := coalesce(new.receipt_image_url, '');
  if v_url = '' then
    return new;
  end if;

  -- UPDATE replaying the existing value unchanged: allow (legacy rows may
  -- legitimately predate this rule).
  if tg_op = 'UPDATE' and old.receipt_image_url is not distinct from new.receipt_image_url then
    return new;
  end if;

  if new.receipt_image_url ~ ('^' || new.user_id::text || '/') then
    return new;
  end if;
  if lower(new.receipt_image_url) like 'http%'
     and new.receipt_image_url ~* '/object/(public/)?receipts/' || new.user_id::text || '/' then
    return new;
  end if;

  raise exception 'receipt_image_url must point into the row owner''s receipts folder'
    using errcode = '23514';
end;
$$;

drop trigger if exists expenses_receipt_image_path_owner on public.expenses;
create trigger expenses_receipt_image_path_owner
  before insert or update of receipt_image_url, user_id
  on public.expenses
  for each row execute function public.enforce_receipt_image_path();

drop trigger if exists recurring_receipt_image_path_owner on public.recurring_rules;
-- recurring_rules has no receipt_image_url column (verified against the
-- remote schema): paid recurrences write their receipt onto the generated
-- expenses row, which the trigger above already guards.

-- 3 ── market_gold_rates defense-in-depth (mirror exchange_rates) -------------
revoke insert, update, delete on public.market_gold_rates from anon, authenticated;

-- 4 ── Seal the email-sync definer trigger function ----------------------------
-- The BEFORE UPDATE trigger on public.users fires for every authenticated
-- profile save too, so EXECUTE goes to the API roles (same pattern as the
-- other trigger functions) — the point is closing the default PUBLIC grant,
-- not restricting which roles may fire it.
revoke all on function public.sync_users_email_from_auth() from public, anon;
grant execute on function public.sync_users_email_from_auth() to anon, authenticated, service_role;
