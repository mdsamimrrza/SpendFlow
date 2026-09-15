# SpendFlow — Full Production & Security Audit
**Date:** 2026-09-15 · **Scope:** `SpendFlow` (Expo mobile) + `spendflowweb` (Next.js web) — both against the shared Supabase backend `stisbfahlhquaqhrifjh.supabase.co`
**Method:** secrets/git-history scan · npm audit · `tsc` · production builds · `expo-doctor` · two full-code review passes (web surface, every migration + edge function + mobile client cross-check) · fixes applied locally · all gates re-run.

---

## 1. Verdict

| Gate | Mobile | Web |
|---|---|---|
| `tsc --noEmit` | ✅ 0 errors (also after Expo upgrade) | ✅ 0 errors |
| Production build | ✅ `next build` compiles clean (web export of RN not run) | ✅ `✓ Compiled successfully` |
| npm audit (prod) | ⚠️ 16 moderate — build-tooling only, §5 | ✅ 0 vulnerabilities |
| expo-doctor | ✅ 20/21 (one 3rd-party caveat, §5) | — |
| Secrets in git history | ✅ none ever committed | ✅ none ever committed |
| Secrets in tracked files | ✅ clean | ✅ clean |
| Shared config sync | ✅ same Supabase project, same 12 currencies, same FX feeds, bullion multipliers identical, i18n parity enforced | ✅ |

**No critical hole exists in either codebase as committed.** The security posture is genuinely strong (verified in §3). What was wrong — and now fixed — was mostly hardening debt in the shared backend plus small web-side correctness issues, §4. What remains is **deployment work only you can do**, §6.

---

## 2. Sync health (both repos vs each other)

| Item | Status |
|---|---|
| Supabase URL | ✅ identical in both `.env` files |
| Client key | ✅ both use new-format `sb_publishable_` key — service-role never client-side (grep-verified across both repos + git history) |
| 12-currency registry | ✅ `CURRENCIES`/`CURRENCY_DETAILS` mirrored, same order/codes |
| FX feeds | ✅ frankfurter + er-api + same pegged/fallback tables both sides |
| Bullion calibration | ✅ 1.20649 / 0.925588 / 1.22765 / 1.0918 / 0.9167 identical |
| i18n | ✅ mobile 490 keys exact parity en/hi/ne; web dictionaries parity gap found (2 keys) — **fixed** |
| Budget-currency rule | ✅ both store budget once, convert display-only |
| Cycle 1–31 sentinel | ✅ consistent both sides |
| OTP email broker | ✅ web + mobile both call the same `send-security-otp` function (server-side cooldown verified in its code) |

---

## 3. Verified-clean (the parts that had to be proven, not assumed)

- **RLS matrix**: all 14 app tables have RLS enabled with per-operation owner-scoped policies; soft-delete/Bin visibility deliberate; `exchange_rates`/`market_gold_rates` writes revoked (service-role only); `security_otp_sends` unreachable by clients; append-only history tables policy-locked; storage: `receipts` private (owner-only, 4 MiB, MIME-allowlist, 1-h signed URLs), `avatars` public-read by design, every write policy uses exact `(storage.foldername(name))[1] = auth.uid()` prefix equality — no traversal path.
- **FK-forging closed**: `validate_owned_references` triggers reject expense→someone-else's category/bank references.
- **SECURITY DEFINER hygiene**: all five definer functions have pinned `search_path`; pg_cron helpers revoked from client roles; service key stored in Supabase Vault, never in SQL or code.
- **Web attack surface**: exactly one route handler (PKCE auth callback, open-redirect-guarded); zero server actions; **no email route — SMTP creds exist only for local CLI scripts that push config to Supabase, so there is no open relay/spam vector**; CSP+HSTS+frame-ancestors+Permissions-Policy headers; zero `dangerouslySetInnerHTML`/`eval`; every client query is `user_id`-scoped with UUID-provenance checked; PostgREST `.or()` search string escapes quotes; sort fields whitelisted.
- **Mobile client**: session in chunked expo-secure-store (adapter migration verified), password change re-auths, email change OTP-gated, deletion sends no id (server resolves identity), offline cache purged on sign-out.

---

## 4. Findings & fixes

### Fixed in this pass (local code; §6 lists what to deploy)

**Backend / Supabase**

1. **[HIGH] `fetch-nepal-gold-rate` accepted forged service tokens** — the JWT branch decoded the presented key's payload and checked `role`/`iss`/`exp` **without verifying the signature**; the only real gate was the deploy-time `verify_jwt` gateway toggle. Anyone knowing the claim shape could forge a base64 payload and (if that toggle were ever off) write `market_gold_rates` — poisoning the Bullion benchmark every client reads.
   → Function now performs real **HS256 signature verification** (WebCrypto, constant-time compare) against the project JWT secret before trusting any claim; `alg` must be exactly `HS256`; if the secret env isn't configured the JWT branch **fails closed** (exact service-key matches still work). Requires the one-time `supabase secrets set SUPABASE_JWT_SECRET=…` (§6).
