# 🌊 SpendFlow — Financial Telemetry & Expense Intelligence App

> **Version**: 2.0.0  
> **Framework**: Expo SDK 54 / React Native 0.81 (Fabric / New Architecture Ready)  
> **Router**: Expo Router v6 (File-based typed routing)  
> **Database & Auth**: Supabase PostgreSQL + Auth (RLS Enabled) + Supabase Storage  
> **Language**: TypeScript 5.9  
> **Styling System**: Theme Token System (Glassmorphism, High-contrast Dark/Light, Haptic Feedback)

---

## 📌 Executive Summary & Architecture Overview

SpendFlow is an offline-first personal financial telemetry and expense tracking application. It is engineered with robust real-time multi-currency exchange conversion, interactive vector SVG charts, biometric security (Face ID / Fingerprint), automated recurring billing rules with local OS notifications, multi-format financial statement export (PDF, Excel XLSX, CSV), and multi-lingual support (English, Nepali, Hindi)

```
SpendFlow/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Custom Bottom Tab Bar with Icons & Dynamic Badges
│   │   ├── index.tsx            # Dashboard / Home Screen
│   │   ├── history.tsx          # Paginated Transaction History, Cash Flow Vault & 3-Icon Popover Toolbar
│   │   ├── analytics.tsx        # Financial Intelligence & Behavioral Insights Hub
│   │   ├── recurring.tsx        # Recurring Bills & Subscription Lifecycle Studio
│   │   └── settings.tsx         # User Profile, Biometrics, Currency, Language & Budget Ceiling
│   ├── accounts.tsx             # Multi-Account & Bank Management Studio (Cash, Bank, Cards, UPI, Wallets)
│   ├── bullion.tsx              # Live Bullion Benchmark Engine (Gold 24K/22K, Silver, Nepal & India Fixings)
│   ├── categories.tsx           # Category & Flow Type Manager (Expense / Income / Both)
│   ├── expense/
│   │   ├── add.tsx              # Add Transaction Screen (Expense / Income Switcher)
│   │   └── [id].tsx             # Edit Transaction Screen
│   ├── export.tsx               # Financial Statement Generator (PDF / XLSX / CSV)
│   ├── _layout.tsx              # Root Layout, Auth State Router & Theme Provider
│   ├── sign-in.tsx              # Auth SignIn with Email & Google OAuth
│   ├── sign-up.tsx              # Auth SignUp with Validation
│   └── forgot-password.tsx      # Supabase Password Reset Flow
├── components/
│   ├── account/
│   │   ├── AccountCard.tsx               # Bank / Wallet Account Card with Live Balance
│   │   └── AccountManageModal.tsx        # Add / Edit Bank Account & Wallet Modal
│   ├── expense/
│   │   ├── BudgetAnalyticsCard.tsx       # Burn Velocity & Forecast Pacing Card
│   │   ├── BudgetLimitHeroCard.tsx       # Overall Budget Progress Hero Banner
│   │   ├── BudgetProgress.tsx            # Category Limit Allocation Tracker
│   │   ├── CategoryBudgetFormModal.tsx   # 50% 2-Column Category Limit Manager
│   │   ├── Charts.tsx                    # Donut Breakdown Graph & Bottom Sheet Expense Detail Modal
│   │   ├── ExpenseForm.tsx               # Interactive Transaction Entry (Expense & Income)
│   │   ├── ExpenseItem.tsx               # Reusable Swipeable / Pressable Expense Row
│   │   ├── FinancialHealthScoreCard.tsx  # 0–100 Financial Health Grade Diagnostic
│   │   ├── FinancialInsights.tsx         # Day-of-Week Rhythm & Time-of-Day Chronotypes
│   │   └── StockTrendChart.tsx           # Multi-Period Bézier Wave Chart (Today, 7D, 4W, 6M, 1Y)
│   └── ui/
│       ├── Avatar.tsx, Button.tsx, Card.tsx, Input.tsx, Skeleton.tsx, Text.tsx, ThemeToggle.tsx
│       ├── BottomSheet.tsx, CalendarModal.tsx, CategoryIcon.tsx, TimePickerModal.tsx, ImageViewerModal.tsx
│       ├── PressableScale.tsx, PrivacyEyeButton.tsx, ProfileQuickCard.tsx, Select.tsx
├── constants/
│   ├── app.ts, categories.ts, theme.ts
│   └── i18n/ (en.ts, hi.ts, ne.ts)
├── hooks/
│   ├── useAuth.ts, useExchangeRates.ts, useExpenses.ts, useLanguage.ts, usePrivacy.ts, useSecurity.ts, useSync.ts, useTheme.ts
├── services/
│   ├── accounts.ts, auth.ts, bullion.ts, categories.ts, exchange.ts, expenses.ts, export.ts, notifications.ts, recurring.ts, storage.ts
├── supabase/
│   └── migrations/
│       ├── 20260823170000_initial_spendflow_schema.sql
│       ├── 20260828010000_add_type_to_categories_and_expenses.sql
│       └── 20260828020000_create_bank_accounts.sql
├── app.json, eas.json, package.json, tsconfig.json
```

