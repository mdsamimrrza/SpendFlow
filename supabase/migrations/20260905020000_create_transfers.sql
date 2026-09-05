-- ==============================================================================
-- SPENDFLOW MIGRATION: Account-to-Account Transfers with Currency Conversion
-- Description: Creates `transfers` table. A transfer moves an amount (in the
--   source account's currency) from one account to another; the received amount
--   is stored in the target account's currency together with the exchange rate
--   locked at transfer time, so live balances stay historically accurate.
--   Transfers are deliberately separate from `expenses`: moving money between
--   accounts is neither spending nor income.
-- ==============================================================================

-- 1. Create `transfers` table
CREATE TABLE IF NOT EXISTS public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  to_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  -- Units of `to_currency` per 1 unit of `from_currency`, locked at transfer time.
  exchange_rate NUMERIC(18, 8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  converted_amount NUMERIC(14, 2) NOT NULL CHECK (converted_amount > 0),
  -- Optional transfer fee, expressed in `from_currency`. Deducted from the
  -- source account only.
  fee NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (fee >= 0),
  date DATE NOT NULL,
  time TIME,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT transfers_distinct_accounts CHECK (from_account_id <> to_account_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_transfers_user_id_date ON public.transfers(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transfers_from_account_id ON public.transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_account_id ON public.transfers(to_account_id);

-- 3. Keep `updated_at` fresh
DROP TRIGGER IF EXISTS transfers_set_updated_at ON public.transfers;
CREATE TRIGGER transfers_set_updated_at
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for `transfers`
CREATE POLICY "Users can view own transfers"
  ON public.transfers FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own transfers"
  ON public.transfers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transfers"
  ON public.transfers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transfers"
  ON public.transfers FOR DELETE
  USING (auth.uid() = user_id);
