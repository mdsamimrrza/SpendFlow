# SpendFlow Developer & Agent Rules

## 1. Core Framework & Versioning
- **Expo SDK 54**: Always reference the exact versioned Expo docs at <https://docs.expo.dev/versions/v54.0.0/> before writing code or modifying configs.
- **React Native 0.81+ & React 19**: Strictly maintain type safety across all screens, services, hooks, and components (`npx tsc --noEmit` must pass with 0 errors).

---

## 2. 🎨 Color Palette & Design System (DO NOT CHANGE)
- **Strict Brand Palette**: Do **NOT** alter the established Emerald/Forest green, Dark Surface (`#0d1117`, `#161b22`), and Light Mode theme tokens defined in `constants/theme.ts`.
- **UI Architecture**: Every UI component must pull colors, radii, and typography dynamically from `useTheme()` to guarantee 100% theme consistency across both Dark and Light modes.
- **Visual Excellence**: Preserve glassmorphic cards, smooth animations, and clean micro-interactions without introducing jarring layout shifts.

---

## 3. 📱 Mobile UI & Compact Screen Polish
- **Zero Layout Shifts**: When masking amounts (`isPrivacyMode` toggling `••••••`), lock the amount container width so icons (such as `PrivacyEyeButton`) stay in the exact same pixel position without jumping or clipping adjacent badges (`▲ 100% vs last mon`).
- **Ascender Padding & Font Fitting**: On large numerical headers (`AMOUNT`), always specify safe `lineHeight`, `includeFontPadding: false`, and `adjustsFontSizeToFit` with `minimumFontScale` to prevent text truncation on compact Android devices (e.g. 360dp width).
- **In-Place Toolbar & Popovers**: The 3-icon toolbar on History (`[ 📅 Timeframe ]`, `[ 🏷️ Category ]`, `[ ⇅ Sort ]`) and dual selectors on Analytics use in-place floating popovers positioned directly below icons (`top: 46, right: 0`) with `elevation: 25`, universal click-outside dismissal, and background scroll locking (`scrollEnabled={!isDropdownOpen}`).
- **Calendar & Modal Dialogs**: `CalendarModal.tsx` and detail sheets maintain safe bottom inset padding (`paddingBottom: 36`) and `nestedScrollEnabled` to ensure action buttons are never obscured by the Android gesture bar.

---

## 4. 💳 Multi-Account & Income / Cash Flow Architecture
- **Bi-Directional Cash Flow**: All transactions support `type: 'expense' | 'income'`. Vault & Flow cards compute net flows, total inflow (+), total outflow (-), and peak spending dynamically.
- **Bank & Account Management**: Multi-account support (`bank_accounts` table) spanning Cash, Bank Accounts, Credit Cards, Wallets, and Savings with real-time balance aggregation.
- **Dynamic Category Mapping**: Categories support `type: 'expense' | 'income' | 'both'` with specialized icon palettes and badges.

---

## 5. 🥇 Bullion Market Benchmark Engine (`app/bullion.tsx`)
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

## 6. 🔐 Auth, Storage & Android Assets
- **Supabase Auth**: JWT sessions must be stored via `AsyncStorage` (in `utils/supabase.ts`) to avoid Android Keystore 2048-byte truncation errors.
- **Android Notification Icons**: Must remain pure white (`#FFFFFF`) monochrome silhouettes on a 100% transparent background across all `drawable-*` density folders (`notification_icon.png`). Do **not** use solid background circles.
- **Adaptive Launcher Icons**: Maintained in `mipmap-*` folders as `.webp` assets.

---

## 7. 🛡️ Existing Feature Preservation (DO NOT BREAK)
- **Multilingual Support**: English (`en`), Hindi (`hi`), and Nepali (`ne`) localization must remain synchronized in `constants/i18n/`.
- **Biometric Security**: Face ID / Fingerprint app locking via `expo-local-authentication`.
- **Offline Sync**: Offline mutation queue via `utils/offlineQueue.ts`.
- **Export & Reports**: PDF / Excel / CSV receipt generation via `expo-print` and `write-excel-file`.
- **Repository Cleanliness**: Build artifacts (`*.apk`, `*.aab`) must stay ignored in `.gitignore`.
