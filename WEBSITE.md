# SpendFlow Website Content & Update Specification

**Version:** 2.0.0  
**Last Updated:** 2026-09-04  
**Source of Truth:** This document is derived from the live codebase (`app/`, `components/`, `services/`, `constants/`, `hooks/`, `supabase/migrations/`) and serves as the single reference for what the public website / landing page / marketing site must communicate.

---

## 1. Brand Identity & Visual Language (DO NOT CHANGE)

### 1.1 Color Palette (Theme Tokens)
| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| **Primary** | `#0F5C4D` (Teal) | `#818CF8` (Indigo) | Active states, progress bars, chart lines, primary CTAs |
| **Primary Strong** | `#0A453A` | `#A5B4FC` | Hover/pressed states |
| **Primary Light** | `#DCE9E3` | `rgba(129,140,248,0.18)` | Light backgrounds for teal chips/icons |
| **Accent / Brass** | `#A8791F` | `#8B5CF6` | Highlights, badge percentages, gold/bullion |
| **Success / Income** | `#047857` | `#10B981` | Income amounts, positive deltas |
| **Warning** | `#A8791F` | `#F59E0B` | Mid-threshold alerts |
| **Danger / Expense** | `#A5442B` (Rust) | `#EF4444` | Expense amounts, over-limit, alerts |
| **Background** | `#EDEAE0` (Warm parchment) | `#0B0F19` (Deep slate) | App canvas |
| **Surface** | `#F7F5EC` | `#151D2A` | Cards, sheets |
| **Surface Elevated** | `#E5E2D6` | `#1E293B` | Modals, elevated cards |
| **Text** | `#17241F` | `#F8FAFC` | Primary copy |
| **Text Muted** | `#4B5C55` | `#94A3B8` | Secondary labels |
| **Border** | `#CFCABA` | `#273549` | Dividers, input borders |

### 1.2 Typography Scale
| Style | Font Size | Line Height | Weight |
|-------|-----------|-------------|--------|
| Display | 34 | 42 | 800 |
| H1 | 28 | 34 | 800 |
| H2 | 22 | 28 | 700 |
| H3 | 18 | 24 | 700 |
| Body | 16 | 23 | 400 |
| Small | 14 | 20 | 400 |
| Caption | 12 | 16 | 500 |
| Label | 13 | 16 | 700 |

### 1.3 Spacing & Radius System
- **Spacing:** `xs:4, sm:8, md:12, lg:16, xl:20, 2xl:24, 3xl:32, 4xl:48, 5xl:64`
- **Radius:** `sm:6, md:10, lg:16, full:9999`

### 1.4 Logo & Seal
- **SpendFlowSealLogo** — Gold medallion with concentric rings, centered serif "S", twin curved brass pedestal arcs, optional dashed alignment orbit with N/E/S/W dots.
- Colors: Gold `#A8791F` on Dark `#141B26` / Light `#FAFAF8`.
- Used on: Onboarding hero, splash screens, empty states, export PDF letterhead.

### 1.5 Design Principles (Enforced Across All Screens)
- **Glassmorphism / Elevated Cards:** Surface elevation, subtle shadows, border highlights.
- **Zero Layout Shifts:** Privacy mask (`••••••`) locks container width so icons/badges never jump.
- **Ascender Padding & Font Fitting:** Large numeric headers use `lineHeight`, `includeFontPadding: false`, `adjustsFontSizeToFit`, `minimumFontScale`.
- **In-Place Floating Popovers:** Toolbar dropdowns positioned at `top: 46, right: 0` with `elevation: 25`, universal click-outside dismissal, background scroll lock.
- **Safe Area Bottom Insets:** `paddingBottom: 36` on modals/sheets to clear Android gesture bar.
- **Haptic Feedback:** Light impact on every interactive control (toggles, pills, cards, FABs).

---

## 2. Core Feature Matrix (What to Highlight on Website)

