-- Add type column to categories and expenses for Income & Cashflow Tracking
alter table public.categories add column if not exists type text not null default 'expense' check (type in ('expense', 'income'));
alter table public.expenses add column if not exists type text not null default 'expense' check (type in ('expense', 'income'));
