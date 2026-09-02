import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { Expense, PeriodKey } from '@/types';

let globalPrivacyMode = false;

const DEFAULT_RATES: Record<string, number> = {
  USD: 1.0,
  NPR: 133.5,
  INR: 83.5,
  QAR: 3.64,
  GBP: 0.79,
};

function convertCurrency(
  amount: number,
  fromCurrency = 'NPR',
  toCurrency = 'NPR',
  rates: Record<string, number> = DEFAULT_RATES,
): number {
  if (fromCurrency === toCurrency || !amount) return amount;

  const fromRate = rates[fromCurrency] || DEFAULT_RATES[fromCurrency] || 1;
  const toRate = rates[toCurrency] || DEFAULT_RATES[toCurrency] || 1;

  if (fromRate <= 0) return amount;

  const amountInUSD = amount / fromRate;
  const converted = amountInUSD * toRate;

  return Math.round(converted * 100) / 100;
}

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

/**
 * Returns the current reporting month range based on the user's cycle window.
 * startDay = 1 (default) and endDay = null → calendar month (1st → last day).
 * startDay 2..28 with endDay = null → cycle starts on that day, ends the day
 *   before the next cycle starts (dynamic; crosses calendar months as needed).
 * startDay 2..28 with endDay 1..31 → fixed window that repeats every month;
 *   endDay < startDay crosses into the next calendar month.
 * The returned range is always in local YYYY-MM-DD.
 */
export function getSafeMonthDate(year: number, month: number, targetDay: number): Date {
  const maxDaysInMonth = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(Math.max(Number(targetDay) || 1, 1), maxDaysInMonth);
  return new Date(year, month, safeDay);
}

/**
 * Returns the reporting month range based on the user's cycle window.
 * startDay = 1 (default) and endDay = null → calendar month (1st → last day).
 * startDay 2..31 with endDay = null → cycle starts on that day, ends the day
 * before the next cycle starts (dynamic; crosses calendar months as needed).
 * startDay 2..31 with endDay 1..31 → fixed window that repeats every month;
 * endDay < startDay crosses into the next calendar month.
 * offset = 0 (default) returns the currently active cycle; negative offsets
 * return previous cycle windows (e.g. -1 = the cycle before the active one).
 * The returned range is always in local YYYY-MM-DD.
 */
export function currentMonthRange(startDay = 1, endDay: number | null = null, offset = 0) {
  const now = new Date();
  // Reference "today" shifted by whole months for previous-cycle windows
  // (negative offset = past cycles).
  const ref = offset === 0
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(now.getFullYear(), now.getMonth() + offset, now.getDate());
  const day = Math.min(Math.max(Number(startDay) || 1, 1), 31);

  if (day === 1 && (endDay === null || endDay === 1)) {
    // Fast path: exact calendar month
    return {
      from: format(startOfMonth(ref), 'yyyy-MM-dd'),
      to: format(endOfMonth(ref), 'yyyy-MM-dd'),
      previousFrom: format(startOfMonth(subMonths(ref, 1)), 'yyyy-MM-dd'),
      previousTo: format(endOfMonth(subMonths(ref, 1)), 'yyyy-MM-dd'),
    };
  }

  // Determine the anchor: the cycle start date on/before the reference day
  const thisMonthStart = getSafeMonthDate(ref.getFullYear(), ref.getMonth(), day);
  const anchor = ref >= thisMonthStart
    ? thisMonthStart
    : getSafeMonthDate(ref.getFullYear(), ref.getMonth() - 1, day);

  let from: Date;
  let to: Date;
  let previousFrom: Date;
  let previousTo: Date;

  if (endDay !== null && endDay >= 1 && endDay <= 31) {
    // Fixed end day — may be before or after the start in calendar order
    from = anchor;
    to = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth(), endDay);
    if (endDay < day) {
      // End day is earlier in calendar order → it falls in the next calendar month
      to = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() + 1, endDay);
    }
    previousFrom = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() - 1, day);
    previousTo = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth(), endDay);
    if (endDay < day) {
      previousTo = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() + 1, endDay);
    }
  } else {
    // Dynamic end: day before the next cycle starts
    from = anchor;
    const nextCycleStart = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() + 1, day);
    to = new Date(nextCycleStart.getFullYear(), nextCycleStart.getMonth(), nextCycleStart.getDate() - 1);
    previousFrom = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() - 1, day);
    previousTo = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - 1);
  }

  return {
    from: format(from, 'yyyy-MM-dd'),
    to: format(to, 'yyyy-MM-dd'),
    previousFrom: format(previousFrom, 'yyyy-MM-dd'),
    previousTo: format(previousTo, 'yyyy-MM-dd'),
  };
}

