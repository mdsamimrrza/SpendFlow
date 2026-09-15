# Running the RLS regression suite

The suite lives in `supabase/tests/rls_regression.sql` (pgTAP). It pins the
security invariants established across audit rounds 1–3 so a regression fails
loudly instead of being found by a fourth manual audit:

1. **Cross-user isolation** — an authenticated user cannot read or write
   another user's rows on any RLS'd table (expenses, categories,
   recurring_rules, transfers, bank_accounts, user_settings_history,
   category_budget_history, users, device_tokens, notifications).
2. **Ownership trigger** — `validate_owned_references` rejects cross-user
   foreign keys on expenses / recurring_rules / transfers /
   category_budget_history (and does NOT over-block same-user writes).
3. **Market-data write lock** — `exchange_rates` rejects
   authenticated/anon writes; reads stay open.

## Run locally

Requires the Supabase CLI. From the repo root:

```bash
supabase db reset    # fresh local DB, applies all migrations in order
supabase test db     # runs every supabase/tests/*.sql under pgTAP
```

`supabase test db` is a thin wrapper over `pg_prove`; any assertion failure
exits non-zero and prints the failing test name.

## Run against a hosted project (staging)

The suite can also be pasted whole into the Supabase **SQL editor** — it
begins with `create extension if not exists pgtap;` so it works on hosted
projects where the extension is not preinstalled (the local CLI stack ships
it enabled; without this line a hosted run fails with
`function plan(integer) does not exist`).

⚠ **Never run it against production.** It creates synthetic users
(`alice@test.local`, `bob@test.local`) in `auth.users` / `public.users`.
Everything happens inside a single `BEGIN … ROLLBACK` transaction, so a
completed run leaves no rows behind — but an aborted mid-flight run could
error out before the rollback depending on the editor's session handling.
Local stack or staging only.

## When to run it

- After adding **any** migration that touches a policy, trigger, grant, or
  the `exchange_rates` table — before pushing to production.
- In CI once wired (GitHub Actions job: `supabase db reset && supabase test db`).
- Against the **staging project** (see SECURITY-NOTES.md §6) before promoting.

## Notes on the harness

- The suite runs as the migration role (superuser on the local stack) and
  impersonates clients by setting `role = 'authenticated'` +
  `request.jwt.claims` — exactly how PostgREST executes client requests, so
  RLS evaluation is faithful.
- Test users (`alice@test.local`, `bob@test.local`) are created directly in
  `auth.users` + `public.users`; everything rolls back inside the suite's
  transaction, so no state survives the run.
- Asserting the exact trigger message (`SpendFlow ownership check: …`) is
  deliberate: it also catches a regression where the trigger silently stops
  firing (a NULL/no-op body would pass a weaker throws_ok).