| Feature Category | Key Capabilities | Implementation Status |
|------------------|------------------|----------------------|
| **Expense & Income Tracking** | Bi-directional cash flow, multi-currency, receipt capture, categories | ✅ Complete |
| **Multi-Account & Bank Management** | Cash, Bank, Credit Card, Wallet, Savings, Investment; live balance aggregation | ✅ Complete |
| **Smart Budgeting** | Overall monthly ceiling + per-category caps; daily burn velocity; pacing forecast | ✅ Complete |
| **Financial Analytics Hub** | 4 KPI cards, Financial Health Score (0-100), trend charts, behavioral insights | ✅ Complete |
| **Bullion Market Benchmark** | Nepal (FENEGOSIDA) & India (IBJA) official daily fixings; unit converters; calculator | ✅ Complete |
| **Recurring Bills & Subscriptions** | Daily/Weekly/Monthly/Yearly; next-due engine; pause/resume; local push notifications | ✅ Complete |
| **Export & Reports** | PDF (branded letterhead), Excel (multi-sheet), CSV; native share sheet | ✅ Complete |
| **Biometric App Lock** | Face ID / Touch ID / Android Biometric Prompt via `expo-local-authentication` | ✅ Complete |
| **Offline-First Sync** | AsyncStorage mutation queue, auto-replay on reconnect, `is_synced` flag | ✅ Complete |
| **Internationalization** | English, Hindi, Nepali — fully synced in `constants/i18n/` | ✅ Complete |
| **Privacy Mode** | Global amount masking with locked-width containers | ✅ Complete |

### Financial History Principles

- **Historical transaction invariant:** Once a transaction is saved, its original amount, currency, date, and exchange-rate snapshot are immutable. Historical reporting never revalues a transaction using today’s FX rate or inflation.
- **Multi-country support:** Users may create transactions in any supported currency over time. Mixed-currency totals convert each transaction using that transaction’s own historical snapshot.
- **No automatic inflation adjustment:** Any current-value view must be explicit and optional; it must never replace historical reporting.

---

## 3. Screen-by-Screen Walkthrough (For Feature Pages / Screenshots)

### 3.1 Home / Dashboard (`app/(tabs)/index.tsx`)
- Time-aware greeting ("Good Morning/Afternoon/Evening, Name")
- Live date indicator + PrivacyEyeButton + ProfileQuickCard (avatar + stats)
- Offline Sync Queue Banner (pending writes count + sync trigger)
- **Overall Budget Hero Card** — Progress bar with dynamic thresholds (Green <80%, Amber 80-100%, Crimson >100%)
- **Stock Trend Wave Chart** — Multi-point Bézier curve, touch tooltips, comparative growth %
- **Category Donut Breakdown** — Vector donut, vibrant palette, tap-to-filter
- **Recent Transactions (3)** — Categorized icons, date/time, payment method, formatted currency, tap → bottom sheet detail
- Pull-to-refresh (simultaneous balances, rates, profile)

### 3.2 Transaction History (`app/(tabs)/history.tsx`)
- **Vault & Cash Flow Card** — 3-way switcher: All Flow / Expenses (-) / Income (+); badges `[🧾 X entries] [✨ Peak: Amount]`
- **Search Bar** — Debounced, queries description/notes/merchant
- **3-Icon In-Place Popover Toolbar:**
  - 📅 Timeframe (Today, This Week, This Month, Custom 📅)
  - 🏷️ Category (dynamic filter chips with ✕ dismiss)
  - ⇅ Sort (Date Desc/Asc, Amount High/Low, Category A-Z)
- **CalendarModal** — Custom date range, safe bottom inset, nested scroll
- **Paginated SectionList** — Grouped by date with sticky headers
- Export button in app bar

### 3.3 Multi-Account Studio (`app/accounts.tsx`)
- Net Liquid Worth hero card (privacy-masked total across all accounts)
- Account cards: icon, name, type badge (Cash/Bank/Card/Wallet/Savings/Investment), last-4, live balance (green/red), initial balance
- **AccountManageModal** — Add/Edit/Archive, custom icon + color picker, starting balance, default toggle
- Real-time balance recomputation from all transactions

