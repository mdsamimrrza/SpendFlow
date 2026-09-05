-- ==============================================================================
-- SPENDFLOW MIGRATION: Explicit country on bank accounts
-- Description: Stores the ISO 3166-1 alpha-2 country code chosen during the
--   account setup wizard. The currency remains the source of truth for
--   conversion; `country` makes the account's origin explicit so transfers
--   and account lists can display it directly (e.g. 🇮🇳 → 🇳🇵).
-- ==============================================================================

ALTER TABLE public.bank_accounts
ADD COLUMN IF NOT EXISTS country TEXT;