2. **[MED] Account-deletion OTP gate had an `iat`-only fallback** (`delete-account`) — refresh-bypassable in theory.
   → Now **fail-closed without an `amr` otp/magiclink entry** (every hosted GoTrue emits it; the fallback existed only for pre-2022 self-hosted builds).
3. **[MED] `deletion_pending` was a permanent lock with no recovery path** — a container kill between lock and cleanup could strand a user write-locked forever, with no client-visible escape.
   → New migration `20260916010000_audit_hardening.sql`: trigger-owned timestamp `deletion_pending_at`, **60-minute TTL**, self-heal on a client's next write; a deliberate service-role re-lock always wins (audited the re-lock edge case); a healthy deletion run finishes far inside the TTL, and `failLocked` release is unchanged.
4. **[MED] `delete_user_data(uuid)` — a wipe-any-account SECURITY DEFINER RPC guarded only by grants.**
   → Now also refuses any REST caller whose JWT role claim isn't `service_role` (independent of grant history; direct-SQL maintenance context still works).
5. **[LOW] `users.email` client-writable and drifts from Auth** (email-change flow updates GoTrue only).
   → Trigger `sync_users_email_from_auth` makes `auth.users.email` authoritative for every write + a one-time backfill of drifted rows.
6. **[LOW] Four trigger functions still carried the default PUBLIC EXECUTE grant** (`set_updated_at`, `validate_owned_references`, `block_writes_during_deletion`, `enforce_settings_history_dates`).
   → PUBLIC revoked, explicit `anon`/`authenticated`/`service_role` grants kept (triggers must fire for client writes).

**Web app**

7. **[MED] CSV import bypassed the shared money validation** — accepted any finite positive amount (no 1e12 ceiling), unbounded description/notes, and created categories without the 1–40-char rule; poisoned rows would feed balances/analytics/exports on *both* apps.
   → Import now runs through `assertAmountAndDate` (exported from `services/expenses.ts` — the same single source the form path uses) + `isValidISODate` for real calendar dates, truncates description/notes to the mobile caps (200 shown / 500-stored / 2000), and only auto-creates categories ≤ 40 chars (longer names fall back, never written raw).
8. **[MED] Empty-string env counted as "configured"** (`isSupabaseConfigured`, both client factories, middleware) — a deploy with blank keys built doomed clients instead of the friendly outage gate.
   → `||` fail-closed fallbacks + Boolean non-empty check in `utils/supabase/browser.ts`, `server.ts`, `middleware.ts`.
9. **[MED] Dead-but-live-looking FX env vars** — `NEXT_PUBLIC_EXCHANGE_RATE_*` were declared in `.env(.example)` but read by no file, and pointed at a host the CSP would block; a deployer "wiring them up" would silently fail.
   → Removed; comment documents frankfurter as the deliberate hardcoded feed.
10. **[LOW] Web i18n parity gap** — `recurring_freq_every_n_days`, `recurring_next_due` missing in hi/ne (both used in `RecurringRegister.tsx`, silently English).
    → Added to both blocks; parity re-verified by script.
11. **[LOW] `.env.example` instructed `.env.local` while the project actually uses `.env`** — mismatch invited a real-credential file with the wrong name.
    → Wording reconciled (both are gitignored).

**Mobile project health**

12. **Expo SDK 57.0.22 patch drift** (expo-doctor failure: 23 packages behind, including `expo`/`expo-router`) → `npx expo install --fix`; 22→package drift resolved; `tsc` still clean afterwards.

### Accepted / documented risks (not changed — with reasons)

- **CSP `'unsafe-inline'` scripts** — no sink exists today (zero `dangerouslySetInnerHTML`/`eval`; print window fully escaped). Nonce CSP breaks Next inline bootstrapping; revisit per-route.
- **`/preview*` pages public** (16+1 routes) — mock-data by design, middleware uses exact matches (no prefix leak), no auth-gating gap. They do ship the app bundle anonymously: add `X-Robots-Tag: noindex` on `preview*` at the CDN/edge layer, or gate at deploy, if SEO is a concern.
- **Sign-in `authErrorText` passthrough** of unrecognized GoTrue errors — deliberate (audit P3-9 comment), account-enumeration already handled for known codes.
- **Unencrypted localStorage ledger cache (web) / AsyncStorage cache (mobile)** — per-user scoped, purge-on-signout implemented, same documented policy both sides.
- **Client-side recurring generation** at login (both apps) — durable-but-slower server-side generator is a product decision, not a hole.
- **Access-token replay after local sign-out** — platform behavior; already mitigated (password change + global sign-out); the documented "JWT expiry → 15 min" dashboard action stands.
- **`device_tokens` unique-token oracle, soft-delete UPDATE visibility asymmetry** — owner-scoped only, no cross-user impact.

