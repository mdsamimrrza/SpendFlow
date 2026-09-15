-- ─────────────────────────────────────────────────────────────────────────────
-- SpendFlow RLS regression suite (pgTAP).
--
-- Asserts the security invariants established across audit rounds 1–3 plus
-- the round-6 CHECK constraints, so a future migration that quietly breaks
-- one fails loudly instead of needing another manual audit:
--
--   1. Cross-user read/write isolation on every user-owned, RLS'd table
--      (expenses, categories, recurring_rules, transfers, bank_accounts,
--      user_settings_history, category_budget_history, users,
--      device_tokens, notifications).
--   2. validate_owned_references rejects cross-user foreign keys on
--      expenses / recurring_rules / transfers / category_budget_history.
--   3. exchange_rates rejects writes from authenticated/anon (read-only
--      market data; only the trusted server writes it).
--   4. DB-level CHECK constraints (round 6 pentest): strict-uppercase ISO
--      currency codes on every client-writable currency column, expense/
--      transfer date window (2000-01-01 … today+1, +1 day UTC slack for
--      UTC+5:45/+9 users), amount upper bound 1e12 (client MAX_AMOUNT
--      mirrored), transfer self-send + conversion-consistency, and
--      cycle_start_day 1–31 (1 = designed standard-calendar sentinel).
--
-- HOW TO RUN (documented in scripts/run-rls-tests.md):
--   Local stack:   supabase db reset && supabase test db
--   Hosted/staging: paste the whole file into the SQL editor and run it.
--   (The editor shows only the LAST result set, so the suite captures every
--   TAP line into a temp table and returns them all — ending with a SUMMARY
--   line — in its final SELECT.)
--   (The suite self-installs pgTAP — preinstalled locally, but a hosted
--   project needs `create extension if not exists pgtap` first, which the
--   file does.)
--
--   ⚠ The suite INSERTs synthetic users (alice@test.local, bob@test.local)
--   into auth.users/public.users. Everything inside the BEGIN…ROLLBACK block
--   is discarded on completion, and an IDEMPOTENCY PRE-CLEAN at the top
--   (outside the transaction) purges any fixtures a previously aborted run
--   may have committed — so re-running always works. Still: prefer the LOCAL
--   stack or STAGING; production databases shouldn't host test fixtures at
--   all, even briefly.
--
-- Harness design (why probes instead of plain set_config):
--   Every pgTAP assertion runs as the SU PERUSER session role. Client
--   impersonation happens INSIDE probe helpers that switch role +
--   request.jwt.claims, execute the probe statement, capture its outcome,
--   and restore the role before returning — exactly the PostgREST request
--   environment, without leaking the switched role into pgTAP's own
--   machinery (its assertion functions live in a schema the authenticated
--   role cannot reach).
--
--   Fixture row IDs come from CONSTANT functions (test.bob_cat() etc.), NOT
--   from subqueries. This matters: a subquery like
--   `(select id from categories where user_id = bob)` embedded in a probe
--   statement executes under the IMPERSONATED CLIENT's RLS — Alice cannot
--   see Bob's rows, so the subquery would return NULL and the probe would
--   measure a NOT NULL violation instead of the ownership trigger. Constant
--   functions touch no tables, so RLS never interferes with ID resolution.
--
--   Probes return TEXT so assertions are simple value comparisons:
--     'row N'              — statement succeeded, N rows affected
--     'err 42501'          — RLS / privilege rejection (permission denied)
--     'err raise: <text>'  — a trigger's RAISE EXCEPTION (SQLSTATE P0001)
--     'err <state> <text>' — anything else
--
-- Semantics baked into expectations:
--   * BEFORE triggers fire BEFORE RLS with-checks: on the four
--     validate_owned_references tables a cross-user write surfaces the
--     TRIGGER's exception; elsewhere RLS 42501 is expected. Asserting both
--     orderings means neither layer can silently regress.
--   * A cross-user UPDATE under RLS is a silent 0-row no-op (USING fails),
--     not an error — asserted as 'row 0'.
--
-- IDEMPOTENCY PRE-CLEAN (before BEGIN — deliberate): a previously aborted run
-- (or a SQL editor that auto-commits statements before the final ROLLBACK is
-- reached) can leave fixture rows committed. The suite's own ROLLBACK can
-- never purge such garbage — it rolls back the pre-clean deletes too — so the
-- cleanup MUST live outside the transaction to take permanent effect. Purge
-- exactly the suite's fixture IDs/emails. Real users can never match: these
-- are the suite's constants, and the @test.local emails are reserved for it.
-- Children first (transfers RESTRICT on bank_accounts); auth.users last.
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
-- The suite seeds exactly one exchange_rates row (USD today, rate 1.0, no
-- source). Every real row has a non-null source since migration
-- 20260909000000 (which labeled the pre-existing stock 'backfill'), so this
-- predicate can only ever match a leftover fixture row.
delete from public.exchange_rates
 where currency = 'USD' and rate_to_usd = 1.0 and source is null;

