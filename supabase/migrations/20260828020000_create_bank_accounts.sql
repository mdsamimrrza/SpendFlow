-- ==============================================================================
-- SPENDFLOW MIGRATION: Multiple Bank Accounts & Wallets Management
-- Description: Creates `bank_accounts` table and links transactions to accounts.
-- ==============================================================================

-- 1. Create `bank_accounts` table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'bank' CHECK (account_type IN ('bank', 'wallet', 'cash', 'credit_card', 'savings', 'investment', 'other')),
  currency TEXT NOT NULL DEFAULT 'NPR',
  initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  color TEXT NOT NULL DEFAULT '#10B981',
  icon TEXT NOT NULL DEFAULT '🏦',
  account_number_last4 TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at TIMESTAMPTZ
);

-- 2. Add `bank_account_id` to `expenses`
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

-- 3. Add `bank_account_id` to `recurring_rules`
ALTER TABLE public.recurring_rules
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

-- 4. Create indexes for high performance
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON public.bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_bank_account_id ON public.expenses(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_bank_account_id ON public.recurring_rules(bank_account_id);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for `bank_accounts`
CREATE POLICY "Users can view own bank accounts"
  ON public.bank_accounts FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own bank accounts"
  ON public.bank_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bank accounts"
  ON public.bank_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bank accounts"
  ON public.bank_accounts FOR DELETE
  USING (auth.uid() = user_id);