---

## 5. Dependency posture

- **Web prod: 0 vulnerabilities.** Dev: clean.
- **Mobile: 16 moderate, none runtime.** `uuid@3.4.0` (dev-only `@expo/ngrok`), `uuid@7.0.3` + `decode-uri-component` (build-time via `xcode`/`@expo/config-plugins` chains). Advisory code paths (`v3/v5/v6` with `buf`; ReDoS on attacker-supplied percent-encoding) are not reachable from app input in these toolchains. `npm audit fix --force` would downgrade `expo-sharing` — do not; revisit when upstream patches land.
- **`@react-native-ml-kit/text-recognition` (receipt OCR)**: only remaining expo-doctor warning — untested on React Native's New Architecture (RN 0.86 *requires* New Arch). Not a security issue; an upgrade-readiness one: before the next `eas build`, verify the podspec/AAR links under New Arch (there's already a podspec patch) or accept OCR-risk; patch-package keeps its local fixes current.
- **Patches**: both `patch-package` patches are build-compat only (iOS podspec, Android CMake) — no security relevance; they re-apply automatically post-`expo install` via the `postinstall` hook.

---

## 6. Actions only you can take (deploy-time — the code can't verify these from here)

1. **Apply the new migration** to the live project: `supabase db push` (or paste-run `supabase/migrations/20260916010000_audit_hardening.sql`). The RLS/policy state proven *in repo* is ahead of what past probes showed is *in production* (migrations `20260910010000`, `20260914010000` both record drift that actually happened).
2. **Reconcile production against repo**: `supabase db diff` and fix any drift; then **execute `supabase/tests/rls_regression.sql`** (the 49-assertion suite exists but, per SECURITY-NOTES.md §7, has never been run against a live DB). Until this is done, "backend hardened" is verified-by-code only.
3. **Redeploy the two edge functions** (`fetch-nepal-gold-rate`, `delete-account`) and **set the verification secret**: `npx supabase secrets set SUPABASE_JWT_SECRET=<JWT secret from Dashboard → Settings → API>` (without it the legacy-JWT branch fails closed — cron keeps working via exact service-key match).
4. **Verify the Vault secret** `spendflow_service_role_key` equals the *current* runtime service key (`select name from vault.decrypted_secrets` / re-set via the documented `vault.create_secret` call) so the gold-rate cron hits the exact-match path.
5. **Commit both working trees** — mobile has 47 untracked + 68 modified files (~7.5k lines: Bin feature, `useAccountBalances`, preview rework — all scanned secret-clean) and web has its own set (including the concurrent forgot-password-modal WIP, which is *not* part of this audit but does compile and build clean). Uncommitted work is one disk failure from loss.
6. Optional dashboard items (already in SECURITY-NOTES): JWT lifetime → 15 min; GoTrue rate-limit review.

After 1–4: re-run `supabase db diff` (expect empty) and the regression suite as the final proof, then the system is production-ready end-to-end.

---

## 7. Component coverage map (what was read in this audit)

- **Mobile**: all 37 migrations + 4 edge functions + `config.toml` + RLS suite (full re-read); `utils/supabase.ts`, `store/AuthContext`, `services/{auth,expenses,transfers,recurring,exchange,bullion,receipts,bin,notifications,validation}`, `hooks/{useExpenses,useRateResolver,useAccountBalances}`, constants (app/countries/theme/i18n×3), `app.json`/`eas.json`/`google-services.json` handling, `plugins/`, `patches/`, `.env*`, git history.
- **Web**: `middleware.ts`, `next.config.ts`, both Supabase factories, `AuthContext`/`LanguageContext`/providers, all 15 services, auth pages, callback route, ExportStatement + expense form + recurring register, `scripts/configure-*`, emails templates wiring, `.env*`, git history.
- **Gates**: `tsc` ×2, `next build` ×2, `npm audit` ×2, `expo-doctor` ×2, i18n parity scripts, edge-function type/syntax check (caught and fixed one wrong `importKey` arity during this pass), secret scans over tracked + untracked files.

*Concurrent WIP note: web `app/(auth)/sign-in/page.tsx` (+ forgot-password modal work), some dictionary keys, and `docs/FEATURE-PARITY.md` were modified by you/another session during this audit — they are not audit fixes, and they pass the same verification gates (§1).*