-- Also purge a leftover helper schema from an aborted run: without this,
-- `create schema if not exists` no-ops inside the transaction and a stale
-- schema (with stale probe functions) survives, masking the fresh definitions.
drop schema if exists test cascade;

begin;

-- pgTAP ships with the local Supabase CLI stack but must be enabled
-- explicitly on hosted projects (staging). Required for plan()/is().
create extension if not exists pgtap;

-- Helper schema for the probe functions (created fresh, rolled back below).
create schema if not exists test;

-- The probe helpers EXECUTE test statements under the impersonated client
-- roles (authenticated / anon), and those statements reference the
-- fixture-ID functions above (test.alice() etc.). A role can only resolve
-- objects in a schema it holds USAGE on — without this grant every probe
-- dies with "permission denied for schema test" instead of measuring RLS.
-- The grant is created inside the transaction and disappears with the
-- ROLLBACK; the functions are pure constants, so exposing them to these
-- roles changes nothing about the security being tested.
grant usage on schema test to authenticated, anon;
-- New functions carry EXECUTE-to-PUBLIC by default; pin it explicitly so a
-- future default-ACL change can't break the probes.
grant execute on all functions in schema test to authenticated, anon;

-- TAP output capture: the Supabase SQL editor displays only the LAST
-- statement's result set, so 49 separate 'select is(...)' results would be
-- invisible. Every TAP line (plan, each test, finish) is captured here and
-- returned by ONE final SELECT, ending with an aggregate SUMMARY line.
-- Drop-if-exists guards a same-session re-run after an aborted attempt.
drop table if exists tap_out;
create temp table tap_out (ord serial, line text);

insert into tap_out (line) select plan(49);

-- ─────────────────────────────────────────────────────────────────────────────
-- Constant identities + fixture IDs (functions, not tables — no RLS).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function test.alice() returns uuid
  language sql immutable as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create or replace function test.bob() returns uuid
  language sql immutable as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;

create or replace function test.alice_cat() returns uuid
  language sql immutable as $$ select '11111111-1111-1111-1111-333333333333'::uuid $$;
create or replace function test.bob_cat() returns uuid
  language sql immutable as $$ select '22222222-2222-2222-2222-333333333333'::uuid $$;

create or replace function test.alice_cash() returns uuid
  language sql immutable as $$ select '11111111-1111-1111-1111-444444444444'::uuid $$;
create or replace function test.alice_bank() returns uuid
  language sql immutable as $$ select '11111111-1111-1111-1111-555555555555'::uuid $$;
create or replace function test.bob_cash() returns uuid
  language sql immutable as $$ select '22222222-2222-2222-2222-444444444444'::uuid $$;