### 3.4 Live Bullion Benchmark (`app/bullion.tsx`) — **UNIQUE DIFFERENTIATOR**
#### Nepal (FENEGOSIDA Alignment)
| Metal | Purity | Multiplier | Session Fix |
|-------|--------|------------|-------------|
| Fine Gold | 24K / Chhapawal | `1.20649×` | 10:30 AM NPT (Sun–Fri) |
| Tejabi Gold | 22K | `92.5588%` of Fine | Same session |
| Silver | 999 (चाँदी) | `1.22765×` | Same session |
- Saturday holds Friday fix (market closed)

#### India (IBJA Alignment)
| Metal | Purity | Multiplier | Session Fix |
|-------|--------|------------|-------------|
| Gold | 24K | `1.0918×` (6% Duty + 3% GST) | AM: 12:00 PM IST, PM: 4:30 PM IST (Mon–Fri) |
| Gold | 22K (916) | `91.67%` | Same sessions |
| Silver | 999 | `1.0918×` | Same sessions |
- Weekends hold Friday PM fix

#### UI Features
- **Country Switcher** — 🇳🇵 Nepal (NPR) / 🇮🇳 India (INR) pills
- **2×2 Benchmark Grid** — Gold 1 Tola, Silver 1 Tola, Gold 10g, Silver 10g (tap to sync chart)
- **Real Day-over-Day Change** — Computed from stored official history (no fake deltas)
- **Synchronized Interactive SVG Chart** — Bézier spline, gradient fill, Y-axis labels, X-axis dates, touch callout with full date
- **Time Filter Pills** — 1M / 3M / 6M / 1Y
- **Instant Metal Valuation Calculator** — 24K / 22K / Silver picker, gram input, live estimated value
- **Bullion Standards Guide** — 24K vs 22K, Tola conversions, purity explanations

### 3.5 Analytics & Financial Intelligence (`app/(tabs)/analytics.tsx`)
#### Sub-Tabs (Dual In-Place Dropdowns)
1. **Overview** — Executive KPIs + Health Score
2. **Categories** — Donut breakdown + Budget Progress + Payment Method bars
3. **Habits & Forecast** — Day-of-Week rhythm + Time-of-Day chronotypes + Pacing forecast
4. **All Insights** — Stacked view of all sections

#### 4-Tile Executive KPI Cards (Tap for Calculation Explainer Modal)
1. **Total Spent** — Sum + transaction count
2. **Daily Velocity** — Avg spend/day in window
3. **Peak Single Expense** — Largest purchase with category icon & description
4. **Average Ticket** — Avg transaction size

#### Financial Health Score Card (0–100)
- Composite: Budget adherence + Spending volatility + Category balance + Weekend surge index
- Circular progress ring, Grade badge (A+/A/B+/C), Actionable smart tips

#### Category Breakdown (Flippable Donut Card)
- Front: Expense categories → flip → Payment Methods → flip → Income streams
- Tap category → inline drawer with filtered transactions

#### Budget Progress Bars
- Per-category allocated vs spent, over-allocation alerts

#### Payment Method Breakdown
- Progress bars: Cash 💵, Card 💳, UPI 📱, Other 🪙

#### Behavioral Insights (`FinancialInsights.tsx`)
- **Day-of-Week Rhythm** — 7 vertical pillar bars (Mon–Sun), week navigator (◀ ▶), peak day badge
- **Time-of-Day Chronotypes** — 4 quadrants: Morning (6AM–12PM) 🌅, Afternoon (12PM–5PM) ☀️, Evening (5PM–9PM) 🌇, Night (9PM–6AM) 🌙
- **Flow Flipper** — Toggle Expense ↔ Income patterns

#### Budget Analytics Card
- Projected month-end spend based on current velocity
- Early warning alerts (High pace / On track / Exceeded)

