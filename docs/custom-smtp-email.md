# Custom SMTP — Sending Auth / OTP Email From the SpendFlow Inbox

**Status:** Gmail account `sahakarisip.app@gmail.com` is the intended sender.
Credentials are recorded in `.env.maintenance` (`EMAIL_SERVER_*`, `EMAIL_FROM`).

## How SpendFlow email actually works

Every user-facing email — signup confirmation, sign-in OTP, magic link,
password recovery, the email-change OTP, and the account-deletion OTP
(issued by the `send-security-otp` Edge Function via `/auth/v1/otp`) — is
sent **server-side by Supabase Auth (GoTrue)**. The Expo client only asks
GoTrue to send; it never opens an SMTP connection itself.

Consequences:

1. There is **no app code to change** to switch senders. One Dashboard
   setting redirects *all* of the flows above to your mailbox.
2. SMTP credentials in the client `.env` would do nothing and would be an
   audit smell — they therefore live in `.env.maintenance` (gitignored),
   as the canonical record of what is pasted into the Dashboard.
3. Without custom SMTP, GoTrue uses Supabase's built-in mailer
   (`noreply@<project-ref>.supabase.co`, capped at ~2 emails/hour), so
   users see an unbranded sender and OTP sends silently fail past the cap.

## One-time setup (Supabase Dashboard — 5 minutes)

1. Gmail precondition (already met): generate a
   [16-character App Password](https://myaccount.google.com/apppasswords)
   (requires 2-Step Verification). The normal Gmail password will always
   fail with `535-5.7.1 Username and Password not accepted`.
2. Open **Dashboard → Project `stisbfahlhquaqhrifjh` → Authentication →
   Sign In / Providers → SMTP / Email → Enable SMTP delivery** and paste
   the values from `.env.maintenance`:

   | Field          | Value                                   |
   | -------------- | --------------------------------------- |
   | SMTP host      | `smtp.gmail.com`                        |
   | SMTP port      | `587` (STARTTLS)                        |
   | Username       | `sahakarisip.app@gmail.com`             |
   | Password       | the App Password (spaces optional)      |
   | Sender email   | `sahakarisip.app@gmail.com`             |
   | Sender name    | `SpendFlow`                             |

3. Click **Send test email** (to your own address). A delivery success means
   every GoTrue mailer is now routed through Gmail.
4. Save — the project restarts its Auth service; users are unaffected.

## Brand the templates (Dashboard → Authentication → Email Templates)

SMTP changes *who sends*; templates change *what arrives*. The redesigned
SpendFlow templates live in
[`supabase/email-templates/`](../supabase/email-templates/README.md) — paste
each file into its Dashboard slot (the README has the subject-line map).
Keep the `{{ .ConfirmationURL }}` / `{{ .Token }}` placeholders exactly
intact (verifying breaks without them). Subjects and bodies are per-project
Dashboard state, not repo code, so any change there is **not** tracked in
git — update the files in `supabase/email-templates/` in the same sitting.

## Verifying it took effect

- The test email (and any real OTP) shows `from: SpendFlow
  <sahakarisip.app@gmail.com>` and `mailed-by: google.com` — never
  `mailed-by: supabase.co`.
- Rate-limit probe (optional): two OTP sends minutes apart both deliver.
  On the built-in mailer the third send within an hour fails.

## Limits & notes

- Gmail free tier: ~500 recipients/day — more than enough for auth mail;
  revisit (Workspace, SES, Resend) before scaling past a few hundred users
  a day.
- The `send-security-otp` cooldown (60 s per user/purpose in
  `security_otp_sends`) is what protects the mailbox; the Dashboard mailer
  settings do not add client-side throttling.
- If the Gmail App Password is ever rotated or revoked, auth mail fails
  immediately for everyone — update both this Dashboard field and
  `.env.maintenance` in the same sitting.

## What NOT to do

- Don't wire `nodemailer`/SMTP into an Edge Function to hand-send auth
  email with these credentials. That bypasses the Dashboard mail templates,
  GoTrue's own rate limiting, and re-implements a solved problem; the
  Dashboard SMTP config above is Supabase's supported path.
- Don't move `EMAIL_SERVER_*` into the client `.env` or any
  `EXPO_PUBLIC_*` variable — they would ship in the app bundle.
