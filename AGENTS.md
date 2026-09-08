# SpendFlow Developer & Agent Rules

## 1. Core Framework & Versioning
- **Expo SDK 57**: Always reference the exact versioned Expo docs at <https://docs.expo.dev/versions/v57.0.0/> before writing code or modifying configs.
- **React Native 0.86+ & React 19**: Strictly maintain type safety across all screens, services, hooks, and components (`npx tsc --noEmit` must pass with 0 errors).

---

## 2. 🎨 Color Palette & Design System (DO NOT CHANGE)
- **Strict Brand Palette**: Do **NOT** alter the theme tokens defined in `constants/theme.ts` — Light mode is warm parchment (`#EDEAE0` bg, teal `#0F5C4D` primary); Dark mode is deep slate (`#0B0F19` bg, indigo `#818CF8` primary).
- **UI Architecture**: Every UI component must pull colors, radii, and typography dynamically from `useTheme()` to guarantee 100% theme consistency across both Dark and Light modes.
- **Chart Series Colors**: Income is always `theme.colors.income` (green). The expense/outflow series is theme-conditional — indigo (`theme.colors.primary`) in dark mode, rust (`theme.colors.danger`) in light mode — via a single `expenseColor` variable in `StockTrendChart.tsx` (never hardcode one branch).
- **Visual Excellence**: Preserve glassmorphic cards, smooth animations, and clean micro-interactions without introducing jarring layout shifts.

---

## 3. 📱 Mobile UI & Compact Screen Polish
- **Zero Layout Shifts**: When masking amounts (`isPrivacyMode` toggling `••••••`), lock the amount container width so icons (such as `PrivacyEyeButton`) stay in the exact same pixel position without jumping or clipping adjacent badges (`▲ 100% vs last mon`).
- **Ascender Padding & Font Fitting**: On large numerical headers (`AMOUNT`), always specify safe `lineHeight`, `includeFontPadding: false`, and `adjustsFontSizeToFit` with `minimumFontScale` to prevent text truncation on compact Android devices (e.g. 360dp width).
- **In-Place Toolbar & Popovers**: The 3-icon toolbar on History (`[ 📅 Timeframe ]`, `[ 🏷️ Category ]`, `[ ⇅ Sort ]`) and dual selectors on Analytics use in-place floating popovers positioned directly below icons (`top: 46, right: 0`) with `elevation: 25`, universal click-outside dismissal, and background scroll locking (`scrollEnabled={!isDropdownOpen}`).
- **Calendar & Modal Dialogs**: `CalendarModal.tsx` and detail sheets maintain safe bottom inset padding (`paddingBottom: 36`) and `nestedScrollEnabled` to ensure action buttons are never obscured by the Android gesture bar.
- **Onboarding**: Single fixed page — NO vertical ScrollView. Compact sizing is driven by `useWindowDimensions().height < 400`. Country chips show flag + currency code only; never put full country names in fixed-width grid cells (they overflow).

---

## 4. 💳 Multi-Account, Income & Budget-Currency Architecture
- **Bi-Directional Cash Flow**: All transactions support `type: 'expense' | 'income'`. Vault & Flow cards compute net flows, total inflow (+), total outflow (-), and peak spending dynamically.
- **Bank & Account Management**: Multi-account support (`bank_accounts` table) spanning Cash, Bank Accounts, Credit Cards, Wallets, and Savings with real-time balance aggregation. Transfers lock their exchange rate on the row at creation time.
- **Dynamic Category Mapping**: Categories support `type: 'expense' | 'income' | 'both'` with specialized icon palettes and badges.
- **Budget Currency Rule (CRITICAL)**: The monthly budget is stored ONCE in the `users` table with its own `budget_currency` (set when the user edits it in Profit & Loss). Changing the display currency must NEVER rewrite the stored budget — conversion is display-only via `getMonthlyBudget()` in `utils/format.ts` (budget_currency → preferred_currency). Never re-base the stored figure on currency change; it drifts the number and spams `user_settings_history`.
- **Settings History**: `user_settings_history` is append-only (baseline row `1900-01-01` + one row per real change). A UNIQUE `(user_id, effective_from)` constraint backs the baseline sync; `ensureUserSettingsBaseline` uses select-then-update/insert (native upsert only after that constraint exists everywhere).
- **Custom Cycle Window**: `cycle_start_day` accepts **2–31** everywhere (profile service, notification path in `hooks/useExpenses.ts`, DB check). Never cap at 28 — starts on the 29th–31st are valid and must stay consistent between UI and background budget checks.

---