### 3.6 Recurring Bills & Subscriptions (`app/(tabs)/recurring.tsx`)
- **Monthly Commitments Hero** — Total across active rules, privacy-masked
- **Unified Grouped List** — Each row: icon, title, subtitle (freq + next due), amount, dashed status pill (ACTIVE/PAUSED), tap → detail modal
- **Detail Modal** — Amount banner, status toggle (Pause/Resume), frequency, next due, payment channel, Edit/Delete actions
- **Add/Edit Form Modal** —
  - Hero amount input (currency prefix, clear ✕)
  - Description, Category select
  - **Frequency Pills** — Daily / Weekly / Monthly (equal-width `flex:1`)
  - **Next Due Date** — CalendarModal + Quick presets (Today, Tomorrow, 1st Next Month, 15th)
  - **Payment Channel Pills** — Cash / Card / UPI / Other (equal-width)
  - Side-by-side Delete + Save (edit) or full-width Save (create)
- **Quick Add Templates** — House Rent, Wi-Fi, Netflix (pre-filled)
- **Local Push Notifications** — Scheduled via `expo-notifications` before due date

### 3.7 Category Budget Studio (`components/expense/CategoryBudgetFormModal.tsx`)
- **50/50 Two-Column Symmetrical Grid**
  - Line 1: Icon + Category Name
  - Line 2: Allocated Amount/mo + Delete square button
- **Live Allocation Math** — Total allocated vs ceiling, over-allocation alert
- **Custom Category Creator** — Emoji icon picker + hex color picker

### 3.8 Transaction Entry (`components/expense/ExpenseForm.tsx`)
- **Massive Numeric Input** — Auto-focus, inline clear ✕
- **Quick Increment Chips** — +100, +500, +1,000, +5,000
- **Multi-Currency Selector** — NPR/INR/USD/EUR/GBP with live rate conversion
- **Interactive Category Grid** — 9 default cards with custom icons/colors
- **Date & Time Selectors** — Calendar modal + 12-hour AM/PM TimePickerModal
- **Payment Channel** — Cash / Card / UPI / Other
- **Camera & Receipt Upload** — Snap/pick, auto-compress, Supabase Storage upload, tap-to-zoom ImageViewerModal
- **Validation** — Zod + react-hook-form

### 3.9 Export Center (`app/export.tsx`)
- **Period Selector Pills** — Today / Week / Month / Year / All Time
- **Statement Preview Card** — Total, transaction count, currency
- **Export Buttons:**
  - **PDF Statement** (Primary) — Branded letterhead, KPI cards, category tables, transaction log, signature section
  - **Excel (.xlsx)** — Multi-sheet workbook, formatted headers, auto-fit columns, currency cells
  - **CSV** — RFC-4180 compliant for tax software
- **Import CSV** — Restore from backup via `expo-document-picker`

### 3.10 Settings & Security (`app/(tabs)/settings.tsx`)
- **Profile Hub** — Display name, email, avatar, stats
- **Monthly Budget Ceiling** — Inline editor with instant validation
- **Budget Cycle** — Month starts on (1st–28th for salary cycles), Month ends on (last day or fixed)
- **Base Currency** — Change default with historical rate normalization
- **Theme** — Light / Dark / System
- **Language** — EN / HI / NE
- **Data Management** — Export CSV/Excel, Load Demo Data
- **Biometric App Lock** — Face ID / Fingerprint / Screen Lock
- **Account Actions** — Sign Out, Delete Account (GDPR-compliant)

### 3.11 Onboarding (`app/onboarding.tsx`)
- Animated pulsing seal logo
- Language selector (EN/HI/NE pills)
- 3 Feature cards: Cloud-Saved Tracking, Smart Budget Targets, Visual Spending Insights
- CTA → Get Started → Auth or Main Tabs

---

## 4. Technical Architecture (For Developer / Technical Pages)

### 4.1 Stack
| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Expo (Managed) | SDK 54.0.37 |
| Runtime | React Native | 0.81.5 |
| UI Runtime | React | 19.1.0 |
| Router | Expo Router | v6 (file-based typed routing) |
| Database & Auth | Supabase (PostgreSQL + Auth + Storage) | v2.47.10 |
| Language | TypeScript | 5.9 |
| Styling | Theme Token System (no external UI lib) | Custom |
| Charts | `react-native-svg` (hand-coded SVG) | 15.12.1 |
| Forms | React Hook Form + Zod | 7.54.2 / 3.24.1 |
| Notifications | expo-notifications | 0.32.17 |
| Biometrics | expo-local-authentication | 17.0.9 |
| Image Picker | expo-image-picker | 17.0.11 |
| Print/Export | expo-print, write-excel-file, expo-sharing | 15.0.8 / 1.4.30 / 14.0.8 |
| Icons | lucide-react-native | 1.39.0 |
| Date Utils | date-fns | 4.1.0 |
| Network | @react-native-community/netinfo | 11.4.1 |
| Storage | @react-native-async-storage/async-storage | 2.2.0 |

