-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNOSTIC — run this AFTER a fresh "duplicate key users_pkey" failure.
-- Answers three questions in one go:
--   1. Does the fixture row exist RIGHT NOW (after the suite just failed)?
--   2. Which table holds it — auth.users, public.users, or both?
--   3. When was it created? (tells us if it's an old leftover or was just
--      inserted by the failed run you're diagnosing)
-- ─────────────────────────────────────────────────────────────────────────────

select 'auth.users' as table_name, id, email, created_at
from auth.users
where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
   or email in ('alice@test.local', 'bob@test.local');

select 'public.users' as table_name, id, email, created_at
from public.users
where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
   or email in ('alice@test.local', 'bob@test.local');

select 'expenses' as table_name, user_id, description, created_at
from public.expenses
where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select 'categories' as table_name, id, user_id, created_at
from public.categories
where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select 'bank_accounts' as table_name, id, user_id, created_at
from public.bank_accounts
where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
