# SpendFlow Auth Email Templates

Redesigned, brand-consistent HTML for every Supabase Auth email. These are
**Dashboard state, not runtime code** — Supabase's GoTrue mailer renders them,
so the files here are the version-controlled source of truth. Whenever one is
edited, paste the new version into the Dashboard in the same sitting (and say
so in the commit message). Repo files alone change NOTHING users receive.

## Paste map — matches Dashboard → Authentication → **Emails** → Templates

For each row: open the slot, paste the **Subject** into the subject field,
paste the file's full contents into the HTML body, **Save**.

### Templates tab

| Dashboard slot            | File                   | Subject |
| ------------------------- | ---------------------- | ------- |
| Confirm sign up           | `confirm-signup.html`  | `Confirm your SpendFlow account` |
| Magic link or OTP         | `email-otp.html`       | `Your SpendFlow security code` |
| Reauthentication          | `reauthentication.html`| `Verify it's you - SpendFlow security code` |
| Change email address      | `change-email.html`    | `Confirm your new SpendFlow email` |
| Reset password            | `recover-password.html`| `Reset your SpendFlow password` |
| Invite user               | — not used, leave default | |

### Security tab

| Dashboard slot            | File                   | Subject |
| ------------------------- | ---------------------- | ------- |
| Password changed          | `password-changed.html`| `Your SpendFlow password was changed` |
| Email address changed     | `email-changed.html`   | `Your SpendFlow email address was changed` |
| Phone number changed, Sign-in method linked/removed, MFA added/removed | — not used (no phone/MFA), leave defaults | |

Which app flow triggers which slot:

- **Sign up** (`signUpWithEmail`) → *Confirm sign up*
- **Account deletion / email-change 6-digit code** (`send-security-otp` Edge
  Function → `/auth/v1/otp`) → **Magic link or OTP** — this is the code users
  type into the 6-digit modal, so `{{ .Token }}` is the hero element.
- GoTrue-initiated identity re-checks → *Reauthentication* (same code design)
- **Forgot password** (`resetPasswordForEmail`) → *Reset password*
- **Password/email change confirmations** → Security-tab notices

## Applying changes — no Dashboard needed

These templates are applied **programmatically** via the Supabase Management
API (`PATCH https://api.supabase.com/v1/projects/stisbfahlhquaqhrifjh/config/auth`,
Bearer = Supabase CLI access token from Windows Credential Manager, or a PAT
from https://supabase.com/dashboard/account/tokens). Field names are
`mailer_subjects_<slot>` / `mailer_templates_<slot>_content`. After editing a
file here, PATCH it and restart Auth happens automatically. Current live
state (verified 2026-09-14): all 7 slots custom, subjects branded,
`mailer_otp_length = 6` (matches the app's 6-digit modal), and the
password-changed / email-changed security notices are ENABLED.

## Hard rules (breaking these silently breaks auth)

1. `{{ .Token }}`, `{{ .ConfirmationURL }}`, `{{ .Email }}` etc. must appear
   **exactly as written** — a mangled placeholder renders an email with no
   working code/link.
2. Inline styles only, table layout, no `<img>`, no SVG, no web fonts — Gmail,
   Outlook and Samsung Mail all strip or ignore the rest.
3. Keep the message width ≤ 560px; mobile clients scale it down cleanly.
4. Expiry copy says "1 hour" to match GoTrue's default TTL. If
   Dashboard → Authentication → Advanced TTL is ever changed, update the copy
   in `email-otp.html` and `reauthentication.html`.

## Design tokens (mirrors `constants/theme.ts` light mode)

| Role | Value |
| ---- | ----- |
| Page background | `#EDEAE0` (parchment) |
| Card | `#FFFFFF`, border `#E2DED2`, radius 16 |
| Primary / CTA | `#0F5C4D` (teal) |
| Heading text | `#16232E` |
| Body text | `#5C6B66` · muted `#8A948F` |
| Code chip | bg `#F4F1E8`, dashed border `#C9C2AE` |

Emails stay light-mode always (dark-mode email rendering is unreliable); the
palette above is the app's light theme on purpose.

## Localization note

The app UI ships en/hi/ne, but GoTrue renders **one template per email type**
with no per-user language switching — so templates stay short, plain English.
Don't duplicate them per language.

## Verification checklist (after pasting)

- [ ] Settings → Delete account → request code → the **branded** code email
      arrives (large 6-digit chip, teal header) and the code verifies.
- [ ] Profile → change email → same branded code email.
- [ ] Sign up with a throwaway email → branded confirm email, button
      deep-links into the app.
- [ ] "Forgot password" → branded reset email.
- [ ] Change password in-app → branded security notice.
- [ ] Every email shows `from: SpendFlow <sahakarisip.app@gmail.com>`
      (custom SMTP — see [docs/custom-smtp-email.md](../../docs/custom-smtp-email.md)).
- [ ] Check one email in Gmail web, Gmail Android, and Outlook — layout intact.
