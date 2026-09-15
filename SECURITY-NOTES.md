# Security & Data-Integrity — Verified Architecture Notes

Companion to the two remediation rounds (migrations
`20260908000000_security_hardening.sql` and `20260908010000_integrity_hardening.sql`).
Documents design decisions that were **verified as intentional** during the
audits, so future work doesn't "fix" them blindly.

## 1. Hard delete vs. soft delete (finding #7)

| Record | Behavior | Why |
|---|---|---|
| `expenses` | Soft delete (`deleted_at` timestamp, row kept) | Financial audit trail: history/analytics still resolve past months; FK-safe. Hard delete exists **only** in account deletion (all rows go). |
| `transfers` | Soft delete first, hard delete as fallback for legacy tables without `deleted_at` | Same audit-trail intent. |
| `bank_accounts` | Hard delete first, soft delete fallback | Accounts are reassignable config, not transactions — but rows are unlinked from expenses/recurring first so nothing cascades accidentally. |
| `categories` | Hard delete after reassigning references to a fallback category | Same rationale. |
| `user_settings_history`, `category_budget_history` | Never deleted by the client (DELETE policy dropped + grant revoked). Deleted only during account deletion. | Append-only audit data — past reports must be reconstructable. |

Every hard-delete path is ownership-scoped (RLS `auth.uid() = user_id` **plus**
an explicit `.eq('user_id', userId)` client filter) and is behind a destructive
action confirmation (Alert) or the OTP-gated account wipe.

## 2. Session storage — FIXED in round 3 (was finding #8)

