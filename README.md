# SpendFlow

SpendFlow is an Expo + Supabase personal expense tracker with email/password auth, Google OAuth, paginated expense history, analytics, offline write queueing, CSV/XLSX export, and light/dark/system themes.

## Prerequisites

- Node.js LTS
- Expo CLI via `npx expo`
- A new Supabase project dedicated to SpendFlow
- EAS CLI for cloud builds: `npm install -g eas-cli`

## Environment

Create `.env.local` from `.env.local.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_KEY=
EXPO_PUBLIC_GOOGLE_CLIENT_ID=
```

Do not commit real secrets.

## Supabase Setup

Apply the single frozen migration in `supabase/migrations/20260823170000_initial_spendflow_schema.sql` to a brand-new Supabase project.

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Enable Email auth and configure Google OAuth in Supabase Auth. Add the `spendflow://` redirect URL for the Expo OAuth flow.

## Local Development

```bash
npm install
npm run start
```

Use the Expo Go app or a development build for native testing.

## Validation

```bash
npm run typecheck
```

## EAS Build

```bash
eas build --profile development --platform android
eas build --profile preview --platform android
eas build --profile production --platform all
eas submit --profile production --platform all
```