---

## 🎯 Screen-by-Screen Feature & Requirements Specification

### 1. 🏠 Home Screen (`app/(tabs)/index.tsx`)
- **Header & Greeting**: Time-aware personalized greeting (`Good Morning / Afternoon / Evening, <Name>`), live date indicator, privacy mask toggle (`PrivacyEyeButton`), and interactive profile avatar quick-card.
- **Offline Sync Queue Banner**: Live detection of pending offline writes with instant cloud sync badge.
- **Overall Budget Limit Hero**: Visual progress bar showing total monthly spending vs set ceiling with dynamic color thresholds (Green `< 80%`, Amber `80–100%`, Crimson `> 100%`).
- **Stock Trend Wave Chart**: Multi-point smooth Bézier curve of spending trajectory with touch-to-inspect tooltips and comparative growth percentage.
- **Category Donut Breakdown**: Sliced vector donut chart with vibrant multi-spectrum category colors, legend, and tap-to-filter interaction.
- **Recent Transactions List**: Quick preview of the latest 3 transactions with categorized icons, date/time, payment method, formatted currency, and tap-to-view bottom sheet details.
- **Pull-To-Refresh**: Native `RefreshControl` updating live balances, rates, and profiles simultaneously.

### 2. 📜 Transaction History & Filtering (`app/(tabs)/history.tsx`)
- **Consolidated Vault & Cash Flow Card**:
  - **Live Totals**: Dynamically displays Total Outflow, Total Inflow, or Net Cash Flow in primary currency.
  - **Badges**: `[ 🧾 X entries ]` and `[ ✨ Peak: <Amount> ]`.
  - **3-Way Flow Switcher**: In-card segmented selector toggling `All Flow`, `Expenses (-)`, and `Income (+)`.
- **Search & In-Place Popover Toolbar**:
  - `[ 🔍 Search... ]` instant debounced search bar querying description, notes, and merchant names.
  - `[ 📅 Timeframe ]` in-place floating popover (`Today`, `This Week`, `This Month`, `Custom 📅`).
  - `[ 🏷️ Category ]` in-place floating popover displaying user categories with active dynamic filter chip (`[ 💼 Salary ✕ ]`).
  - `[ ⇅ Sort ]` in-place floating popover ordering by Date Desc/Asc, Amount High/Low, Category A-Z.
  - **Universal Click-Outside Dismissal**: Tapping anywhere on the screen dismisses popovers cleanly.
- **Custom Date Range Picker (`CalendarModal.tsx`)**: Safe Area bottom inset padding (`paddingBottom: 36`) and `ScrollView` wrapper ensuring action buttons are never obscured by the Android gesture bar.
- **Paginated SectionList**: Grouped by date (`Today`, `Yesterday`, `Weekday, Month Day, Year`) with sticky date headers and page-switch navigation.
- **Enlarged Export Button**: Top app-bar shortcut opening the statement export modal.

### 3. 💳 Multi-Account & Bank Studio (`app/accounts.tsx`)
- **Multi-Bank Balance Tracking**: Manage multiple liquid accounts across `Cash`, `Bank Account`, `Credit Card`, `UPI`, `Savings`, and `Digital Wallet`.
- **Net Wealth Aggregation**: Real-time aggregation of total liquid net worth across all connected accounts.
- **Account Modal (`AccountManageModal.tsx`)**: Add, edit, archive, and assign custom icons and starting balances.

### 4. 🥇 Live Bullion Market Benchmark (`app/bullion.tsx`)
- **Dual Country Alignment**:
  - **Nepal (FENEGOSIDA)**: Fine Gold (24K / Chhapawal @ 1.20649x), Tejabi Gold (22K @ 92.5588%), Silver (@ 1.22765x). Fixed daily at 10:30 AM NPT.
  - **India (IBJA)**: Gold 24K & Silver (@ 1.0918x / 6% Duty + 3% GST), Gold 22K (916 @ 91.67%). AM Fix (12:00 PM IST) & PM Fix (4:30 PM IST).