### 4.2 Database Schema (Supabase PostgreSQL)

#### `profiles` (extends `auth.users`)
```sql
id UUID PK REFERENCES auth.users
display_name TEXT
email TEXT
preferred_currency TEXT DEFAULT 'NPR'
monthly_budget NUMERIC(12,2)
cycle_start_day INT DEFAULT 1        -- 1–28 for salary cycles
cycle_end_day INT DEFAULT NULL       -- null = last day of month
theme_preference TEXT DEFAULT 'system' CHECK IN ('light','dark','system')
created_at, updated_at TIMESTAMPTZ
```

#### `categories`
```sql
id UUID PK
user_id UUID FK → profiles
name TEXT, icon TEXT, color TEXT (hex)
type TEXT CHECK IN ('expense','income')  -- NEW in v2
budget_monthly NUMERIC(12,2)
is_custom BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ
UNIQUE (user_id, name)
```

#### `expenses`
```sql
id UUID PK
user_id UUID FK → profiles
category_id UUID FK → categories (SET NULL)
amount NUMERIC(12,2) CHECK > 0
currency TEXT DEFAULT 'NPR'
type TEXT CHECK IN ('expense','income')  -- NEW in v2
date DATE, time TIME
payment_method TEXT CHECK IN ('Cash','Card','UPI','Other')
description, notes TEXT
receipt_image_url TEXT (Supabase Storage)
bank_account_id UUID FK → bank_accounts (SET NULL)  -- NEW in v2
is_recurring BOOLEAN DEFAULT FALSE
recurring_rule_id UUID FK → recurring_rules (SET NULL)
is_synced BOOLEAN DEFAULT TRUE      -- Offline queue flag
deleted_at TIMESTAMPTZ              -- Soft delete
created_at, updated_at TIMESTAMPTZ
```

#### `recurring_rules`
```sql
id UUID PK
user_id UUID FK → profiles
category_id UUID FK → categories
title TEXT, amount NUMERIC(12,2), currency TEXT
description TEXT
frequency TEXT CHECK IN ('Daily','Weekly','Monthly','Yearly')
payment_channel TEXT CHECK IN ('Cash','Card','UPI','Other')
next_due_date DATE
is_active BOOLEAN DEFAULT TRUE
auto_log BOOLEAN DEFAULT FALSE
bank_account_id UUID FK → bank_accounts (SET NULL)  -- NEW in v2
created_at, updated_at TIMESTAMPTZ
```

#### `bank_accounts` (NEW in v2)
```sql
id UUID PK
user_id UUID FK → auth.users
name TEXT
account_type TEXT CHECK IN ('bank','wallet','cash','credit_card','savings','investment','other')
currency TEXT DEFAULT 'NPR'
initial_balance NUMERIC(14,2) DEFAULT 0
current_balance NUMERIC(14,2) DEFAULT 0  -- Denormalized cache
color TEXT DEFAULT '#10B981'
icon TEXT DEFAULT '🏦'
account_number_last4 TEXT
is_default BOOLEAN DEFAULT FALSE
deleted_at TIMESTAMPTZ
created_at, updated_at TIMESTAMPTZ
```

#### `market_gold_rates` (Bullion — Server-Populated)
```sql
id UUID PK
rate_date DATE (Asia/Kathmandu market date)
country_code TEXT (NP / IN)
currency_code TEXT (NPR / INR)
fine_gold_per_tola NUMERIC
fine_gold_per_10g NUMERIC
tejabi_gold_per_tola NUMERIC
tejabi_gold_per_10g NUMERIC
silver_per_tola NUMERIC
silver_per_10g NUMERIC
source, source_url, fetch_source, market_authority TEXT
fetched_at, published_at TIMESTAMPTZ
status TEXT (verified/stale)
-- One row per market day per country; never scraped on-device
```

