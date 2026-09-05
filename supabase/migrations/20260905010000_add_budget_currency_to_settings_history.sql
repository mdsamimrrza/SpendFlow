-- Adds budget_currency to user_settings_history to track historical budget currency entries.
ALTER TABLE public.user_settings_history
  ADD COLUMN IF NOT EXISTS budget_currency text;

ALTER TABLE public.user_settings_history
  DROP CONSTRAINT IF EXISTS user_settings_history_budget_currency_check;

ALTER TABLE public.user_settings_history
  ADD CONSTRAINT user_settings_history_budget_currency_check
  CHECK (budget_currency IS NULL OR char_length(budget_currency) = 3);