**Round 3 update**: the session no longer sits in plaintext. `utils/supabase.ts`
now ships a SecureStore-backed storage adapter (iOS Keychain / Android
Keystore via `expo-secure-store`), with values chunked at 2000 bytes per
keychain entry. The chunking is what dissolves the historical objection below:
the old 2048-byte Keystore truncation bug that drove the AsyncStorage decision
cannot bite when no single entry approaches the cap, and current
expo-secure-store encrypts values with hybrid RSA+AES, which has no per-value
cap. A one-time migration moves any existing plaintext AsyncStorage session
into the secure store inside the adapter's first call (single-flight — token
writes can never race the copy) and deletes the plaintext copy, so upgrading
users are not logged out. Web keeps AsyncStorage (browser storage is the
platform's own boundary; expo-secure-store has no web target).

Compensating controls that remain:
- `signOut` revokes the **refresh token** server-side (a replayed refresh
  token is correctly rejected with `refresh_token_not_found`) and clears all
  user-scoped caches. See §2c for the access-token half of this picture.
- Biometric app lock (`SecurityContext` + `BiometricLockOverlay`) gates the UI
  even with a live session on disk.

**Follow-up if attempted** (device QA before release): a physical Android
device should be runtime-tested for (a) cold-start session restoration,
(b) token refresh, (c) global sign-out, against the chunked adapter.

## 2b. Password change revokes other sessions — verified platform behavior

GoTrue (Supabase Auth) revokes every session EXCEPT the one that performed the
update when a password changes: `User.UpdatePassword` →
`LogoutAllExceptMe(tx, sessionID, user.ID)` in supabase/auth
(`internal/models/user.go`). So after `changePassword()` succeeds, sessions on
other devices die at their next refresh; a stolen refresh token cannot survive
a password change. No project-side admin revocation call is needed — adding one
would duplicate platform behavior. The Edge-Function revocation route should
only be considered if the project ever migrates off hosted Supabase Auth.

## 2c. Access-token revocation gap — verified platform behavior (round 6 pentest, HIGH-1)

**What was verified live (2026-09-11):** `POST /auth/v1/logout` → 204
correctly kills the session in GoTrue — `GET /auth/v1/user` with the same
token then returns 403 `session_not_found`, and a replayed refresh token
returns `refresh_token_not_found`. **But the access token keeps working
against the data API for the rest of its lifetime:** `GET/POST /rest/v1/*`
with the same revoked token still returns 200/201.

**Why (platform characteristic, not a project bug):** PostgREST validates
only the JWT's *signature and expiry* — it never re-checks that the token's
`session_id` claim still exists in GoTrue. Tampered/garbage tokens ARE
rejected (401 `PGRST301`), so this is not "no verification"; it is
signature-only verification. Hosted Supabase runs PostgREST with the shared
JWT secret and no session store lookup, and this is not configurable from
the project side.

**Threat model impact:** a stolen access token (rooted device, intercept)
cannot be killed by "Sign out" — the victim taps sign-out and the token
still reads and writes their entire financial ledger for up to the access
token's remaining TTL (default 1 hour). The biometric app-lock gates the
app UI, not an out-of-app replay. Password change DOES kill it (§2b:
`LogoutAllExceptMe`), which remains the strongest user-side remedy.

**Risk posture (accepted for now, with mitigation):**
1. **Shorten the access-token TTL** — Dashboard → Authentication → JWT
   Settings → JWT expiry: 1 hour → 15 minutes (keep the refresh-token TTL
   long enough for a sane sign-in lifetime; the app auto-refreshes, so
   short access TTL is invisible to users). This bounds the post-signout
   exposure window from ~1 h to ≤ 15 min. OWNER ACTION — cannot be set
   from this repo.
2. **True revocation (not implemented, deliberate):** the options are
   (a) route sensitive reads through an RPC that checks
   `auth.jwt() -> 'session_id'` against `auth.sessions` (adds a lookup to
   every request), or (b) a `users.token_valid_after` timestamp baked into
   RLS policies (invalidates ALL sessions per-user on demand; needs its own
   "revoke all" trigger UX and migration). Both add per-request cost and
   complexity for a window that a 15-minute TTL already bounds tightly;
   revisit only if the threat model grows (e.g. institutional users).
3. Documented so nobody re-verifies this expecting a different answer —
   this is Supabase's PostgREST architecture, confirmed twice, 90+ s apart,
   including a WRITE (201) after sign-out.

## 3. OAuth deep-link / PKCE (finding #9) — verified current flow

`signInWithGoogle()` (services/auth.ts) uses `WebBrowser.openAuthSessionAsync`
against the Supabase Google OAuth URL and accepts either the hash-fragment
implicit tokens or the `code` query param (authorization-code flow). The
deep-link intake (`AuthContext.handleOAuthUrl`) mirrors this for cold-start
links.

- Supabase controls which flow is used server-side (enable **PKCE flow type**
  in the Supabase dashboard Auth settings to move off the implicit flow; the
  client's `exchangeCodeForSession` branch already handles the code flow).
- Risk accepted for now: tokens in the redirect URL are the user's OWN
  credentials for their own session — a malicious fragment link cannot inject
  someone else's session usefully, but URL-borne tokens are visible to browser
  history. Switching Supabase Auth to PKCE closes this without client changes.

## 4. Account-deletion semantics — resumable state machine (round 3)

The client performs **zero destructive work**. `deleteAccount()` only calls the
`delete-account` Edge Function with the caller's JWT; on any non-success it
throws and the account remains untouched (no fallback path exists).

The Edge Function is the sole orchestrator, in STRICT order:

1. JWT → target user (client-supplied IDs are ignored entirely — self-delete
   only by construction).
2. **Deletion lock**: `users.deletion_pending = true` (server-managed column;
   `block_writes_during_deletion` triggers reject that user's writes on EVERY
   user-owned table while set, and reject any client attempt to set the flag).
3. **Storage FIRST**: `receipts/{uid}/**` + `avatars/{uid}/**` purged via the
   official Storage SDK `remove()` with converging pagination, then verified by
   the `count_user_storage` RPC (reads storage metadata directly — a
   misleading SDK response cannot mask survivors). Any failure ⇒ 500; the DB
   and Auth are untouched at that point.
4. `public.delete_user_data(uuid)` RPC — ALL user-owned rows in ONE Postgres
   transaction (migration `20260908020000`), FK-safe order, idempotent.
5. Post-checks: profile row gone + a final storage sweep for objects a
   concurrent device might have uploaded between the purge and its (rejected)
   row insert.
6. Auth user deleted LAST — a failure there reports failure; retry re-verifies
   storage/DB (both converge to "already clean") and retries only the remainder.
7. `{ "success": true }` only on full completion.

**Cross-system boundary (honest, not pseudo-atomic):** PostgreSQL, Storage, and
Auth are separate services — no cross-system transaction exists. The design is
a retry-safe state machine: every stage is idempotent and treats "already
absent" as success. Residual, documented races: storage uploads are not
trigger-guardable (only DB rows are), so a sub-second window remains between
the final sweep and the auth deletion — any object landing there is
inaccessible garbage (private bucket, owner-policy, no owner identity) that
periodic maintenance can clean. Shared data (exchange rates, market gold
rates) is never touched.

## 4b. Exchange-rate status honesty (round 3)

`ExchangeRateContext` exposes `status: 'live' | 'cached' | 'estimated'` and
`fetchedAt` alongside `rates`. `DEFAULT_RATES` (the hardcoded offline
baseline) is never silently presented as market data: when only the baseline
is available, surfaces render an explicit localized "Offline rates in use"
notice (Accounts' net-worth card is the first consumer). Client writes to
`exchange_rates` remain denied (read-only for clients; trusted server only).

## 5. Bullion history policy (finding #1 — fixed)

Historical charts use ONLY verified `market_gold_rates` rows
(FENEGOSIDA via the cron-backed Edge Function). The synthetic trend generator
was deleted. Markets without ≥2 stored records show an explicit
"Historical data unavailable" state (localized en/hi/ne); the 1M/3M/6M/1Y
pills and Period High/Low badges render only with real history.

## 6. Staging environment — open PROCESS gap (round 3, not code)

All prior RLS/policy/trigger/Edge-Function changes (rounds 1–3) were applied
directly to the live production project. That works while migrations are
idempotent and Edge Functions are stateless, but it means production users are
the canary for every `create policy` / trigger rewrite.

Recommended process (owner action required, cannot be done from this repo):

1. Create a second Supabase project ("spendflow-staging").
2. Link it locally: `supabase link --project-ref <staging-ref>` and run
   `supabase db push` there FIRST for every new migration; verify the app
   against staging (point a debug build's `EXPO_PUBLIC_SUPABASE_URL` at it).
3. Only after staging verification, `supabase link` back to production and
   push. Never edit objects via the production dashboard SQL editor as the
   source of truth — migrations in `supabase/migrations/` are the only source.
4. Seed staging with synthetic users only (see the pgTAP suite for the RLS
   regression assertions that should also pass there).

Until a staging project exists, the pgTAP suite (below) is the compensating
control: it catches RLS regressions BEFORE production, in CI.

## 7. pgTAP RLS regression suite (round 3)

`supabase/tests/rls_regression.sql` + the `scripts/run-rls-tests.md` runner
instructions. The suite pins the security invariants that manual re-audits
kept having to re-verify:

- cross-user read/write isolation on every RLS'd table (expenses, categories,
  recurring_rules, transfers, bank_accounts, user_settings_history,
  category_budget_history, users, device_tokens, notifications)
- the `validate_owned_references` trigger rejecting cross-user FKs on
  expenses / recurring_rules / transfers / category_budget_history
- `exchange_rates` rejecting authenticated/anon writes (trusted server only)
- positive controls: same-user writes still work (the trigger must not
  over-block legitimate clients)

Run it against a fresh local `supabase db reset` + `supabase test db` (or the
staging project) before every production `db push`. The suite impersonates
clients exactly the way PostgREST does (role switch + request.jwt.claims),
inside probe helpers so pgTAP's own assertions keep running as superuser —
see `scripts/run-rls-tests.md`. CI wiring (GitHub Actions + supabase CLI) is
the natural next step. The suite has been static-verified against the
migration set (trigger-before-RLS ordering, revoked exchange_rates grants,
RLS no-op UPDATE semantics) but not yet executed — Docker is required;
running it is the first checklist item on any machine that has it.