### 4.3 Security & Offline Engine
- **Row Level Security (RLS)** — Every table: `auth.uid() = user_id`
- **JWT Sessions** — Stored in AsyncStorage (avoids Android Keystore 2048-byte truncation)
- **Offline Mutation Queue** — `utils/offlineQueue.ts`: writes to AsyncStorage with `is_synced: false`, auto-replays on reconnect via NetInfo
- **Biometric Guard** — Modal overlay blocks all screens until successful auth
- **Notification Persistence** — Budget/category/recurring/large-expense notifications saved to `notifications` table

### 4.4 Notification System (`services/notifications.ts`)
| Trigger | Thresholds | Behavior |
|---------|------------|----------|
| **Overall Budget** | 25%, 50%, 75%, 90%, 98%, 100%+ | Single highest bracket fires; all lower brackets marked sent (no backfill) |
| **Category Budget** | 90%, 100% | Per-category, per-month deduplication |
| **Recurring Bill Due** | On due date | Immediate local notification |
| **Large Expense** | Currency-specific (NPR/INR: 5000, USD: 100, etc.) | Instant confirmation |
| **Expense Added** | Every transaction | Instant confirmation with category/note |

---

## 5. Bullion Engine Deep-Dive (For Technical / Feature Page)

### 5.1 Rate Computation Pipeline
```
1. fetchLiveBullionRates() → Gold-API.com (XAU/XAG USD/oz) → cached in AsyncStorage
2. getMarketSessionInfo(currency) → Determines session key & fixing label
   - NPR: 10:30 AM NPT (Sun–Fri), Sat closed (holds Fri)
   - INR: AM Fix 12:00 PM IST, PM Fix 4:30 PM IST (Mon–Fri), weekends closed (holds Fri PM)
3. fetchMarketFixedBullionRates() → Locks rate per session key for the day
4. computeBullionPrices() → Applies regional multipliers & official rounding:
   - NPR Gold: round to nearest 500/tola; Silver: nearest 5/tola
   - INR Gold: round to whole ₹/10g; Silver: whole ₹/1kg
5. applyOfficialNepalRates() → Overlays server-stored FENEGOSIDA official rate (source of truth)
6. generateBullionHistoricalTrend() → Simulated macro drift + sinusoidal waves (API has no free historical)
```

### 5.2 Official Nepal Rate Source
- **Never scraped on-device.** A server-side cron job writes ONE verified row per Nepal market day to `market_gold_rates`.
- App reads via `getOfficialNepalRate()` (cache-first → Supabase → cache fallback).
- History for charts via `getOfficialNepalHistory()` (real stored days only; gaps = Saturdays/failed fetches absent).

### 5.3 Unit Converters
| Unit | Grams |
|------|-------|
| 1 Tola | 11.6638 |
| 10 Grams | 10 |
| 1 Gram | 1 |
| 1 Troy Ounce | 31.1035 |
| 1 Kilogram | 1000 |

---

## 6. Internationalization (i18n) — 3 Languages Fully Synced

| Locale | Code | Native Name | Coverage |
|--------|------|-------------|----------|
| English | `en` | English | 100% |
| Hindi | `hi` | हिन्दी | 100% |
| Nepali | `ne` | नेपाली | 100% |

**Keys:** 328+ translation keys in `constants/i18n/{en,hi,ne}.ts` covering:
- Tab bar, splash, home, history, analytics, recurring, settings, export, auth, onboarding
- Expense form, category budget, charts, financial health, insights
- Bullion market, calculator, guide
- Common actions, errors, validation

---

## 7. Recent Changes & Version 2.0 Highlights (For Changelog / What's New)

