import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Calendar, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Scale, Sliders, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { CalendarModal, DateRange } from '@/components/ui/CalendarModal';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { updateProfile } from '@/services/auth';
import { resetBudgetAlertHistory } from '@/services/notifications';
import { fetchUserSettingsHistory } from '@/services/settingsHistory';
import { currentMonthRange, formatMoney, getSafeMonthDate, sumExpenses, sumIncome } from '@/utils/format';
import { UserSettingsPeriod } from '@/types';

interface MonthRow {
  key: string;
  label: string;
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  /** Monthly budget that was active during this cycle (null = none set). */
  budget: number | null;
}

function toISO(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export default function ProfitLossScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();
  const { isPrivacyMode } = usePrivacy();
  const { rates } = useExchangeRates();

  // Financial reporting must span every cycle since the first transaction, so
  // the full history is fetched — the default server page (20 rows) would
  // silently truncate every total below.
  const expenses = useExpenses(profile?.id, { fetchAll: true });
  const currency = profile?.preferred_currency ?? 'NPR';

  // Default reporting range: Jan 1 of the current year → today
  const now = new Date();
  const [range, setRange] = useState<DateRange>({
    startDate: toISO(new Date(now.getFullYear(), 0, 1)),
    endDate: toISO(now),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Pagination state for Month by Month breakdown
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSuccessMsg, setBudgetSuccessMsg] = useState<string | null>(null);
  const [selectedChartIdx, setSelectedChartIdx] = useState<number | null>(null);
  const [chartViewMode, setChartViewMode] = useState<'all' | 'income' | 'expense' | 'net'>('all');

  // Cycle window state & editor
  const [updatingCycle, setUpdatingCycle] = useState(false);
  const [cycleCalendarOpen, setCycleCalendarOpen] = useState(false);
  const [cycleCalendarMode, setCycleCalendarMode] = useState<'range' | 'single-start' | 'single-end'>('range');
  const [cycleSettingsOpen, setCycleSettingsOpen] = useState(false);
  const [cycleSuccessMsg, setCycleSuccessMsg] = useState<string | null>(null);

  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const cycleEndDayRaw = Number(profile?.cycle_end_day);
  const cycleEndDay = cycleEndDayRaw >= 1 && cycleEndDayRaw <= 31 ? cycleEndDayRaw : null;
  const cycleLabel = `${cycleStartDay} – ${cycleEndDay !== null ? cycleEndDay : t('pl_last_day') || 'Last day'}`;

  const [modalStartDay, setModalStartDay] = useState(String(cycleStartDay));
  const [modalEndDay, setModalEndDay] = useState(cycleEndDay !== null ? String(cycleEndDay) : '');

  const activeCycle = useMemo(() => currentMonthRange(cycleStartDay, cycleEndDay), [cycleStartDay, cycleEndDay]);
  const activeCycleRangeText = useMemo(() => {
    try {
      const f = new Date(activeCycle.from);
      const tDate = new Date(activeCycle.to);
      return `${format(f, 'd MMM')} – ${format(tDate, 'd MMM yyyy')}`;
    } catch {
      return '';
    }
  }, [activeCycle]);

  useEffect(() => {
    setModalStartDay(String(cycleStartDay));
    setModalEndDay(cycleEndDay !== null ? String(cycleEndDay) : '');
  }, [cycleStartDay, cycleEndDay]);

  useEffect(() => {
    setBudgetInput(profile?.monthly_budget ? String(profile.monthly_budget) : '');
  }, [profile?.monthly_budget]);

  const from = range.startDate ?? toISO(new Date(now.getFullYear(), 0, 1));
  const to = range.endDate ?? toISO(now);

  const itemsInRange = useMemo(
    () => expenses.items.filter((e) => e.date >= from && e.date <= to),
    [expenses.items, from, to],
  );

  const totalIncome = useMemo(
    () => sumIncome(itemsInRange, currency, rates),
    [itemsInRange, currency, rates],
  );
  const totalExpense = useMemo(
    () => sumExpenses(itemsInRange, currency, rates),
    [itemsInRange, currency, rates],
  );
  const netResult = totalIncome - totalExpense;
  const isProfit = netResult >= 0;

  // ── Settings history: what the budget & cycle days were at any past date ──
  const [settingsHistory, setSettingsHistory] = useState<UserSettingsPeriod[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    fetchUserSettingsHistory(profile.id)
      .then((rows) => {
        if (!cancelled) setSettingsHistory(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  // Time segments of settings: each change starts a new segment, so a past
  // cycle is always computed with the days/budget that were actually active
  // back then. Falls back to a single segment from the current profile when
  // history is unavailable (offline / migration not applied yet).
  const settingsPeriods = useMemo<UserSettingsPeriod[]>(() => {
    if (settingsHistory.length > 0) return settingsHistory;
    return [
      {
        effective_from: '1900-01-01',
        monthly_budget: profile?.monthly_budget ?? null,
        cycle_start_day: cycleStartDay,
        cycle_end_day: cycleEndDay,
      },
    ];
  }, [settingsHistory, profile?.monthly_budget, cycleStartDay, cycleEndDay]);

  const todayISO = toISO(new Date());

  // ── Cycle-row builder shared by the Month-by-Month breakdown and the stock
  // graph: walks the settings periods, generates each period's paycheck-cycle
  // windows inside [rangeStartISO, rangeEndISO] (clamped at today), and sums
  // the transactions falling in every window.
  const buildCycleRows = useCallback(
    (rangeStartISO: string, rangeEndISO: string): MonthRow[] => {
      if (!rangeStartISO || !rangeEndISO || rangeStartISO > rangeEndISO) return [];

      const parseISO = (iso: string) =>
        new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
      const today = parseISO(todayISO);
      const rangeStart = parseISO(rangeStartISO);
      const rangeEnd = parseISO(rangeEndISO) < today ? parseISO(rangeEndISO) : today;
      if (rangeStart > rangeEnd) return [];

      const rows: MonthRow[] = [];

      settingsPeriods.forEach((period, idx) => {
        const periodStart = parseISO(period.effective_from);
        const nextPeriodStart =
          idx + 1 < settingsPeriods.length
            ? parseISO(settingsPeriods[idx + 1].effective_from)
            : null;
        const periodEnd = nextPeriodStart
          ? new Date(
              nextPeriodStart.getFullYear(),
              nextPeriodStart.getMonth(),
              nextPeriodStart.getDate() - 1,
            )
          : today;
        if (periodStart > rangeEnd) return;

        const segStart = periodStart > rangeStart ? periodStart : rangeStart;
        const segEnd = periodEnd < rangeEnd ? periodEnd : rangeEnd;
        if (segStart > segEnd) return;

        const calendarCycle =
          period.cycle_start_day === 1 && (period.cycle_end_day === null || period.cycle_end_day === 1);

        const cycleWindow = (year: number, month: number) => {
          if (calendarCycle) {
            return { cStart: new Date(year, month, 1), cEnd: new Date(year, month + 1, 0) };
          }
          const cStart = getSafeMonthDate(year, month, period.cycle_start_day);
          let cEnd: Date;
          if (period.cycle_end_day !== null && period.cycle_end_day >= 1 && period.cycle_end_day <= 31) {
            cEnd = getSafeMonthDate(
              year,
              period.cycle_end_day < period.cycle_start_day ? month + 1 : month,
              period.cycle_end_day,
            );
          } else {
            const nextStart = getSafeMonthDate(year, month + 1, period.cycle_start_day);
            cEnd = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
          }
          return { cStart, cEnd };
        };

        // Start a couple of months back so the cycle containing segStart is caught
        let cursor = new Date(segStart.getFullYear(), segStart.getMonth() - 2, 1);

        while (true) {
          const { cStart, cEnd } = cycleWindow(cursor.getFullYear(), cursor.getMonth());
          if (cStart > segEnd) break;
          if (cEnd >= segStart && cEnd >= cStart) {
            const bucketFrom = cStart > segStart ? cStart : segStart;
            const bucketTo = cEnd < segEnd ? cEnd : segEnd;
            const bucketFromISO = toISO(bucketFrom);
            const bucketToISO = toISO(bucketTo);
            const items = expenses.items.filter((e) => e.date >= bucketFromISO && e.date <= bucketToISO);
            const income = sumIncome(items, currency, rates);
            const expense = sumExpenses(items, currency, rates);

            rows.push({
              key: bucketToISO,
              label: format(bucketTo, 'MMMM yyyy'),
              from: bucketFromISO,
              to: bucketToISO,
              income,
              expense,
              net: income - expense,
              budget: period.monthly_budget,
            });
          }
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }
      });

      return rows;
    },
    [settingsPeriods, expenses.items, currency, rates, todayISO],
  );

  // ── Month-by-month breakdown: every cycle since the first transaction ──
  const firstExpenseDate = useMemo(() => {
    if (expenses.items.length === 0) return null;
    return expenses.items.reduce((min, e) => (e.date < min ? e.date : min), expenses.items[0].date);
  }, [expenses.items]);

  const monthRows = useMemo<MonthRow[]>(
    () => (firstExpenseDate ? buildCycleRows(firstExpenseDate, todayISO).reverse() : []),
    [buildCycleRows, firstExpenseDate, todayISO],
  );

  // Reset pagination to page 1 on cycle setting change
  useEffect(() => {
    setCurrentPage(1);
  }, [cycleStartDay, cycleEndDay]);

  // Drop any selected chart point when the calendar range changes
  useEffect(() => {
    setSelectedChartIdx(null);
  }, [from, to]);

  // Stock-graph series: paycheck-cycle buckets (with the settings active in
  // each period) clamped to the calendar range picker above — the chart spans
  // exactly what the filter shows.
  const rangeChartRows = useMemo<MonthRow[]>(() => buildCycleRows(from, to), [buildCycleRows, from, to]);

  const totalPages = Math.ceil(monthRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedMonthRows = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return monthRows.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [monthRows, currentPage]);

  const hasData = itemsInRange.length > 0;
  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;

  async function handleSetCycleWindow(startDay: number, endDay: number | null) {
    setUpdatingCycle(true);
    setCycleSuccessMsg(null);
    try {
      await updateProfile({ cycle_start_day: startDay, cycle_end_day: endDay });
      await refreshProfile();

      // Tactile Haptic Confirmation
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

      const endLabel = endDay !== null ? `Day ${endDay}` : 'Auto (Day - 1)';
      const msg = `Paycheck Cycle updated! Active range: Day ${startDay} → ${endLabel}.`;
      setCycleSuccessMsg(msg);

      // Auto clear after 4.5 seconds
      setTimeout(() => {
        setCycleSuccessMsg(null);
      }, 4500);
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      Alert.alert(
        t('common_error') || 'Something went wrong',
        err instanceof Error ? err.message : t('common_error') || 'Something went wrong',
      );
    } finally {
      setUpdatingCycle(false);
    }
  }

  function handleCalendarApply(applied: DateRange) {
    if (!applied.startDate) {
      setCycleCalendarOpen(false);
      return;
    }

    if (cycleCalendarMode === 'range') {
      const startParts = applied.startDate.split('-');
      const startDay = Number(startParts[2]);

      let endDay: number | null = null;
      if (applied.endDate) {
        const endParts = applied.endDate.split('-');
        endDay = Number(endParts[2]);
      }

      if (startDay >= 1 && startDay <= 31) {
        setModalStartDay(String(startDay));
        if (endDay !== null && endDay >= 1 && endDay <= 31) {
          setModalEndDay(String(endDay));
        } else {
          setModalEndDay('');
        }
        void handleSetCycleWindow(startDay, endDay);
      }
    } else if (cycleCalendarMode === 'single-start') {
      const startParts = applied.startDate.split('-');
      const startDay = Number(startParts[2]);
      if (startDay >= 1 && startDay <= 31) {
        setModalStartDay(String(startDay));
        void handleSetCycleWindow(startDay, cycleEndDay);
      }
    } else if (cycleCalendarMode === 'single-end') {
      const endParts = applied.startDate.split('-');
      const endDay = Number(endParts[2]);
      if (endDay >= 1 && endDay <= 31) {
        setModalEndDay(String(endDay));
        void handleSetCycleWindow(cycleStartDay, endDay);
      }
    }
    setCycleCalendarOpen(false);
  }

  async function handleSaveBudget() {
    setSavingBudget(true);
    setBudgetSuccessMsg(null);
    try {
      const numeric = budgetInput.trim() ? Number(budgetInput.replace(/[^0-9.]/g, '')) : null;
      await updateProfile({ monthly_budget: numeric });
      await resetBudgetAlertHistory();
      await refreshProfile();

      // Tactile Haptic Confirmation
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

      const msg = numeric
        ? `Monthly budget saved: ${formatMoney(numeric, currency)}`
        : 'Monthly budget cleared!';
      setBudgetSuccessMsg(msg);

      // Auto clear after 3.5 seconds
      setTimeout(() => {
        setBudgetSuccessMsg(null);
      }, 3500);
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      Alert.alert(
        t('common_error') || 'Something went wrong',
        err instanceof Error ? err.message : t('common_error') || 'Something went wrong',
      );
    } finally {
      setSavingBudget(false);
    }
  }

  function renderMonthRow(row: MonthRow) {
    const rowIsProfit = row.net >= 0;
    const peak = Math.max(row.income, row.expense, 1);
    const incomeWidth = Math.round((row.income / peak) * 100);
    const expenseWidth = Math.round((row.expense / peak) * 100);
    const savingsRate = row.income > 0 ? Math.round((row.net / row.income) * 100) : 0;

    return (
      <View
        key={row.key}
        style={{
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 16,
          gap: 12,
        }}
      >
        {/* Header row — month + net */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>
            {row.label}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: rowIsProfit ? theme.colors.income : theme.colors.danger }}>
            {rowIsProfit ? '+' : '−'}{formatMoney(Math.abs(row.net), currency, isPrivacyMode)}
          </Text>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: theme.colors.border }} />

        {/* Income row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={14} color={theme.colors.income} />
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.colors.textMuted }}>Income</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 80, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceElevated, overflow: 'hidden' }}>
              <View style={{ width: `${incomeWidth}%`, height: '100%', backgroundColor: theme.colors.income, borderRadius: 2 }} />
            </View>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.income, minWidth: 90, textAlign: 'right' }}>
              {formatMoney(row.income, currency, isPrivacyMode)}
            </Text>
          </View>
        </View>

        {/* Expense row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TrendingDown size={14} color={theme.colors.danger} />
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.colors.textMuted }}>Expense</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 80, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceElevated, overflow: 'hidden' }}>
              <View style={{ width: `${expenseWidth}%`, height: '100%', backgroundColor: theme.colors.danger, borderRadius: 2 }} />
            </View>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.danger, minWidth: 90, textAlign: 'right' }}>
              {formatMoney(row.expense, currency, isPrivacyMode)}
            </Text>
          </View>
        </View>

        {/* Budget vs actual — the monthly budget that was active in THIS cycle */}
        {row.budget !== null && row.budget > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Wallet size={14} color={theme.colors.primary} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.colors.textMuted }}>Budget</Text>
            </View>
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: '700',
                color: row.expense > row.budget ? theme.colors.danger : theme.colors.text,
              }}
            >
              {formatMoney(row.expense, currency, isPrivacyMode)} / {formatMoney(row.budget, currency, isPrivacyMode)}
              {' '}({Math.min(Math.round((row.expense / row.budget) * 100), 999)}%)
            </Text>
          </View>
        )}

        {/* Savings rate */}
        {row.income > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: theme.colors.textMuted }}>
              Savings rate
            </Text>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: rowIsProfit ? theme.colors.income : theme.colors.danger }}>
              {savingsRate}%
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 60 }}
      refreshControl={
        <RefreshControl
          refreshing={expenses.refreshing}
          onRefresh={() => void expenses.refresh(true)}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* ── 1. HEADER ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={() => router.dismiss()}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.colors.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <ChevronLeft size={18} color={theme.colors.text} />
          </Pressable>
          <View style={{ gap: 2 }}>
            <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
              {t('pl_subtitle') || 'Monthly performance report'}
            </Text>
            <Text variant="h1" style={{ fontWeight: '800' }}>
              {t('pl_title') || 'Profit & Loss'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 2. DATE RANGE PICKER (first & last date via calendar) ── */}
      <Pressable
        onPress={() => setCalendarOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 14,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CalendarDays size={18} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '700' }}>
            Stock Graph Period Filter (Calendar)
          </Text>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.colors.text }} numberOfLines={1}>
            {format(new Date(from), 'd MMM yyyy')} — {format(new Date(to), 'd MMM yyyy')}
          </Text>
        </View>
        <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary, fontSize: 12 }}>
          {t('pl_change') || 'Change'}
        </Text>
      </Pressable>

      {/* ── 3. RANGE SUMMARY — EXECUTIVE STOCK TREND CHART ── */}
      {(() => {
        const { width } = useWindowDimensions();
        const chartW = Math.min(width - 64, 480);
        const chartH = 180;
        const padL = 12;
        const padR = 12;
        const padTop = 20;
        const padBot = 28;
        const drawW = chartW - padL - padR;
        const drawH = chartH - padTop - padBot;

        const pts = rangeChartRows.slice();
        const n = pts.length;

        const incomes  = pts.map((r) => r.income);
        const expenses = pts.map((r) => r.expense);
        const nets     = pts.map((r) => r.net);

        const allVals = chartViewMode === 'income' ? incomes : chartViewMode === 'expense' ? expenses : chartViewMode === 'net' ? nets : [...incomes, ...expenses, ...nets];
        const maxVal = Math.max(...allVals, 1);
        const minVal = Math.min(...allVals, 0);
        const valRange = Math.max(maxVal - minVal, 1);

        const toX = (i: number) => padL + (n <= 1 ? drawW / 2 : (i / (n - 1)) * drawW);
        const toY = (v: number) => padTop + ((maxVal - v) / valRange) * drawH;

        const buildPath = (vals: number[]) => {
          if (vals.length === 0) return '';
          if (vals.length === 1) return `M ${padL},${toY(vals[0])} L ${padL + drawW},${toY(vals[0])}`;
          let d = `M ${toX(0)},${toY(vals[0])}`;
          for (let i = 0; i < vals.length - 1; i++) {
            const cpx = (toX(i) + toX(i + 1)) / 2;
            d += ` C ${cpx},${toY(vals[i])} ${cpx},${toY(vals[i + 1])} ${toX(i + 1)},${toY(vals[i + 1])}`;
          }
          return d;
        };

        const incPath  = buildPath(incomes);
        const expPath  = buildPath(expenses);
        const netPath  = buildPath(nets);

        const incArea = incPath ? `${incPath} L ${toX(n - 1)},${chartH - padBot} L ${toX(0)},${chartH - padBot} Z` : '';
        const expArea = expPath ? `${expPath} L ${toX(n - 1)},${chartH - padBot} L ${toX(0)},${chartH - padBot} Z` : '';
        const netArea = netPath ? `${netPath} L ${toX(n - 1)},${chartH - padBot} L ${toX(0)},${chartH - padBot} Z` : '';

        const sel = selectedChartIdx !== null && pts[selectedChartIdx] ? pts[selectedChartIdx] : null;
        const overallSavingsRate = totalIncome > 0 ? Math.round((netResult / totalIncome) * 100) : 0;

        return (
          <Card style={{ padding: 18, gap: 16 }}>
            {/* Header with Title & Mode Selector */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={18} color={theme.colors.primary} />
                  <Text variant="label" style={{ fontSize: 14, fontWeight: '800' }}>
                    {t('pl_summary') || 'Period Performance Flow'}
                  </Text>
                </View>

                {/* Savings Rate Badge */}
                {totalIncome > 0 && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: netResult >= 0 ? (theme.isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5') : (theme.isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2'),
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: netResult >= 0 ? theme.colors.income : theme.colors.danger }}>
                      {netResult >= 0 ? '▲ ' : '▼ '}{overallSavingsRate}% Savings Rate
                    </Text>
                  </View>
                )}
              </View>

              {/* Interactive View Mode Switcher Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {[
                  { mode: 'all', label: 'All Flows' },
                  { mode: 'income', label: 'Income Trend' },
                  { mode: 'expense', label: 'Expense Trend' },
                  { mode: 'net', label: 'Net Profit' },
                ].map((tab) => {
                  const isActive = chartViewMode === tab.mode;
                  return (
                    <Pressable
                      key={tab.mode}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                        setChartViewMode(tab.mode as any);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: theme.radius.sm,
                        backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: isActive ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 11.5, fontWeight: isActive ? '800' : '600', color: isActive ? '#FFFFFF' : theme.colors.text }}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Interactive Selected Point HUD Card */}
            {sel ? (
              <View
                style={{
                  padding: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.primary,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.text }}>
                    {sel.label}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: sel.net >= 0 ? theme.colors.income : theme.colors.danger }}>
                    Savings: {sel.income > 0 ? Math.round((sel.net / sel.income) * 100) : 0}%
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TrendingUp size={12} color={theme.colors.income} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.income }}>
                      +{formatMoney(sel.income, currency, isPrivacyMode)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TrendingDown size={12} color={theme.colors.danger} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.danger }}>
                      −{formatMoney(sel.expense, currency, isPrivacyMode)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '900', color: sel.net >= 0 ? theme.colors.income : theme.colors.danger }}>
                      Net: {sel.net >= 0 ? '+' : '−'}{formatMoney(Math.abs(sel.net), currency, isPrivacyMode)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* SVG Chart */}
            {n > 0 && (
              <View style={{ position: 'relative', alignItems: 'center' }}>
                <Svg width={chartW} height={chartH}>
                  <Defs>
                    <LinearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={theme.colors.income} stopOpacity={0.25} />
                      <Stop offset="100%" stopColor={theme.colors.income} stopOpacity={0} />
                    </LinearGradient>
                    <LinearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={theme.colors.danger} stopOpacity={0.25} />
                      <Stop offset="100%" stopColor={theme.colors.danger} stopOpacity={0} />
                    </LinearGradient>
                    <LinearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={theme.colors.primary} stopOpacity={0.3} />
                      <Stop offset="100%" stopColor={theme.colors.primary} stopOpacity={0} />
                    </LinearGradient>
                  </Defs>

                  {/* Horizontal Grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const yVal = padTop + ratio * drawH;
                    return (
                      <Line
                        key={i}
                        x1={padL} y1={yVal}
                        x2={chartW - padR} y2={yVal}
                        stroke={theme.colors.border}
                        strokeWidth={0.7}
                        strokeDasharray="4,4"
                        opacity={0.5}
                      />
                    );
                  })}

                  {/* Zero / Baseline */}
                  <Line
                    x1={padL} y1={toY(0)}
                    x2={chartW - padR} y2={toY(0)}
                    stroke={theme.colors.border}
                    strokeWidth={1.5}
                  />

                  {/* Area Fills */}
                  {(chartViewMode === 'all' || chartViewMode === 'income') && incArea ? (
                    <Path d={incArea} fill="url(#incGrad)" />
                  ) : null}
                  {chartViewMode === 'expense' && expArea ? (
                    <Path d={expArea} fill="url(#expGrad)" />
                  ) : null}
                  {chartViewMode === 'net' && netArea ? (
                    <Path d={netArea} fill="url(#netGrad)" />
                  ) : null}

                  {/* Line Paths */}
                  {(chartViewMode === 'all' || chartViewMode === 'income') && incPath ? (
                    <Path d={incPath} fill="none" stroke={theme.colors.income} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}

                  {(chartViewMode === 'all' || chartViewMode === 'expense') && expPath ? (
                    <Path d={expPath} fill="none" stroke={theme.colors.danger} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}

                  {(chartViewMode === 'all' || chartViewMode === 'net') && netPath ? (
                    <Path
                      d={netPath}
                      fill="none"
                      stroke={theme.colors.primary}
                      strokeWidth={chartViewMode === 'net' ? 3 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={chartViewMode === 'all' ? '5,4' : undefined}
                    />
                  ) : null}

                  {/* Selected point crosshair & glowing dots */}
                  {selectedChartIdx !== null && (
                    <>
                      <Line
                        x1={toX(selectedChartIdx)} y1={padTop}
                        x2={toX(selectedChartIdx)} y2={chartH - padBot}
                        stroke={theme.colors.primary}
                        strokeWidth={1}
                        strokeDasharray="3,3"
                      />
                      {(chartViewMode === 'all' || chartViewMode === 'income') && (
                        <Circle cx={toX(selectedChartIdx)} cy={toY(incomes[selectedChartIdx])} r={5} fill="#FFFFFF" stroke={theme.colors.income} strokeWidth={2.5} />
                      )}
                      {(chartViewMode === 'all' || chartViewMode === 'expense') && (
                        <Circle cx={toX(selectedChartIdx)} cy={toY(expenses[selectedChartIdx])} r={5} fill="#FFFFFF" stroke={theme.colors.danger} strokeWidth={2.5} />
                      )}
                      {(chartViewMode === 'all' || chartViewMode === 'net') && (
                        <Circle cx={toX(selectedChartIdx)} cy={toY(nets[selectedChartIdx])} r={5} fill="#FFFFFF" stroke={theme.colors.primary} strokeWidth={2.5} />
                      )}
                    </>
                  )}

                  {/* Month X-Axis Labels */}
                  {pts.map((row, i) => {
                    const step = Math.ceil(n / 6);
                    if (i % step !== 0 && i !== n - 1) return null;
                    return (
                      <SvgText
                        key={row.key}
                        x={toX(i)}
                        y={chartH - 8}
                        fontSize={9.5}
                        fill={selectedChartIdx === i ? theme.colors.text : theme.colors.textMuted}
                        textAnchor="middle"
                        fontWeight={selectedChartIdx === i ? '800' : '600'}
                      >
                        {format(new Date(row.key), 'MMM')}
                      </SvgText>
                    );
                  })}
                </Svg>

                {/* Tap Zones for Interactive Touch Scrubbing */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
                  {pts.map((_, i) => (
                    <Pressable
                      key={i}
                      style={{ flex: 1, height: '100%' }}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                        setSelectedChartIdx((prev) => (prev === i ? null : i));
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Bottom Summary Metrics Row */}
            <View style={{ height: 1, backgroundColor: theme.colors.border }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={15} color={theme.colors.income} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textMuted }}>
                  {t('pl_income') || 'Total Income'}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.income }}>
                {formatMoney(totalIncome, currency, isPrivacyMode)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TrendingDown size={15} color={theme.colors.danger} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textMuted }}>
                  {t('pl_expense') || 'Total Expense'}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.danger }}>
                {formatMoney(totalExpense, currency, isPrivacyMode)}
              </Text>
            </View>

            <View style={{ height: 1, backgroundColor: theme.colors.border }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.colors.text }}>
                {isProfit ? t('pl_profit') || 'Net Profit' : t('pl_loss') || 'Net Loss'}
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '900', color: isProfit ? theme.colors.income : theme.colors.danger }}>
                {isProfit ? '+' : '−'}{formatMoney(Math.abs(netResult), currency, isPrivacyMode)}
              </Text>
            </View>
          </Card>
        );
      })()}

      {/* ── 4. MONTHLY BUDGET + SET BUDGET BUTTON ── */}
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Wallet size={16} color={theme.colors.primary} />
            <Text variant="label" style={{ fontSize: 12 }}>
              {t('pl_monthly_budget') || 'Monthly Budget'}
            </Text>
          </View>
          <Text variant="caption" muted style={{ fontSize: 11 }}>
            {t('pl_cycle') || 'Cycle'}: {cycleLabel}
          </Text>
        </View>

        {/* Inline budget editor: amount input with the save button on its right */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            value={budgetInput}
            onChangeText={(v) => setBudgetInput(v.replace(/[^0-9.]/g, ''))}
            placeholder={monthlyBudget > 0 ? String(monthlyBudget) : 'e.g. 14000'}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numeric"
            style={{
              flex: 1,
              height: 48,
              borderRadius: theme.radius.md,
              borderWidth: 1.5,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
              paddingHorizontal: 14,
              fontSize: 16,
              fontWeight: '700',
              color: theme.colors.text,
            }}
          />
          <Pressable
            onPress={() => void handleSaveBudget()}
            disabled={savingBudget}
            style={({ pressed }) => ({
              height: 48,
              paddingHorizontal: 14,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || savingBudget ? 0.85 : 1,
            })}
          >
            <Text
              style={{ fontWeight: '800', color: '#FFFFFF', fontSize: 12.5 }}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={1}
            >
              {savingBudget ? t('common_saving') || 'Saving...' : t('pl_set_budget') || 'Set Monthly Budget'}
            </Text>
          </Pressable>
        </View>
      </Card>

      {/* ── 4B. EXECUTIVE PAYCHECK & BUDGET CYCLE CARD ── */}
      <Card style={{ padding: 16, gap: 14 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, flexShrink: 1 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Calendar size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, flexShrink: 1 }}>
              <Text
                variant="label"
                style={{ fontSize: 14, fontWeight: '800', lineHeight: 18, includeFontPadding: false }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Paycheck & Budget Cycle
              </Text>
              <Text
                variant="caption"
                muted
                style={{ fontSize: 11, lineHeight: 14, includeFontPadding: false }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Custom month start & end days
              </Text>
            </View>
          </View>

          {Boolean(activeCycleRangeText) && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5',
                flexShrink: 0,
                maxWidth: '45%',
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: '800', color: theme.colors.primary, textAlign: 'right', includeFontPadding: false }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                Active: {activeCycleRangeText}
              </Text>
            </View>
          )}
        </View>

        {/* Success Confirmation Toast Banner */}
        {cycleSuccessMsg && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: theme.radius.md,
              backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
              borderWidth: 1.5,
              borderColor: theme.colors.income,
            }}
          >
            <CheckCircle2 size={18} color={theme.colors.income} />
            <Text
              style={{ flex: 1, fontSize: 12, fontWeight: '800', color: theme.colors.income, includeFontPadding: false }}
              numberOfLines={2}
            >
              {cycleSuccessMsg}
            </Text>
          </View>
        )}

        {/* Budget Save Success Toast */}
        {budgetSuccessMsg && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: theme.radius.md,
              backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
              borderWidth: 1.5,
              borderColor: theme.colors.primary,
            }}
          >
            <CheckCircle2 size={18} color={theme.colors.primary} />
            <Text
              style={{ flex: 1, fontSize: 12, fontWeight: '800', color: theme.colors.primary, includeFontPadding: false }}
              numberOfLines={2}
            >
              {budgetSuccessMsg}
            </Text>
          </View>
        )}

        {/* Two Professional Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Button 1: Calendar Range Picker */}
          <Pressable
            onPress={() => {
              setCycleCalendarMode('range');
              setCycleCalendarOpen(true);
            }}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 44,
              paddingHorizontal: 8,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <CalendarDays size={15} color="#FFFFFF" />
            <Text
              style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF', includeFontPadding: false }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              Pick on Calendar
            </Text>
          </Pressable>

          {/* Button 2: Configure Days Modal Trigger */}
          <Pressable
            onPress={() => {
              setModalStartDay(String(cycleStartDay));
              setModalEndDay(cycleEndDay !== null ? String(cycleEndDay) : '');
              setCycleSettingsOpen(true);
            }}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 44,
              paddingHorizontal: 8,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Sliders size={15} color={theme.colors.text} />
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text, includeFontPadding: false }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              Configure Days
            </Text>
          </Pressable>
        </View>
      </Card>

      {/* ── 5. MONTH-BY-MONTH BREAKDOWN ── */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
            {t('pl_month_by_month') || 'Month by Month'}
          </Text>
          {monthRows.length > 0 && (
            <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '700', includeFontPadding: false }}>
              {monthRows.length} {monthRows.length === 1 ? 'cycle' : 'cycles'} total
            </Text>
          )}
        </View>

        {hasData ? (
          paginatedMonthRows.map(renderMonthRow)
        ) : (
          <EmptyState
            icon={Scale}
            title={t('pl_empty_title') || 'No transactions'}
            message={t('pl_empty_message') || 'There are no income or expenses in the selected period.'}
          />
        )}

        {/* Executive Pagination Control Bar */}
        {monthRows.length > ITEMS_PER_PAGE && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginTop: 4,
            }}
          >
            <View style={{ gap: 2, flex: 1, flexShrink: 1 }}>
              <Text
                style={{ fontSize: 12, fontWeight: '800', color: theme.colors.text, includeFontPadding: false }}
                numberOfLines={1}
              >
                Page {currentPage} of {totalPages}
              </Text>
              <Text
                style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, includeFontPadding: false }}
                numberOfLines={1}
              >
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, monthRows.length)} of {monthRows.length}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Pressable
                onPress={() => {
                  if (currentPage > 1) {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                    setCurrentPage((p) => Math.max(1, p - 1));
                  }
                }}
                disabled={currentPage === 1}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: currentPage === 1 ? 0.35 : pressed ? 0.75 : 1,
                })}
              >
                <ChevronLeft size={14} color={theme.colors.text} />
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.colors.text, includeFontPadding: false }}>
                  Prev
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (currentPage < totalPages) {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                  }
                }}
                disabled={currentPage === totalPages}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: currentPage === totalPages ? 0.35 : pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.colors.text, includeFontPadding: false }}>
                  Next
                </Text>
                <ChevronRight size={14} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* ── MODALS ── */}
      <CalendarModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        initialRange={range}
        onApply={(applied) => {
          if (applied.startDate) setRange(applied);
          setCalendarOpen(false);
        }}
      />

      {/* Cycle Start/End Date Calendar Picker Modal */}
      <CalendarModal
        visible={cycleCalendarOpen}
        mode={cycleCalendarMode === 'range' ? 'range' : 'single'}
        onClose={() => setCycleCalendarOpen(false)}
        initialRange={{
          startDate: activeCycle.from,
          endDate: activeCycle.to,
        }}
        onApply={handleCalendarApply}
      />

      {/* ── CYCLE SETTINGS MODAL DIALOG ── */}
      <Modal
        visible={cycleSettingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCycleSettingsOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          onPress={() => setCycleSettingsOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 20,
              gap: 16,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 25,
            }}
          >
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sliders size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }}>
                    Paycheck Cycle Settings
                  </Text>
                  <Text style={{ fontSize: 11.5, color: theme.colors.textMuted }}>
                    Set custom start & end days of the month
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setCycleSettingsOpen(false)}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <View style={{ height: 1, backgroundColor: theme.colors.border }} />

            {/* Quick Preset Selector */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
                Quick Salary Presets
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {[
                  { start: '1', end: '', label: '1st (Default Calendar Month)' },
                  { start: '25', end: '', label: '25th Salary Cycle' },
                  { start: '28', end: '', label: '28th Salary Cycle' },
                  { start: '29', end: '', label: '29th Salary Cycle' },
                  { start: '30', end: '', label: '30th Salary Cycle' },
                  { start: '31', end: '', label: '31st Salary Cycle' },
                ].map((preset) => {
                  const isActive = modalStartDay === preset.start && modalEndDay === preset.end;
                  return (
                    <Pressable
                      key={preset.label}
                      onPress={() => {
                        setModalStartDay(preset.start);
                        setModalEndDay(preset.end);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: theme.radius.sm,
                        backgroundColor: isActive
                          ? theme.colors.primary
                          : theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: isActive ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isActive ? '800' : '600',
                          color: isActive ? '#FFFFFF' : theme.colors.text,
                        }}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Dual Inputs */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {/* Start Day Input */}
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                  Start Day (1–31)
                </Text>
                <TextInput
                  value={modalStartDay}
                  onChangeText={(v) => setModalStartDay(v.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 29"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={{
                    height: 46,
                    borderRadius: theme.radius.md,
                    borderWidth: 1.5,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceElevated,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    fontWeight: '700',
                    color: theme.colors.text,
                  }}
                />
              </View>

              {/* End Day Input */}
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                  End Day (1–31 or Auto)
                </Text>
                <TextInput
                  value={modalEndDay}
                  onChangeText={(v) => setModalEndDay(v.replace(/[^0-9]/g, ''))}
                  placeholder="Auto (Blank)"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={{
                    height: 46,
                    borderRadius: theme.radius.md,
                    borderWidth: 1.5,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceElevated,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    fontWeight: '700',
                    color: theme.colors.text,
                  }}
                />
              </View>
            </View>

            <Text variant="caption" muted style={{ fontSize: 11, lineHeight: 15 }}>
              Leave End Day blank for automatic calculation (day before next start date).
            </Text>

            {/* Modal Actions */}
            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
              <Pressable
                onPress={() => setCycleSettingsOpen(false)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontWeight: '700', color: theme.colors.text, fontSize: 13 }}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const startNum = Number(modalStartDay.trim());
                  if (!startNum || startNum < 1 || startNum > 31) {
                    Alert.alert('Invalid Start Day', 'Please enter a day between 1 and 31.');
                    return;
                  }
                  let endNum: number | null = null;
                  if (modalEndDay.trim()) {
                    const parsedEnd = Number(modalEndDay.trim());
                    if (parsedEnd >= 1 && parsedEnd <= 31) {
                      endNum = parsedEnd;
                    } else {
                      Alert.alert('Invalid End Day', 'Please enter an end day between 1 and 31 or leave blank for Auto.');
                      return;
                    }
                  }
                  void handleSetCycleWindow(startNum, endNum);
                  setCycleSettingsOpen(false);
                }}
                disabled={updatingCycle}
                style={({ pressed }) => ({
                  flex: 1.5,
                  height: 46,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.primary,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: pressed || updatingCycle ? 0.85 : 1,
                })}
              >
                {updatingCycle && <ActivityIndicator size="small" color="#FFFFFF" />}
                <Text style={{ fontWeight: '800', color: '#FFFFFF', fontSize: 13 }}>
                  {updatingCycle ? 'Saving...' : 'Save Cycle Settings'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
