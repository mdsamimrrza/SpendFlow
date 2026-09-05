# Cross-Account Transfers with Live Currency Conversion

**Goal:** Move money from account X to account Y (e.g., an INR account → NPR/QAR/USD account) with automatic conversion at the current exchange rate. Transfer-out decreases the source balance, the converted amount increases the target balance. Transfers are a **dedicated concept** — they don't pollute spending analytics, budgets, or profit/loss (per your choice).

## How conversion works
Reuses the existing exchange pipeline (`services/exchange.ts`): for the transfer date (today by default) it resolves each currency's USD rate — pegged currencies (USD/QAR/AED/SAR) are exact, others come from the `exchange_rates` DB cache → exchangerate.host API → safe fallbacks. `rate = units of target per 1 source`, `converted_amount = round2(amount × rate)`, and **both the rate and converted amount are locked (snapshotted) on the transfer row** so balances stay historically accurate even when market rates change later.

## 1. Migration — `supabase/migrations/20260905020000_create_transfers.sql`
`transfers` table: `id`, `user_id` (FK users, cascade), `from_account_id` / `to_account_id` (FK bank_accounts, restrict — the existing hard-delete fallback to soft-delete handles account removal), `amount > 0`, `from_currency`, `to_currency`, `exchange_rate` (locked), `converted_amount`, `fee` (default 0, in source currency — useful for remittance corridors), `date`, `time`, `notes`, `deleted_at`, timestamps. Plus: `check (from_account_id <> to_account_id)`, RLS policies (own-rows only, mirroring existing tables), `set_updated_at` trigger, index on `(user_id, date)`.

## 2. Types — `types/index.ts`
`Transfer` (with embedded `from_account` / `to_account` name/icon/color/currency) and `TransferInput`.

## 3. Service — `services/transfers.ts`
`listTransfers(userId, onCached?)` (AsyncStorage cache-paint like bank accounts, joins account names), `createTransfer(userId, input)` (validates both accounts + from ≠ to, computes rate via `getRate()`, inserts), `deleteTransfer(id, userId)` (soft delete), and a module-level `notifyTransfersChanged()` pub/sub mirroring `useExpenses`.

## 4. Hook — `hooks/useTransfers.ts`
`useTransfers(userId)` → `{ transfers, loading, refresh, remove }`, subscribing to `notifyTransfersChanged()` so Accounts screen refreshes when a transfer is saved elsewhere.

## 5. Balance integration — `services/bankAccounts.ts`
`computeAccountBalances(accounts, expenses, transfers = [])`: source account `−(amount + fee)` (already in source currency), target account `+converted_amount` (already in target currency) — no extra conversion needed. Update the two callers (`app/accounts.tsx:107`, `components/expense/ExpenseForm.tsx:162`) to pass transfers so insufficient-balance guards reflect transfers too.

## 6. Transfer screen — `app/transfer.tsx` (registered in `app/_layout.tsx` as `presentation: 'modal'`)
- **From / To account pickers** — in-place dropdowns styled like ExpenseForm's account dropdown; each row shows name, type, currency badge and live balance; "To" excludes the chosen "From" account.
- **Amount entry** — big centered numeric input with source-currency pill (same pattern as ExpenseForm).
- **Conversion preview card** — debounced async `convert()` showing the received amount (≈ 160.00 NPR) and "1 INR = 1.6000 NPR · rate for <date>"; same-currency transfers show rate 1 with a "no conversion needed" note.
- **Optional fee + note** fields; inline validation (from ≠ to, amount > 0) and the **insufficient-balance guard** mirroring ExpenseForm (amount + fee vs live balance in the source account's currency).
- Save → `createTransfer` → `notifyTransfersChanged()` → success `showToast` with both amounts → haptic → back. All styling via `useTheme()`, text via `t()`.

## 7. Accounts screen — `app/accounts.tsx`
- New **transfer icon button** (lucide `ArrowLeftRight`) in the header next to "Add" → pushes `/transfer`.
- **"Recent Transfers"** section under the account list (last 5): "India Bank → Nepal Wallet · 100 INR → 160 NPR · 1.6000 · date", with delete via existing `ConfirmDialog`.

## 8. i18n — `constants/i18n/en.ts`, `hi.ts`, `ne.ts`
Add synchronized `transfer_*` keys to all three locales.

## 9. Verification
`npx tsc --noEmit` must pass with 0 errors. History/analytics/profit-loss screens stay untouched (transfers intentionally excluded).