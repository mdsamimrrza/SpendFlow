import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Expense } from '@/types';

export function formatMoney(amount: number, currency = 'NPR') {
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

export function formatTimeForInput(value?: string | null) {
  if (!value) return '';

  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;

  const hour24 = Number(match[1]);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${period}`;
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

import { convertCurrency } from '@/services/currency';

export function sumExpenses(
  expenses: Expense[],
  targetCurrency = 'NPR',
  rates?: Record<string, number>,
) {
  return expenses.reduce((total, expense) => {
    const amount = Number(expense.amount) || 0;
    const converted = convertCurrency(amount, expense.currency || 'NPR', targetCurrency, rates);
    return total + converted;
  }, 0);
}

export function groupByCategory(
  expenses: Expense[],
  targetCurrency = 'NPR',
  rates?: Record<string, number>,
) {
  const totals = new Map<string, { label: string; color: string; icon: string; total: number }>();
  for (const expense of expenses) {
    const category = expense.categories;
    const key = expense.category_id;
    const current = totals.get(key) ?? {
      label: category?.name ?? 'Other',
      color: category?.color ?? '#64748B',
      icon: category?.icon ?? '📌',
      total: 0,
    };
    const amount = Number(expense.amount) || 0;
    const converted = convertCurrency(amount, expense.currency || 'NPR', targetCurrency, rates);
    current.total += converted;
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

