-- Add custom billing-cycle columns to public.users so the setting
-- syncs across all devices on the same account.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cycle_start_day INTEGER NOT NULL DEFAULT 1
    CHECK (cycle_start_day >= 1 AND cycle_start_day <= 31);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cycle_end_day INTEGER DEFAULT NULL
    CHECK (cycle_end_day IS NULL OR (cycle_end_day >= 1 AND cycle_end_day <= 31));