create or replace function test.bob_bank() returns uuid
  language sql immutable as $$ select '22222222-2222-2222-2222-555555555555'::uuid $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixture seeds (as the superuser session role — the service-role path
-- Edge Functions use; RLS is bypassed for superusers).
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (test.alice(), 'alice@test.local', 'authenticated', 'authenticated', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (test.bob(),   'bob@test.local',   'authenticated', 'authenticated', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.users (id, email, display_name, preferred_currency) values
  (test.alice(), 'alice@test.local', 'Alice', 'NPR'),
  (test.bob(),   'bob@test.local',   'Bob',   'NPR')
on conflict (id) do nothing;

insert into public.categories (id, user_id, name, icon, color) values
  (test.alice_cat(), test.alice(), 'Alice Food', '🍜', '#FF6B6B'),
  (test.bob_cat(),   test.bob(),   'Bob Food',   '🍜', '#FF6B6B')
on conflict (id) do nothing;

insert into public.bank_accounts (id, user_id, name, account_type, currency) values
  (test.alice_cash(), test.alice(), 'Alice Cash', 'cash', 'NPR'),
  (test.alice_bank(), test.alice(), 'Alice Bank', 'bank', 'NPR'),
  (test.bob_cash(),   test.bob(),   'Bob Cash',   'cash', 'NPR'),
  (test.bob_bank(),   test.bob(),   'Bob Bank',   'bank', 'NPR')
on conflict (id) do nothing;

insert into public.exchange_rates (currency, date, rate_to_usd) values ('USD', current_date, 1.0)
on conflict (currency, date) do nothing;

-- One seeded expense for Bob (client-invisible to Alice; created via the
-- service-role path Edge Functions use).
insert into public.expenses (user_id, category_id, amount, currency, date)
values (test.bob(), test.bob_cat(), 99, 'NPR', current_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Probe helpers. Each runs ONE statement as the requested client and returns
-- the outcome as text. All restore the superuser role before returning.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function test.as_user(uid uuid, stmt text) returns text
language plpgsql as $$
declare
  v_result text;
  v_rows integer;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  begin
    execute stmt;
    get diagnostics v_rows = row_count;
    v_result := 'row ' || v_rows::text;
  exception when others then
    -- NOTE: inside a PL/pgSQL exception block the message variable is
    -- SQLERRM (errmsg() is a server function, not a local) — using errmsg
    -- here crashed the handler itself with 42703.
    v_result := case
      when sqlstate = '42501' then 'err 42501'
      -- CHECK violations: bare state, same style as 42501 — the probe's
      -- description names the invariant; the constraint name is recoverable
      -- by re-running the statement when diagnosing a failure.
      when sqlstate = '23514' then 'err 23514'
      when sqlstate = 'P0001' then 'err raise: ' || left(sqlerrm, 120)
      else 'err ' || sqlstate || ' ' || left(sqlerrm, 120)
    end;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v_result;
end;
$$;

create or replace function test.count_as(uid uuid, stmt text) returns bigint
language plpgsql as $$
declare
  v_count bigint;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  execute stmt into v_count;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v_count;
end;
$$;

create or replace function test.count_as_anon(stmt text) returns bigint
language plpgsql as $$
declare
  v_count bigint;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  execute stmt into v_count;
  perform set_config('role', 'postgres', true);
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Cross-user isolation (authenticated as Alice against Bob's rows)
-- ─────────────────────────────────────────────────────────────────────────────

-- Own rows visible…
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.categories where user_id = test.alice() $$),
  1::bigint,
  'categories: own row visible to owner'
);
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.bank_accounts where user_id = test.alice() $$),
  2::bigint,
  'bank_accounts: own rows visible to owner'
);
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.users where id = test.alice() $$),
  1::bigint,
  'users: own profile row visible to owner'
);

-- …other user's rows invisible.
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.categories where user_id = test.bob() $$),
  0::bigint,
  'categories: other user rows invisible'
);
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.bank_accounts where user_id = test.bob() $$),
  0::bigint,
  'bank_accounts: other user rows invisible'
);
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.users where id = test.bob() $$),
  0::bigint,
  'users: other profile row invisible'
);
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.expenses where user_id = test.bob() $$),
  0::bigint,
  'expenses: other user rows invisible'
);