/**
 * Returns detailed cycle metadata for pacing/budget cards.
 * Returns calendar-month values when startDay=1 and endDay=null/1.
 */
export function getCycleMeta(startDay = 1, endDay: number | null = null) {
  const now = new Date();
  const day = Math.min(Math.max(Number(startDay) || 1, 1), 31);

  if (day === 1 && (endDay === null || endDay === 1)) {
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const daysInCycle = monthEnd.getDate();
    const daysElapsed = Math.max(now.getDate(), 1);
    return {
      daysInCycle,
      daysElapsed,
      cycleFrom: format(monthStart, 'yyyy-MM-dd'),
      cycleTo: format(monthEnd, 'yyyy-MM-dd'),
      isCalendar: true,
    };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonthStart = getSafeMonthDate(now.getFullYear(), now.getMonth(), day);
  const anchor = today >= thisMonthStart
    ? thisMonthStart
    : getSafeMonthDate(now.getFullYear(), now.getMonth() - 1, day);

  let to: Date;
  if (endDay !== null && endDay >= 1 && endDay <= 31) {
    to = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth(), endDay);
    if (endDay < day) to = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() + 1, endDay);
  } else {
    const nextCycleStart = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() + 1, day);
    to = new Date(nextCycleStart.getFullYear(), nextCycleStart.getMonth(), nextCycleStart.getDate() - 1);
  }

  const daysInCycle = Math.round((to.getTime() - anchor.getTime()) / 86400000) + 1;
  const daysElapsed = Math.max(
    Math.round((now.getTime() - anchor.getTime()) / 86400000) + 1,
    1,
  );

  return {
    daysInCycle,
    daysElapsed,
    cycleFrom: format(anchor, 'yyyy-MM-dd'),
    cycleTo: format(to, 'yyyy-MM-dd'),
    isCalendar: false,
  };
}

/**
 * Returns a short human label for the active cycle.
 * - Calendar month (startDay=1): "Aug" or "Aug 2026" (with year when not current year)
 * - Custom cycle crossing months: "Aug–Sep" or "Aug–Sep 2026"
 * - Same-month custom cycle: "Aug"
 */
export function getCycleLabel(startDay = 1, endDay: number | null = null, locale = 'en-US'): string {
  const range = currentMonthRange(startDay, endDay);
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const now = new Date();
  const showYear = from.getFullYear() !== now.getFullYear() || to.getFullYear() !== now.getFullYear();

  const fromMonth = from.toLocaleDateString(locale, { month: 'short' });
  const toMonth   = to.toLocaleDateString(locale, { month: 'short' });
  const year = to.getFullYear();

  if (fromMonth === toMonth) {
    return showYear ? `${fromMonth} ${year}` : fromMonth;
  }
  return showYear ? `${fromMonth}–${toMonth} ${year}` : `${fromMonth}–${toMonth}`;
}

export function filterExpensesByPeriod(
  expenses: Expense[],
  period: PeriodKey,
  cycleStartDay = 1,
  cycleEndDay: number | null = null,
  customRange?: { startDate: string | null; endDate: string | null },
): Expense[] {
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
    const range = currentMonthRange(cycleStartDay, cycleEndDay);
    return expenses.filter((e) => e.date >= range.from && e.date <= range.to);
  }

  if (period === 'year') {
    const yearPrefix = format(now, 'yyyy');
    return expenses.filter((e) => e.date.startsWith(yearPrefix));
  }

  if (period === 'custom' && customRange?.startDate) {
    const start = customRange.startDate;
    const end = customRange.endDate || start;
    return expenses.filter((e) => e.date >= start && e.date <= end);
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