- **Unit Converters**: Instant weight calculation across Tola (11.664g), 10 Grams, 1 Gram, Ounces, and Kilograms.

### 5. 📊 Analytics & Financial Intelligence (`app/(tabs)/analytics.tsx`)
- **Sub-Tabs Navigation**: `Overview` | `Categories` | `Habits & Forecast` | `All Insights`.
- **4-Tile Executive KPI Cards**:
  1. *Total Spent* (Sum & transaction count)
  2. *Daily Burn Velocity* (Average spend per day in the selected window)
  3. *Peak Single Expense* (Largest purchase with category icon & description)
  4. *Average Ticket Size* (Average transaction amount)
- **0–100 Financial Health Score Card (`FinancialHealthScoreCard.tsx`)**:
  - Computes composite health score based on budget adherence, spending volatility, category balance, and weekend surge index.
  - Displays circular progress ring, grade badge (`A+`, `A`, `B+`, `C`), and actionable smart tips.
- **Multi-Period Trend Wave Chart (`StockTrendChart.tsx`)**: Full dataset visualization supporting `Today` (4h slots), `Daily` (7 days), `Weekly` (4 weeks), `Monthly` (6 months), and `Yearly` (3 years).
- **Payment Method Breakdown**: Progress bar distribution across `Cash`, `Card`, `UPI`, and `Other`.
- **Behavioral Spending Rhythm (`FinancialInsights.tsx`)**:
  - *Day-of-Week Distribution*: Spending bar chart for Mon–Sun identifying peak spend days.
  - *Time-of-Day Chronotypes*: 4 quadrants (`Morning 6AM–12PM`, `Afternoon 12PM–5PM`, `Evening 5PM–9PM`, `Night 9PM–6AM`).
- **Pacing Forecast (`BudgetAnalyticsCard.tsx`)**: Projected end-of-month spend based on current velocity with early warning alerts.

---

### 4. 🔄 Recurring Bills & Subscriptions (`app/(tabs)/recurring.tsx`)
- **Rule Management**: Complete tracking of fixed subscriptions, utility bills, rent, and loan EMIs.
- **Supported Frequencies**: `Daily`, `Weekly`, `Monthly`, `Yearly`.
- **Next Due Date Engine**: Automatically calculates exact next billing cycle, days remaining, and overdue status.
- **Active / Paused Switch**: Instant 1-tap toggle to pause subscriptions without deleting history.
- **Bottom Sheet Modal for Add & Edit Rule**:
  - Equal full-width selection pills for Frequency & Payment Channel (`flex: 1`).
  - Next Due Date picker with quick presets (`Today`, `Tomorrow`, `1st of Next Month`, `15th`).
- **Local Push Notifications (`services/notifications.ts`)**: Automatically schedules reminder notifications before the bill is due using `expo-notifications`.

---

### 5. ➕ Transaction Entry & Receipt Capture (`components/expense/ExpenseForm.tsx`)
- **Massive Numeric Input**: Prominent currency display with auto-focus and 1-tap inline `✕` clear reset.
- **Quick Increment Chips**: Quick add presets (`+100`, `+500`, `+1,000`, `+5,000`).
- **Multi-Currency Selector**: Toggle between `NPR (Rs.)`, `INR (₹)`, `USD ($)`, `EUR (€)`, `GBP (£)` with live exchange rate conversion.
- **Interactive Category Grid**: 9 default categorized cards with custom icons and accent colors.
- **Date & Time Selectors**:
  - Date modal with calendar grid.
  - 12-hour AM/PM Time Picker modal (`TimePickerModal.tsx`).
- **Payment Channel Selector**: `Cash`, `Card`, `UPI`, `Other`.
- **Camera & Receipt Upload**:
  - Snap photo with camera or choose from gallery (`expo-image-picker`).
  - Automatic image compression and secure Supabase Storage bucket upload.
  - Interactive tap-to-zoom fullscreen viewer (`ImageViewerModal.tsx`).
- **Input Validation**: Schema validation using `zod` and `react-hook-form`.

---

### 6. 🍱 Category Budget Studio (`components/expense/CategoryBudgetFormModal.tsx`)
- **50% / 50% 2-Column Symmetrical Grid**:
  - Line 1: `Icon + Category Name`
  - Line 2: `Allocated Amount / mo` + `[ 🗑️ ]` delete square button.
