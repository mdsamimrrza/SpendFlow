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
  // Stable ID supplied only for offline-created transactions. It makes retries idempotent.
  client_sync_id?: string | null;
  is_synced: boolean;
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
  initial_balance?: number;
  current_balance?: number;
  color?: string;
  icon?: string;
  account_number_last4?: string | null;
  is_default?: boolean;
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

export interface OfflineOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  payload: ExpenseInput & { id?: string };
  createdAt: string;
  localId?: string; // Local temp ID used before server sync, for cleanup
}
