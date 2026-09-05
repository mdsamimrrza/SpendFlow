export type ThemePreference = 'light' | 'dark' | 'system';
export type PaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Other';
export type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
export type PeriodKey = 'today' | 'week' | 'month' | 'year' | 'custom' | 'all';
export type TransactionType = 'expense' | 'income';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_currency: string;
  theme_preference: ThemePreference;
  monthly_budget?: number | null;
  /** Currency the monthly_budget figure was entered in. Null/absent = preferred_currency. */
  budget_currency?: string | null;
  /** Day the user's reporting month starts on (1–28). 1 = calendar month. */
  cycle_start_day?: number | null;
  /**
   * Day the reporting month ends on (1–31, inclusive). null = "last day of
   * cycle" (dynamic: day before the next cycle starts — calendar month when
   * start is 1). An end day earlier than the start day crosses into the next
   * calendar month (e.g. start 28 / end 27 → 28th → 27th).
   */
  cycle_end_day?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  is_custom: boolean;
  budget_monthly: number | null;
  type?: TransactionType;
  created_at: string;
}

export interface CreateCategoryInput {
  name: string;
  icon: string;
  color: string;
  budget_monthly?: number | null;
  type?: TransactionType;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string;
  color?: string;
  budget_monthly?: number | null;
  type?: TransactionType;
}

export interface Expense {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  currency: string;
  description: string | null;
  date: string;
  time: string | null;
  payment_method: PaymentMethod;
  notes: string | null;
  receipt_image_url: string | null;
  is_recurring: boolean;
  recurring_rule_id: string | null;
  bank_account_id?: string | null;
  /** USD per 1 unit of `currency`, snapshotted at the transaction date. Never recomputed. */
  exchange_rate_to_usd?: number | null;
  base_currency?: string | null;
  type?: TransactionType;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  categories?: Pick<Category, 'name' | 'icon' | 'color'> | null;
  bank_accounts?: Pick<BankAccount, 'name' | 'icon' | 'color' | 'account_type'> | null;
}

export interface ExpenseInput {
  amount: number;
  category_id: string;
  currency: string;
  description?: string | null;
  date: string;
  time?: string | null;
  payment_method: PaymentMethod;
  bank_account_id?: string | null;
  notes?: string | null;
  receipt_image_url?: string | null;
  type?: TransactionType;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface RecurringRule {
  id: string;
  user_id: string;
  category_id: string;
  bank_account_id?: string | null;
  amount: number;
  currency: string;
  description: string | null;
  payment_method: PaymentMethod;
  frequency: RecurringFrequency;
  next_due_date: string;
  is_active: boolean;
  /** USD per 1 unit of `currency`, snapshotted at rule creation. Never recomputed. */
  exchange_rate_to_usd?: number | null;
  base_currency?: string | null;
  created_at: string;
  updated_at: string;
  categories?: Pick<Category, 'name' | 'icon' | 'color'> | null;
}

export type AccountType = 'bank' | 'wallet' | 'cash' | 'credit_card' | 'savings' | 'investment' | 'other';

export interface BankAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  currency: string;
  /** ISO 3166-1 alpha-2 country code chosen at setup (null = unknown / Other). */
  country?: string | null;
  initial_balance: number;
  current_balance: number;
  color: string;
  icon: string;
  account_number_last4?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface BankAccountInput {
  name: string;
  account_type: AccountType;
  currency: string;
  country?: string | null;
  initial_balance?: number;
  current_balance?: number;
  color?: string;
  icon?: string;
  account_number_last4?: string | null;
  is_default?: boolean;
}

/** Money moved from one account to another, converted into the target account's currency. */
export interface Transfer {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  /** Amount in `from_currency` (the source account's currency). */
  amount: number;
  from_currency: string;
  to_currency: string;
  /** Units of `to_currency` per 1 unit of `from_currency`, locked at transfer time. Never recomputed. */
  exchange_rate: number;
  /** Amount received in `to_currency` (the target account's currency). */
  converted_amount: number;
  /** Optional fee in `from_currency`, deducted from the source account only. */
  fee: number;
  date: string;
  time: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  from_account?: Pick<BankAccount, 'name' | 'icon' | 'color' | 'currency' | 'country'> | null;
  to_account?: Pick<BankAccount, 'name' | 'icon' | 'color' | 'currency' | 'country'> | null;
}

export interface TransferInput {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  date: string;
  time?: string | null;
  notes?: string | null;
  fee?: number;
}

export interface ExpenseFilters {
  search?: string;
  fromDate?: string;
  toDate?: string;
  categoryIds?: string[];
  bankAccountId?: string | 'All';
  minAmount?: number;
  maxAmount?: number;
  paymentMethod?: PaymentMethod | 'All';
  type?: TransactionType | 'All';
  fetchAll?: boolean;
}

export interface ExpensePage {
  items: Expense[];
  hasMore: boolean;
}

/** One segment of the user's budget / paycheck-cycle settings, effective from a date. */
export interface UserSettingsPeriod {
  effective_from: string; // YYYY-MM-DD
  monthly_budget: number | null;
  budget_currency?: string | null;
  cycle_start_day: number;
  cycle_end_day: number | null;
}

/** One segment of a category's monthly budget, effective from a date. */
export interface CategoryBudgetPeriod {
  category_id: string;
  effective_from: string; // YYYY-MM-DD
  budget_monthly: number | null;
}