-- Writing rows for the other user. On the four ownership-trigger tables the
-- trigger (BEFORE RLS) wins and its message surfaces; elsewhere RLS 42501.
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.categories (user_id, name, icon, color) values (test.bob(), 'Hijack', '🧨', '#000000') $$),
  'err 42501',
  'categories: insert for another user rejected by RLS'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, amount, currency, date) values (test.bob(), test.bob_cat(), 10, 'NPR', current_date) $$),
  'err raise: SpendFlow ownership check: cannot write a row for another user',
  'expenses: insert for another user rejected (trigger before RLS)'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.recurring_rules (user_id, category_id, amount, frequency, next_due_date) values (test.bob(), test.bob_cat(), 5, 'monthly', current_date) $$),
  'err raise: SpendFlow ownership check: cannot write a row for another user',
  'recurring_rules: insert for another user rejected (trigger before RLS)'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.transfers (user_id, from_account_id, to_account_id, amount, from_currency, to_currency, converted_amount, date)
     values (test.bob(), test.bob_cash(), test.bob_bank(), 100, 'NPR', 'NPR', 100, current_date) $$),
  'err raise: SpendFlow ownership check: cannot write a row for another user',
  'transfers: insert for another user rejected (trigger before RLS)'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.bank_accounts (user_id, name) values (test.bob(), 'Hijack') $$),
  'err 42501',
  'bank_accounts: insert for another user rejected by RLS'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.notifications (user_id, type, title, body) values (test.bob(), 'test', 'Hijack', 'Hijack') $$),
  'err 42501',
  'notifications: insert for another user rejected by RLS'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.device_tokens (user_id, expo_push_token) values (test.bob(), 'ExpoHijackToken') $$),
  'err 42501',
  'device_tokens: insert for another user rejected by RLS'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.user_settings_history (user_id, effective_from, monthly_budget) values (test.bob(), '1900-01-01', 500) $$),
  'err 42501',
  'user_settings_history: insert for another user rejected by RLS'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.category_budget_history (user_id, category_id, effective_from, budget_monthly)
     values (test.bob(), test.bob_cat(), date_trunc('month', current_date), 500) $$),
  'err raise: SpendFlow ownership check: cannot write a row for another user',
  'category_budget_history: insert for another user rejected (trigger before RLS)'
);

-- Cross-user UPDATE under RLS: silent 0-row no-op (USING filters it out).
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ update public.users set display_name = 'Hijacked' where id = test.bob() $$),
  'row 0',
  'users: updating another user''s profile is a 0-row no-op'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ update public.expenses set amount = 1 where user_id = test.bob() $$),
  'row 0',
  'expenses: updating another user''s rows is a 0-row no-op'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. validate_owned_references rejects cross-user foreign keys
--    (Alice writes her OWN user_id but points an FK at Bob's row.)
-- ─────────────────────────────────────────────────────────────────────────────

insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, amount, currency, date)
     values (test.alice(), test.bob_cat(), 42, 'NPR', current_date) $$),
  'err raise: SpendFlow ownership check: category does not belong to you',
  'expenses: cross-user category FK rejected'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, bank_account_id, amount, currency, date)
     values (test.alice(), test.alice_cat(), test.bob_cash(), 42, 'NPR', current_date) $$),
  'err raise: SpendFlow ownership check: bank account does not belong to you',
  'expenses: cross-user bank account FK rejected'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.recurring_rules (user_id, category_id, amount, frequency, next_due_date)
     values (test.alice(), test.bob_cat(), 10, 'monthly', current_date + 30) $$),
  'err raise: SpendFlow ownership check: category does not belong to you',
  'recurring_rules: cross-user category FK rejected'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.transfers (user_id, from_account_id, to_account_id, amount, from_currency, to_currency, converted_amount, date)
     values (test.alice(), test.bob_cash(), test.alice_bank(), 100, 'NPR', 'NPR', 100, current_date) $$),
  'err raise: SpendFlow ownership check: source account does not belong to you',
  'transfers: cross-user source account rejected'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.transfers (user_id, from_account_id, to_account_id, amount, from_currency, to_currency, converted_amount, date)
     values (test.alice(), test.alice_cash(), test.bob_bank(), 100, 'NPR', 'NPR', 100, current_date) $$),
  'err raise: SpendFlow ownership check: destination account does not belong to you',
  'transfers: cross-user destination account rejected'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.category_budget_history (user_id, category_id, effective_from, budget_monthly)
     values (test.alice(), test.bob_cat(), date_trunc('month', current_date), 500) $$),
  'err raise: SpendFlow ownership check: category does not belong to you',
  'category_budget_history: cross-user category FK rejected'
);