### v2.0.0 (Current) — Major Architecture Upgrade
| Area | Change |
|------|--------|
| **Income & Cash Flow** | Added `type: 'expense' | 'income'` to categories & expenses; Vault card shows Inflow/Outflow/Net |
| **Multi-Account** | New `bank_accounts` table; 7 account types; live balance aggregation |
| **Bullion Engine** | Dual-country (Nepal FENEGOSIDA + India IBJA); official daily fixings; unit converter; calculator |
| **Analytics Hub** | Financial Health Score (0-100), Behavioral Insights (Day/Time), Pacing Forecast |
| **Recurring v2** | Pause/Resume, Quick presets, local notifications, unified grouped list |
| **Export Center** | PDF/Excel/CSV with period selector; CSV import/restore |
| **Budget Cycle** | Custom month start (1–28) + end day for salary alignment |
| **Privacy Mode** | Zero-layout-shift masking across all screens |
| **i18n** | Added Hindi & Nepali (was English-only) |
| **Theme** | Refined Dark/Light tokens; glassmorphism; haptics everywhere |

### Recent Commits (from git log)
- `ffa16ad` — Notification issue fixed
- `4679ffd` — Fix: align Expo project owner
- `983f55a` — Fix: connect deployment to Firebase secret environment
- `6ae56ea` — Fix: resolve React 19 dependency install conflict
- `8880097` — Security: remove Firebase config from source control

---

## 8. Website Content Requirements (Page-by-Page)

### 8.1 Landing Page (Hero + Value Props)
```
HERO:
  Headline: "See Where Your Money Flows"
  Subheadline: "Financial telemetry for the modern earner. Track expenses, income, budgets, and live gold/silver prices — all offline-first, biometric-secure, and multi-currency."
  CTA: "Download for Android" (Play Store badge) + "View Source on GitHub"
  Seal: Animated SpendFlowSealLogo

VALUE PROPS (3–4 columns):
  1. "Bi-Directional Cash Flow" — Expenses + Income, net flow, peak spending
  2. "Live Bullion Benchmark" — Only app with FENEGOSIDA (Nepal) & IBJA (India) official daily fixings
  3. "Financial Health Score" — 0–100 algorithmic grade with actionable tips
  4. "Offline-First & Private" — Local encryption, biometric lock, zero tracking
```

### 8.2 Feature Pages (One per Major Feature)
| Page | Must Include |
|------|--------------|
| **Expense Tracking** | Form screenshots, multi-currency, receipt capture, categories, quick chips |
| **Income & Cash Flow** | Vault card, inflow/outflow badges, 3-way switcher, net savings |
| **Multi-Account** | Account cards, net worth hero, add/edit modal, type badges |
| **Smart Budgeting** | Overall ceiling, category caps, daily velocity, pacing forecast, health score |
| **Analytics** | 4 KPI cards, donut flipper, day-of-week bars, time-of-day quadrants, week navigator |
| **Bullion Prices** | Country switcher, 2×2 grid, interactive chart, calculator, standards guide |
| **Recurring Bills** | Monthly commitments hero, grouped list, detail modal, form with presets |
| **Export & Reports** | Period pills, preview card, PDF/Excel/CSV buttons, import CSV |
| **Security & Privacy** | Biometric lock, offline sync, RLS, privacy mode, GDPR delete |
| **Internationalization** | Language selector, RTL-ready (future), 3 locales |

### 8.3 Technical / Developer Page
- Stack table, database schema diagram, RLS policies, offline queue architecture
- Bullion computation pipeline diagram
- Notification threshold logic
- Build commands (local APK, EAS, OTA)

### 8.4 Changelog Page
- Reverse chronological (v2.0.0 at top)
- Group by: Added, Changed, Fixed, Security
- Link to GitHub releases

### 8.5 Download / Install Page
- Play Store badge (production)
- EAS Preview APK badge (internal testing)
- Direct APK download link (GitHub Releases)
- System requirements: Android 8.0+ (API 26), 150MB storage
- Build-from-source instructions (link to BUILD.md)

---

## 9. Assets Needed for Website

