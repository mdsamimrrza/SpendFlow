# SpendFlow Architecture & Engineering Decisions

## 1. Framework & Core Dependencies
- **Expo SDK 54 & Expo Router v6**: Used to maintain strict compatibility with versioned Expo SDK 54 APIs and maintain file-based routing across tabs and dynamic routes (`[id]`).
- **React 19 & React Native 0.81**: All components, hooks, and services strictly maintain 100% type safety with zero `tsc` compiler warnings.

---

## 2. Authentication & Session Persistence
- **AsyncStorage for Supabase JWT**: Switched from `expo-secure-store` to `@react-native-async-storage/async-storage` for Supabase authentication sessions (`utils/supabase.ts`). This avoids Android Keystore 2048-byte truncation errors (`KeyStoreException`) while maintaining secure, persistent logins.

---

## 3. UI Architecture & Compact Layout Standards
- **Strict Brand Design System**: Preserved the Emerald/Forest green brand palette, `#0d1117` surfaces, and dynamic tokens in `constants/theme.ts`. All styling pulls directly from `useTheme()`.
- **Zero Layout-Shift Amount Masking**: Amount containers calculate and enforce a stable width so toggling privacy mode (`isPrivacyMode` showing `••••••`) keeps the `PrivacyEyeButton` fixed at the exact same pixel position without shifting or clipping adjacent comparison badges.
- **Android Ascender Safety**: Specified explicit `lineHeight`, `includeFontPadding: false`, and `adjustsFontSizeToFit` with `minimumFontScale={0.7}` on large numerical amounts to prevent top-clipping on compact Android screens.
- **Analytics Dropdowns**: Replaced stacked pill rows with dual side-by-side dropdown selectors (`📅 Timeframe` + `📊 Analytics View`) featuring in-place floating popover menus and click-outside dismissal overlay.
- **Financial Health Score Modal**: Implemented isolated backdrop touch-interception with `nestedScrollEnabled={true}` so all 4 diagnostic pillars and legend scales scroll smoothly across all Android devices.

---

## 4. Bullion Market Calibration & Session Fixing
- **Statutory Customs & Tariff Multipliers**:
  - **Nepal (FENEGOSIDA)**: Calibrated at `1.20649` tariff multiplier for Fine Gold (24K / Chhapawal), `92.5588%` for Tejabi Gold (22K), and `1.22765` for Silver (चाँदी).
  - **India (IBJA)**: Calibrated at `1.0918` (6% Customs Duty + 3% GST) for 24K and `91.67%` for 22K (916).
- **Session Locking Engine**:
  - Nepal rates lock at **10:30 AM NPT** (Sun–Fri); held on Saturdays (market closed).
  - India rates lock at **12:00 PM IST (AM Fix)** and **4:30 PM IST (PM Fix)** (Mon–Fri); held on weekends.
  - Prevents intraday spot drifting to ensure rates match physical jewelry store market boards throughout the day.

---

## 5. Android Native Assets & Notifications
- **Status Bar Notification Icons**: Generated pure white (`#FFFFFF`) monochrome silhouettes on a 100% transparent background across all `drawable-*` density folders (`notification_icon.png`), eliminating the solid black dot rendering artifact on Android status bars.
- **Adaptive Launcher Icons**: Maintained exclusively as modern `.webp` assets across all `mipmap-*` folders (`ic_launcher.webp`, `ic_launcher_round.webp`, `ic_launcher_foreground.webp`).
- **Clean Repository**: Added `*.apk` and `*.aab` to `.gitignore` to prevent heavy build binaries from being committed to source control.

---

## 6. Offline Queue & Export Engines
- **Secure Offline Queue**: Offline mutations are queued in `AsyncStorage` under `spendflow_offline_queue` and synced via `utils/offlineQueue.ts` upon network reconnection.
- **Excel & PDF Receipts**: Utilizes `write-excel-file` (replacing vulnerable `xlsx`) and `expo-print` for receipts and transaction statements.
- **Multilingual Synchronization**: English (`en`), Hindi (`hi`), and Nepali (`ne`) dictionaries remain synchronized in `constants/i18n/`.

---

## 7. Income & Cash Flow Tracking & Category CRUD
- **Transaction Dual Mode**: Transactions and categories support `type: 'expense' | 'income'`. Form UI toggles dynamically between Expense (Outflow) and Income (Inflow) with dedicated category filtering.
- **Cash Flow Calculations**: `utils/format.ts` computes `sumExpenses`, `sumIncome`, and `calculateCashFlow` (Net Savings = `Income - Expenses`).
- **Category CRUD Engine**: Added `createCategory`, `updateCategory`, and `deleteCategory` in `services/categories.ts` with local `AsyncStorage` cache invalidation and a dedicated `app/categories.tsx` screen and modal picker.