-- Positive controls: same-user references insert cleanly (no over-blocking).
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, bank_account_id, amount, currency, date)
     values (test.alice(), test.alice_cat(), test.alice_cash(), 42, 'NPR', current_date) $$),
  'row 1',
  'expenses: own-user references accepted (no over-blocking)'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.transfers (user_id, from_account_id, to_account_id, amount, from_currency, to_currency, converted_amount, date)
     values (test.alice(), test.alice_cash(), test.alice_bank(), 100, 'NPR', 'NPR', 100, current_date) $$),
  'row 1',
  'transfers: own-user accounts accepted (no over-blocking)'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.user_settings_history (user_id, effective_from, monthly_budget)
     values (test.alice(), '1900-01-01', 500) $$),
  'row 1',
  'user_settings_history: baseline row insert accepted'
);
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.expenses where user_id = test.alice() $$),
  1::bigint,
  'expenses: own row visible after insert'
);
insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.transfers where user_id = test.alice() $$),
  1::bigint,
  'transfers: own row visible after insert'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. exchange_rates: client read-only
-- ─────────────────────────────────────────────────────────────────────────────

insert into tap_out (line) select is(
  test.count_as(test.alice(), $$ select count(*) from public.exchange_rates where currency = 'USD' $$),
  1::bigint,
  'exchange_rates: readable by authenticated'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.exchange_rates (currency, date, rate_to_usd) values ('EUR', current_date, 0.9) $$),
  'err 42501',
  'exchange_rates: insert rejected for authenticated'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ update public.exchange_rates set rate_to_usd = 0.5 where currency = 'USD' $$),
  'err 42501',
  'exchange_rates: update rejected for authenticated (privilege revoked)'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ delete from public.exchange_rates where currency = 'USD' $$),
  'err 42501',
  'exchange_rates: delete rejected for authenticated (privilege revoked)'
);
insert into tap_out (line) select is(
  test.count_as_anon($$ select count(*) from public.exchange_rates $$),
  0::bigint,
  'exchange_rates: NOT readable by anon'
);

-- A RLS table with NO anon policies (categories) must fail closed.
insert into tap_out (line) select is(
  test.count_as_anon($$ select count(*) from public.categories $$),
  0::bigint,
  'categories: anon sees nothing (fail closed)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DB-level CHECK constraints (round 6 pentest findings MEDIUM-3/4, LOW-5/6/7)
--    These reproduce the pentest's attack payloads as the authenticated
--    client — all previously returned 201 against production.
-- ─────────────────────────────────────────────────────────────────────────────

-- MEDIUM-3: hostile currency strings rejected on every writable surface.
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, amount, currency, date)
     values (test.alice(), test.alice_cat(), 10, '<img src=x>', current_date) $$),
  'err 23514',
  'expenses: hostile currency string rejected by CHECK'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.recurring_rules (user_id, category_id, amount, currency, frequency, next_due_date)
     values (test.alice(), test.alice_cat(), 10, 'npr', 'monthly', current_date) $$),
  'err 23514',
  'recurring_rules: lowercase currency rejected by CHECK'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.bank_accounts (user_id, name, currency)
     values (test.alice(), 'Bad Ccy', 'US') $$),
  'err 23514',
  'bank_accounts: 2-letter currency rejected by CHECK'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ update public.users set preferred_currency = 'x' where id = test.alice() $$),
  'err 23514',
  'users: non-ISO preferred_currency rejected by CHECK'
);

