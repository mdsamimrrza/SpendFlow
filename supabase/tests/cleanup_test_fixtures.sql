-- ─────────────────────────────────────────────────────────────────────────────
-- ONE-TIME FIXTURE CLEANUP — run this ONCE in the Supabase SQL editor BEFORE
-- running supabase/tests/rls_regression.sql.
--
-- Symptom it fixes: "ERROR 23505: duplicate key value violates unique
-- constraint users_pkey — Key (id)=(11111111-1111-1111-1111-111111111111)
-- already exists" when the RLS regression suite starts seeding its fixtures.
--
-- Cause: an earlier suite run was aborted mid-flight (or committed before
-- its final ROLLBACK), leaving the synthetic Alice/Bob rows behind. The
-- suite's pre-clean handles this going forward, but if your SQL editor runs
-- the whole file as one implicit transaction, the pre-clean and the failing
-- INSERT can end up in the same unit — this standalone script guarantees the
-- delete is its own committed statement.
--
-- Safe by construction: matches ONLY the suite's hard-coded fixture UUIDs
-- and reserved @test.local emails. No real user row can ever match.
-- Children first (transfers RESTRICT on bank_accounts); auth.users last.
-- ─────────────────────────────────────────────────────────────────────────────

delete from public.expenses
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.transfers
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.category_budget_history
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.recurring_rules
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.notifications
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.device_tokens
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.user_settings_history
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.security_otp_sends
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.bank_accounts
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.categories
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from public.users
 where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

delete from auth.users
 where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    or email in ('alice@test.local', 'bob@test.local');

-- The suite seeds exactly one exchange_rates row (USD, today, rate 1.0, no
-- source column value). Every real row has a non-null source since migration
-- 20260909000000, so this can only match a leftover fixture.
delete from public.exchange_rates
 where currency = 'USD' and rate_to_usd = 1.0 and source is null;

-- Confirmation: should print zero rows for both fixture identities.
select id, email from auth.users
 where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    or email in ('alice@test.local', 'bob@test.local');
