export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food', icon: 'utensils', color: '#10B981', type: 'expense' as const },
  { name: 'Transport', icon: 'car', color: '#10B981', type: 'expense' as const },
  { name: 'Entertainment', icon: 'film', color: '#10B981', type: 'expense' as const },
  { name: 'Medical', icon: 'heart-pulse', color: '#10B981', type: 'expense' as const },
  { name: 'Utilities', icon: 'zap', color: '#10B981', type: 'expense' as const },
  { name: 'Shopping', icon: 'shopping-bag', color: '#10B981', type: 'expense' as const },
  { name: 'Travel', icon: 'plane', color: '#10B981', type: 'expense' as const },
  { name: 'Education', icon: 'graduation-cap', color: '#10B981', type: 'expense' as const },
  { name: 'Other', icon: 'tag', color: '#10B981', type: 'expense' as const },
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', icon: 'briefcase', color: '#10B981', type: 'income' as const },
  { name: 'Freelance', icon: 'coins', color: '#10B981', type: 'income' as const },
  { name: 'Business', icon: 'building', color: '#10B981', type: 'income' as const },
  { name: 'Investments', icon: 'trending-up', color: '#10B981', type: 'income' as const },
  { name: 'Gifts', icon: 'gift', color: '#10B981', type: 'income' as const },
  { name: 'Other Income', icon: 'banknote', color: '#10B981', type: 'income' as const },
] as const;

export const DEFAULT_CATEGORIES = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
] as const;
