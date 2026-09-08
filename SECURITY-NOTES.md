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

## 2. Session storage (finding #8) — known limitation, deliberate

The Supabase session (access + refresh token) persists in **AsyncStorage**, not
`expo-secure-store`, even though `expo-secure-store` is installed.

Why kept:
- AGENTS.md §7 records the prior incident: storing the JWT in Android
  Keystore-backed storage hit a 2048-byte truncation limit (Keystore-safe
  blob cap), breaking session restoration — the documented resolution was the
  AsyncStorage adapter in `utils/supabase.ts`.
- AsyncStorage gives reliable `persistSession: true` + `autoRefreshToken: true`
  behavior across cold starts; a broken secure-storage adapter would silently
  log users out — worse for a finance app than the (rooted-device) plaintext
  risk.

Current compensating controls:
- Tokens are opaque to other apps (app-sandboxed storage on Android).
- `signOut` revokes server-side and clears all user-scoped caches.
- Biometric app lock (`SecurityContext` + `BiometricLockOverlay`) gates the UI
  even with a live session on disk.

**Follow-up if attempted**: a SecureStore adapter must be runtime-tested on a
physical Android device for (a) cold-start session restoration, (b) token
refresh, (c) global sign-out, before replacing AsyncStorage. Do not ship blind.

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

## 4. Account-deletion semantics (finding #2 — fixed)

Client (`deleteAccount`) → authenticated POST to Edge Function
`delete-account` (JWT-verified, self-delete only) → service-role deletes rows
in FK order, paginates storage cleanup, deletes the AUTH USER last → only then
does the client clear AsyncStorage + sign out. Any step failing returns a
non-ok response and the client surfaces "deletion did not complete" — never a
false success. Retry-safe: every step is idempotent; a partially cleaned
account repeats the same deterministic sequence.

If the Edge Function is not deployed (404), the client falls back to
RLS-scoped row cleanup but **explicitly tells the user the login identity
could not be deleted**.

## 5. Bullion history policy (finding #1 — fixed)

Historical charts use ONLY verified `market_gold_rates` rows
(FENEGOSIDA via the cron-backed Edge Function). The synthetic trend generator
was deleted. Markets without ≥2 stored records show an explicit
"Historical data unavailable" state (localized en/hi/ne); the 1M/3M/6M/1Y
pills and Period High/Low badges render only with real history.
