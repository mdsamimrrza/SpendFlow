import { PaymentMethod, PeriodKey, SortKey } from '@/types';

export const PAGE_SIZE = 20;
/** Per-user expense cache key prefix — always suffixed with the authenticated user id. */
export const EXPENSE_CACHE_PREFIX = '@spendflow_expense_cache_';
/**
 * Pre-Priority-2 global expense cache key (multi-user data under one key).
 * READ-ONLY migration source: rows are migrated to the per-user key only when
 * their embedded server-side user_id matches the requesting user. Do not build
 * new architecture on this key; it is removed in a later cleanup priority.
 */
export const LEGACY_EXPENSE_CACHE_KEY = 'spendflow_expense_cache';

export const CURRENCIES = ['NPR', 'USD', 'INR', 'QAR', 'GBP'] as const;
export const CURRENCY_DETAILS: Record<(typeof CURRENCIES)[number], { flag: string; label: string }> = {
  INR: { flag: '🇮🇳', label: 'Indian Rupee' },
  NPR: { flag: '🇳🇵', label: 'Nepalese Rupee' },
  USD: { flag: '🇺🇸', label: 'US Dollar' },
  QAR: { flag: '🇶🇦', label: 'Qatari Riyal' },
  GBP: { flag: '🇬🇧', label: 'British Pound' },
};
export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'UPI', 'Other'];

export const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Newest', value: 'date_desc' },
  { label: 'Oldest', value: 'date_asc' },
  { label: 'Highest amount', value: 'amount_desc' },
  { label: 'Lowest amount', value: 'amount_asc' },
];

export const PERIODS: { label: string; value: PeriodKey }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: 'all' },
];