| Asset | Source | Notes |
|-------|--------|-------|
| **App Icon** | `android/app/src/main/res/mipmap-*/ic_launcher.webp` | Adaptive, transparent background |
| **Notification Icon** | `android/app/src/main/res/drawable-*/notification_icon.png` | Pure white `#FFFFFF` silhouette on transparent |
| **Splash Screen** | `assets/splash.png` | 1284×2778 (iOS), 1242×2436 (Android) |
| **Feature Screenshots** | Capture from device/emulator | 1080×2400 (portrait), all 7 main tabs + modals |
| **Bullion Chart Demo** | Record screen of bullion.tsx | Show country switch, chart sync, calculator |
| **Logo Variants** | `SpendFlowSealLogo` component | Export SVG/PNG at 512, 1024, 2048 |
| **PDF Sample** | Generate via `exportPdf()` | Downloadable sample statement |
| **Excel Sample** | Generate via `exportExcel()` | Downloadable .xlsx |

---

## 10. SEO & Metadata

| Property | Value |
|----------|-------|
| **Title** | SpendFlow — Financial Telemetry & Expense Intelligence |
| **Description** | Track expenses, income, budgets, and live gold/silver prices. Offline-first, biometric-secure, multi-currency. Nepal & India bullion benchmarks. |
| **Keywords** | expense tracker, budget app, income tracker, gold price Nepal, silver price India, FENEGOSIDA, IBJA, financial health, offline finance app |
| **OG Image** | `/og-image.png` (1200×630) — Seal + "See Where Your Money Flows" |
| **Twitter Card** | `summary_large_image` |
| **Theme Color** | `#0F5C4D` (light) / `#818CF8` (dark) |

---

## 11. Compliance & Legal Footer Links

- **Privacy Policy** — Local-first, no analytics, Supabase auth only, GDPR delete endpoint
- **Terms of Service** — Standard EULA
- **Open Source** — GitHub: `mdsamimrrza/SpendFlow` (MIT License)
- **Security** — `security@spendflow.app` (or GitHub Security Advisories)
- **Contact** — `support@spendflow.app`

---

## 12. Maintenance Checklist (When Codebase Changes)

| Trigger | Website Update Required |
|---------|------------------------|
| New screen added | Add to Feature Pages + Landing value props |
| Theme token changed | Update Color Palette table + screenshots |
| Bullion multiplier adjusted | Update Bullion Engine Deep-Dive + Feature page |
| New language added | Update i18n table + Language selector screenshot |
| Database migration | Update Schema section + ER diagram |
| Notification threshold changed | Update Notification System table |
| Export format changed | Update Export Center screenshots + sample files |
| Version bump | Update Changelog + Download page version badge |

---

## 13. Quick Reference: File-to-Feature Map

| Feature | Primary Files |
|---------|---------------|
| Home Dashboard | `app/(tabs)/index.tsx` |
| History & Filters | `app/(tabs)/history.tsx`, `components/ui/CalendarModal.tsx` |
| Multi-Account | `app/accounts.tsx`, `components/account/AccountManageModal.tsx` |
| Bullion | `app/bullion.tsx`, `services/bullion.ts`, `services/nepalGold.ts`, `hooks/useBullionRates.ts` |
| Analytics | `app/(tabs)/analytics.tsx`, `components/expense/*.tsx` |
| Recurring | `app/(tabs)/recurring.tsx`, `services/notifications.ts` |
| Category Budget | `components/expense/CategoryBudgetFormModal.tsx` |
| Expense Form | `components/expense/ExpenseForm.tsx`, `components/ui/TimePickerModal.tsx` |
| Export/Import | `app/export.tsx`, `services/export.ts` |
| Settings/Security | `app/(tabs)/settings.tsx`, `hooks/useSecurity.ts` |
| Onboarding | `app/onboarding.tsx`, `store/OnboardingContext.tsx` |
| Auth | `app/(auth)/*.tsx`, `services/auth.ts`, `utils/supabase.ts` |
| Theme System | `constants/theme.ts`, `hooks/useTheme.tsx` |
| i18n | `constants/i18n/{en,hi,ne}.ts`, `hooks/useLanguage.ts` |
| Offline Queue | `utils/offlineQueue.ts`, `hooks/useSync.ts` |
| Database | `supabase/migrations/*.sql` |

---

**End of Specification** — This document should be the authoritative reference for all website content, marketing materials, and documentation. Update it whenever the codebase changes.