- **Live Allocation Math**: Displays total allocated vs overall monthly ceiling with over-allocation alerts.
- **Custom Category Creator**: Built-in modal to create personalized categories with emoji icons and hex color pickers.

---

### 7. 📥 Financial Export Center (`app/export.tsx` & `services/export.ts`)
- **Branded PDF Statements (`expo-print`)**:
  - Generates print-ready vector PDF document with SpendFlow branding, user metadata, summary KPI cards, category breakdown tables, detailed transaction logs, and formal signature section.
- **Excel Spreadsheet (`write-excel-file`)**:
  - Generates `.xlsx` workbook with formatted headers, auto-fit columns, currency-formatted numeric cells, and timestamped metadata.
- **CSV Data Export**: Standard RFC-4180 compliant CSV export for importing into Excel, Google Sheets, or tax software.
- **Native Sharing (`expo-sharing`)**: Direct handoff to WhatsApp, AirDrop, Google Drive, Email, or Files.

---

### 8. ⚙️ Settings, Biometrics & Internationalization (`app/(tabs)/settings.tsx`)
- **Profile Hub**: User display name, email, avatar, and account statistics.
- **Target Monthly Budget**: Inline budget ceiling editor with instant validation and save feedback.
- **Base Currency Preference**: Change default application currency with automatic historical rate normalization.
- **Biometric App Lock (`expo-local-authentication`)**:
  - Requires Face ID, Touch ID, or Android Biometric Prompt upon app launch to unlock financial telemetry.
- **Internationalization (i18n)**:
  - English (`en`), Nepali (`ne`), Hindi (`hi`).
- **Account Actions**: Safe sign-out and GDPR-compliant complete account deletion (`deleteAccount`).

---

## 🗄️ Database Schema & Data Models (Supabase PostgreSQL)

### 1. `profiles`
```sql
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  preferred_currency TEXT DEFAULT 'NPR',
  monthly_budget NUMERIC(12,2) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. `categories`
```sql
CREATE TABLE public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  budget_monthly NUMERIC(12,2) DEFAULT NULL,
  is_custom BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. `expenses`
```sql
CREATE TABLE public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT DEFAULT 'NPR' NOT NULL,
  date DATE NOT NULL,
  time TIME DEFAULT NULL,
  payment_method TEXT DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Card', 'UPI', 'Other')),
  description TEXT,
  notes TEXT,
  receipt_image_url TEXT,
  is_synced BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);
```

### 4. `recurring_rules`
```sql
CREATE TABLE public.recurring_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT DEFAULT 'NPR' NOT NULL,
  frequency TEXT DEFAULT 'Monthly' CHECK (frequency IN ('Daily', 'Weekly', 'Monthly', 'Yearly')),
  payment_channel TEXT DEFAULT 'Card' CHECK (payment_channel IN ('Cash', 'Card', 'UPI', 'Other')),
  next_due_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  auto_log BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔒 Security & Offline Engine

1. **Row Level Security (RLS)**: Every table has strict RLS policies ensuring users can only read, insert, update, and delete their own rows (`auth.uid() = user_id`).
2. **Offline Mutation Queue**: When network is unavailable (`@react-native-community/netinfo`), transactions are written to `AsyncStorage` with `is_synced: false` and re-synchronized automatically upon reconnection.
3. **Biometric Guard**: If enabled, a modal security overlay protects all screens until successful biometric challenge completion.

---

## 🛠️ Build & Deployment Guide

> 📖 **Looking for a complete step-by-step local build walkthrough?**  
> Check out the **[Complete Local Build Guide (BUILD.md)](./BUILD.md)** for Android Studio setup, environment variables, Gradle APK compilation, and troubleshooting.

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Start Metro Development Server
npx expo start -c

# 3. Typecheck
npx tsc --noEmit

# 4. Build Local Android Release APK
cd android && .\gradlew.bat assembleRelease
```

### EAS Production Builds
```bash
# Build Standalone Android APK (Preview Profile)
npx eas build -p android --profile preview

# Build Production Android AAB (Google Play)
npx eas build -p android --profile production

# Publish Instant Over-The-Air Update (OTA)
npx eas update --branch production --message "Release update"
```

---

## 📄 License & Ownership
Copyright © 2026 Samim Reza. All rights reserved.  
Repository: [mdsamimrrza/SpendFlow](https://github.com/mdsamimrrza/SpendFlow)
