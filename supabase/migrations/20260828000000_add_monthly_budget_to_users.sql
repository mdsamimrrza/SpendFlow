-- Migration to add monthly_budget column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(12,2) DEFAULT NULL;