-- MEDIUM-4: expense date window — future and ancient dates rejected.
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, amount, currency, date)
     values (test.alice(), test.alice_cat(), 10, 'NPR', current_date + 30) $$),
  'err 23514',
  'expenses: future-dated INSERT rejected by CHECK'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, amount, currency, date)
     values (test.alice(), test.alice_cat(), 10, 'NPR', date '1999-01-01') $$),
  'err 23514',
  'expenses: ancient-date INSERT rejected by CHECK'
);

-- LOW-5: cycle_start_day bounded 1–31 — 1 is the designed "standard calendar"
-- default (must stay accepted); out-of-range values rejected. NOT 2–31: the
-- client writes 1 as the default-cycle sentinel and real users hold it.
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ update public.users set cycle_start_day = 1 where id = test.alice() $$),
  'row 1',
  'users: cycle_start_day = 1 (default calendar) stays accepted'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ update public.users set cycle_start_day = 0 where id = test.alice() $$),
  'err 23514',
  'users: cycle_start_day = 0 rejected by CHECK'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ update public.users set cycle_start_day = 99 where id = test.alice() $$),
  'err 23514',
  'users: cycle_start_day = 99 rejected by CHECK'
);

-- LOW-6: transfer self-send and inconsistent conversion rejected.
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.transfers (user_id, from_account_id, to_account_id, amount, from_currency, to_currency, exchange_rate, converted_amount, date)
     values (test.alice(), test.alice_cash(), test.alice_cash(), 100, 'NPR', 'NPR', 1, 100, current_date) $$),
  'err 23514',
  'transfers: self-send (from = to) rejected by CHECK'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.transfers (user_id, from_account_id, to_account_id, amount, from_currency, to_currency, exchange_rate, converted_amount, date)
     values (test.alice(), test.alice_cash(), test.alice_bank(), 100, 'USD', 'NPR', 0.001, 999999, current_date) $$),
  'err 23514',
  'transfers: converted_amount ≠ amount × rate rejected by CHECK'
);

-- LOW-7: absurd amounts rejected (client MAX_AMOUNT mirrored at the DB).
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, amount, currency, date)
     values (test.alice(), test.alice_cat(), 9999999999999999, 'NPR', current_date) $$),
  'err 23514',
  'expenses: absurd amount rejected by CHECK'
);

-- Positive controls: today-dated, valid-currency writes still succeed — the
-- CHECKs must not over-block the client's legitimate write shapes.
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.expenses (user_id, category_id, amount, currency, date)
     values (test.alice(), test.alice_cat(), 42.50, 'USD', current_date) $$),
  'row 1',
  'expenses: valid currency + today date accepted (no over-blocking)'
);
insert into tap_out (line) select is(
  test.as_user(test.alice(), $$ insert into public.transfers (user_id, from_account_id, to_account_id, amount, from_currency, to_currency, exchange_rate, converted_amount, date)
     values (test.alice(), test.alice_cash(), test.alice_bank(), 100, 'NPR', 'NPR', 1, 100, current_date) $$),
  'row 1',
  'transfers: consistent conversion accepted (no over-blocking)'
);

insert into tap_out (line) select * from finish();

-- Aggregate verdict as the last line of the report.
insert into tap_out (line)
select 'SUMMARY: ' ||
  count(*) filter (where line like 'ok %') || ' passed, ' ||
  count(*) filter (where line like 'not ok %') || ' failed'
from tap_out;

-- The ONLY statement whose result set the SQL editor will display.
select line from tap_out order by ord;

rollback;
