export type ThemePreference = 'light' | 'dark' | 'system';
export type PaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Other';
export type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
export type PeriodKey = 'today' | 'week' | 'month' | 'year' | 'custom' | 'all';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_currency: string;
  theme_preference: ThemePreference;
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
  created_at: string;
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
  is_synced: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  categories?: Pick<Category, 'name' | 'icon' | 'color'> | null;
}

export interface ExpenseInput {
  amount: number;
  category_id: string;
  currency: string;
  description?: string | null;
  date: string;
  time?: string | null;
  payment_method: PaymentMethod;
  notes?: string | null;
  receipt_image_url?: string | null;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface RecurringRule {
  id: string;
  user_id: string;
  category_id: string;
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

export interface ExpenseFilters {
  search?: string;
  fromDate?: string;
  toDate?: string;
  categoryIds?: string[];
  minAmount?: number;
  maxAmount?: number;
  paymentMethod?: PaymentMethod | 'All';
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
}
