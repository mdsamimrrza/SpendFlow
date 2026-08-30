import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Expense, PeriodKey } from '@/types';
import { convertCurrency } from '@/services/currency';

let globalPrivacyMode = false;

export function setGlobalPrivacyMode(enabled: boolean) {
  globalPrivacyMode = enabled;
}

function isGlobalPrivacyMode() {
  return globalPrivacyMode;
}

export function formatMoney(amount: number, currency = 'NPR', isPrivate?: boolean) {
  const shouldMask = isPrivate !== undefined ? isPrivate : globalPrivacyMode;
  if (shouldMask) {
    const symbol =
      currency === 'NPR'
        ? 'Rs.'
        : currency === 'INR'
        ? '₹'
        : currency === 'USD'
        ? '$'
        : currency === 'QAR'
        ? '﷼'
        : currency === 'GBP'
        ? '£'
        : currency;
    return `${symbol} ••••••`;
  }

  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function isoDate(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

export function parseTimeInput(value?: string | null) {
  if (!value?.trim()) return null;

  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) throw new Error('Use a time such as 9:30 PM.');

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) throw new Error('Use a valid time such as 9:30 PM.');

  const period = match[3].toUpperCase();
  const hour24 = (hour % 12) + (period === 'PM' ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function formatTime12(value?: string | null) {
  if (!value) return '';

  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;

  const hour24 = Number(match[1]);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${period}`;
}

export function formatTimeForInput(value?: string | null) {
  return formatTime12(value);
}

export function currentFormattedTime() {
  const now = new Date();
  const hour24 = now.getHours();
  const minute = now.getMinutes();
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function currentMonthRange() {
  const now = new Date();
  return {
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to: format(endOfMonth(now), 'yyyy-MM-dd'),
    previousFrom: format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'),
    previousTo: format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'),
  };
}

export function filterExpensesByPeriod(expenses: Expense[], period: PeriodKey): Expense[] {
  if (!period || period === 'all') return expenses;

  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  if (period === 'today') {
    return expenses.filter((e) => e.date === todayStr);
  }

  if (period === 'week') {
    const dayOfWeek = now.getDay();
    const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    const mondayStr = format(monday, 'yyyy-MM-dd');

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = format(sunday, 'yyyy-MM-dd');

    return expenses.filter((e) => e.date >= mondayStr && e.date <= sundayStr);
  }

  if (period === 'month') {
    const monthPrefix = format(now, 'yyyy-MM');
    return expenses.filter((e) => e.date.startsWith(monthPrefix));
  }

  if (period === 'year') {
    const yearPrefix = format(now, 'yyyy');
    return expenses.filter((e) => e.date.startsWith(yearPrefix));
  }

  return expenses;
}

export function sumExpenses(
  expenses: Expense[],
  targetCurrency = 'NPR',
  rates?: Record<string, number>,
  typeFilter: 'all' | 'expense' | 'income' = 'expense',
) {
  return expenses.reduce((total, expense) => {
    const isIncome = expense.type === 'income';
    if (typeFilter === 'expense' && isIncome) return total;
    if (typeFilter === 'income' && !isIncome) return total;

    const amount = Number(expense.amount) || 0;
    const converted = convertCurrency(amount, expense.currency || 'NPR', targetCurrency, rates);
    return total + converted;
  }, 0);
}

export function sumIncome(
  expenses: Expense[],
  targetCurrency = 'NPR',
  rates?: Record<string, number>,
) {
  return sumExpenses(expenses, targetCurrency, rates, 'income');
}

export function calculateCashFlow(
  expenses: Expense[],
  targetCurrency = 'NPR',
  rates?: Record<string, number>,
) {
  const totalIncome = sumIncome(expenses, targetCurrency, rates);
  const totalExpense = sumExpenses(expenses, targetCurrency, rates, 'expense');
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netSavings / totalIncome) * 100)) : 0;

  return {
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate,
  };
}

export function formatBudgetPercent(spent: number, budget: number): string {
  if (budget <= 0) return '0%';
  const ratio = spent / budget;
  if (spent >= budget) {
    return `${Math.round(ratio * 100)}%`;
  }
  // When there is still budget remaining, never falsely round up to 100%
  const rounded = Math.round(ratio * 100);
  if (rounded >= 100) {
    const oneDec = Math.floor(ratio * 1000) / 10;
    return `${oneDec}%`;
  }
  return `${rounded}%`;
}

export function groupByCategory(
  expenses: Expense[],
  targetCurrency = 'NPR',
  rates?: Record<string, number>,
  typeFilter: 'all' | 'expense' | 'income' = 'expense',
) {
  const map = new Map<string, { label: string; icon: string; color: string; total: number }>();
  expenses.forEach((expense) => {
    const isIncome = (expense.type || 'expense') === 'income';
    if (typeFilter === 'expense' && isIncome) return;
    if (typeFilter === 'income' && !isIncome) return;

    const amount = Number(expense.amount) || 0;
    const converted = convertCurrency(amount, expense.currency || 'NPR', targetCurrency, rates);
    const categoryName = expense.categories?.name ?? 'Other';
    const current = map.get(categoryName) ?? {
      label: categoryName,
      icon: expense.categories?.icon ?? '💳',
      color: expense.categories?.color ?? '#0F9F8E',
      total: 0,
    };
    current.total += converted;
    map.set(categoryName, current);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