## 5. 🌍 12-Country Currency System
- **Single Source of Truth**: `CURRENCIES` + `CURRENCY_DETAILS` (flag/label/symbol) in `constants/app.ts` — NPR, INR, USD, QAR, GBP, AED, SAR, MYR, KRW, JPY, AUD, CAD. Never hardcode currency option lists elsewhere (Settings derives its list from it).
- **Institution Registry**: `constants/countries.ts` holds all 12 enabled countries (`ENABLED_COUNTRY_CODES`) with real banks/wallets; `WIZARD_COUNTRIES` drives the account wizard and onboarding picker.
- **Onboarding Currency**: Device-level `@spendflow_onboarding_currency` is written on finish; `ensureProfile` adopts it as the user's display currency at FIRST login on that device only.
- **Exchange Fallbacks**: Every one of the 12 currencies has a fallback rate in BOTH `store/ExchangeRateContext.tsx` (DEFAULT_RATES) and `services/exchange.ts` (FALLBACK_UNITS_PER_USD / PEGGED) — keep them in sync when adding a currency. QAR/AED/SAR are pegged and never hit the API.

---

## 6. 🥇 Bullion Market Benchmark Engine (`app/bullion.tsx`)
- **Nepal (FENEGOSIDA Alignment)**:
  - Fine Gold (24K / Chhapawal): Uses official tariff multiplier `1.20649`.
  - Tejabi Gold (22K): Calibrated at `92.5588%` of Fine Gold.
  - Silver (चाँदी): Uses official tariff multiplier `1.22765`.
  - Session Fixing: Locks rates daily at **10:30 AM NPT** (Sun–Fri); holds Friday fix on Saturdays (market closed).
- **India (IBJA Alignment)**:
  - Gold 24K / Silver: Calibrated at `1.0918` (6% Customs Duty + 3% GST).
  - Gold 22K (916): Calibrated at `91.67%`.
  - Session Fixing: AM Fix (12:00 PM IST) and PM Fix (4:30 PM IST); holds Friday PM fix on weekends.

---

## 7. 🔐 Auth, Profile & Storage
- **Supabase Auth**: JWT sessions must be stored via `AsyncStorage` (in `utils/supabase.ts`) to avoid Android Keystore 2048-byte truncation errors.
- **Profile Screen (`app/profile.tsx`)**: Pushed from Settings' Edit button. Avatar upload → `avatars` storage bucket (per-user folder; falls back to `receipts` bucket if the avatars migration hasn't run) with URL persisted to the `users` table + auth metadata + cached profile. Email change is OTP-gated: the code is sent to and verified against the CURRENT email before `updateUser({ email })` runs. Password change re-verifies the current password via `signInWithPassword` before updating. "Sign out all devices" uses `signOut({ scope: 'global' })`. Account deletion uses the shared `components/account/DeleteAccountModal.tsx` (email-OTP wipe) — never duplicate that flow inline.
- **Android Notification Icons**: Must remain pure white (`#FFFFFF`) monochrome silhouettes on a 100% transparent background across all `drawable-*` density folders (`notification_icon.png`). Do **not** use solid background circles.
- **Adaptive Launcher Icons**: Maintained in `mipmap-*` folders as `.webp` assets.

---

## 8. 🛡️ Existing Feature Preservation (DO NOT BREAK)
- **Multilingual Support**: English (`en`), Hindi (`hi`), and Nepali (`ne`) localization must remain synchronized in `constants/i18n/` — every new user-facing string is added to all three files in the same change.
- **Biometric Security**: Face ID / Fingerprint app locking via `expo-local-authentication` (`SecurityContext` + `BiometricLockOverlay`).
- **Offline Read-Cache**: Per-user expense cache in AsyncStorage (`EXPENSE_CACHE_PREFIX` + user id) paints instantly before network; `ensureProfile` falls back to the cached profile when offline. (There is NO offline mutation queue anymore — `utils/offlineQueue.ts` was removed. Writes are online-only; the `client_sync_id` column remains as a future hook but its unique index is intentionally dropped until a queue returns.)
- **Export & Reports**: PDF / Excel / CSV receipt generation via `expo-print` and `write-excel-file`.
- **Database Hygiene**: `expenses` runs a minimal index set (PK, partial live index `(user_id, date DESC) WHERE deleted_at IS NULL`, recurring dedup unique, `category_id` for FK RESTRICT, `(user_id, deleted_at)`). Do not re-add global date indexes or the `client_sync_id` unique index without a query that needs them.
- **Repository Cleanliness**: Build artifacts (`*.apk`, `*.aab`) must stay ignored in `.gitignore`.
