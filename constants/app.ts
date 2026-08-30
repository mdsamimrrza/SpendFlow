import { PaymentMethod, PeriodKey, SortKey } from '@/types';

export const PAGE_SIZE = 20;
export const OFFLINE_QUEUE_KEY = 'spendflow_offline_queue';
export const EXPENSE_CACHE_KEY = 'spendflow_expense_cache';

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
