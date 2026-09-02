import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StatusBar,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Receipt,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Wallet,
  X,
} from 'lucide-react-native';
import {
  endOfWeek,
  format,
  isToday as isTodayFn,
  isYesterday as isYesterdayFn,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { ExpenseItem } from '@/components/expense/ExpenseItem';
import { buildRateResolver, RateResolver } from '@/services/exchange';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CalendarModal, DateRange } from '@/components/ui/CalendarModal';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/ui/PressableScale';
import { Select } from '@/components/ui/Select';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SORT_OPTIONS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { exportCsv, exportExcel, exportPdf } from '@/services/export';
import { Category, Expense, SortKey } from '@/types';
import { currentMonthRange, getCycleLabel, formatMoney } from '@/utils/format';

type HistoryPeriod = 'all' | 'today' | 'week' | 'month' | 'custom';

export default function HistoryScreen() {
  const { profile, session, refreshProfile } = useAuth();
  const { convert } = useExchangeRates();
  const { t, language } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [period, setPeriod] = useState<HistoryPeriod>('month');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Pagination state (1-indexed for user display)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const listRef = useRef<SectionList>(null);
  const timeframeBtnRef = useRef<View>(null);
  const categoryBtnRef = useRef<View>(null);
  const sortBtnRef = useRef<View>(null);
  const [timeframePos, setTimeframePos] = useState<{ top: number; left?: number; right?: number }>({ top: 240, left: 16 });
  const [categoryPos, setCategoryPos] = useState<{ top: number; left?: number; right?: number }>({ top: 240, left: 60 });
  const [sortPos, setSortPos] = useState<{ top: number; left?: number; right?: number }>({ top: 240, right: 16 });

  const getModalTop = (y: number, h: number) => {
    const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
    return y - statusBarHeight + h + 6;
  };

  const updateTimeframePos = useCallback(() => {
    timeframeBtnRef.current?.measureInWindow((x, y, w, h) => {
      if (y > 0) {
        // Right-align popover to its own button's right edge inside the mirror anchor box
        const right = Math.max(0, Dimensions.get('window').width - theme.spacing.lg - (x + w));
        setTimeframePos({ top: getModalTop(y, h), right });
      }
    });
  }, [theme.spacing.lg]);

  const updateCategoryPos = useCallback(() => {
    categoryBtnRef.current?.measureInWindow((x, y, w, h) => {
      if (y > 0) {
        // Right-align popover to its own button's right edge inside the mirror anchor box
        const right = Math.max(0, Dimensions.get('window').width - theme.spacing.lg - (x + w));
        setCategoryPos({ top: getModalTop(y, h), right });
      }
    });
  }, [theme.spacing.lg]);

  const updateSortPos = useCallback(() => {
    sortBtnRef.current?.measureInWindow((x, y, w, h) => {
      if (y > 0) {
        // Right-align popover to its own button's right edge inside the mirror anchor box
        const right = Math.max(0, Dimensions.get('window').width - theme.spacing.lg - (x + w));
        setSortPos({ top: getModalTop(y, h), right });
      }
    });
  }, [theme.spacing.lg]);

  const handleOpenPopover = useCallback((type: 'period' | 'category' | 'sort') => {
    if (type === 'period') {
      updateTimeframePos();
      setCategoryModalOpen(false);
      setFiltersOpen(false);
      setPeriodModalOpen((prev) => !prev);
    } else if (type === 'category') {
      updateCategoryPos();
      setFiltersOpen(false);
      setPeriodModalOpen(false);
      setCategoryModalOpen((prev) => !prev);
    } else {
      updateSortPos();
      setCategoryModalOpen(false);
      setPeriodModalOpen(false);
      setFiltersOpen((prev) => !prev);
    }
  }, [updateTimeframePos, updateCategoryPos, updateSortPos]);

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  useEffect(() => {
    setCurrentPage(1);
  }, [search, period, customRange, selectedCategoryId, sort, pageSize, typeFilter]);

  useEffect(() => {
    if (profile?.id) {
      listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
    }
  }, [profile?.id]);

  const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';
  const cycleMonthLabel = getCycleLabel(profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null, locale);

  const PERIOD_CHIPS: { label: string; value: HistoryPeriod }[] = [
    { label: t('history_period_all') || 'All Time', value: 'all' },
    { label: t('history_period_today') || 'Today', value: 'today' },
    { label: t('history_period_week') || 'This Week', value: 'week' },
    { label: cycleMonthLabel, value: 'month' },
    { label: t('history_period_custom') || 'Custom 📅', value: 'custom' },
  ];

  // Compute date range based on selected period
  const dateRange = useMemo(() => {
    const today = new Date();
    switch (period) {
      case 'today':
        return {
          fromDate: format(today, 'yyyy-MM-dd'),
          toDate: format(today, 'yyyy-MM-dd'),
        };
      case 'week':
        return {
          fromDate: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          toDate: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
      case 'month': {
        const { from, to } = currentMonthRange(profile?.cycle_start_day ?? 1, profile?.cycle_end_day ?? null);
        return {
          fromDate: from,
          toDate: to,
        };
      }
      case 'custom':
        return {
          fromDate: customRange.startDate || undefined,
          toDate: customRange.endDate || customRange.startDate || undefined,
        };
      case 'all':
      default:
        return { fromDate: undefined, toDate: undefined };
    }
  }, [period, customRange]);

  const filters = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      // Load the FULL filtered set in one query: the summary card (Total
      // Outflow/Inflow, Peak, entry count) and exports must reflect every
      // matching transaction, not just the first server page. The list UI
      // still paginates client-side via paginatedItems.
      fetchAll: true,
    }),
    [debouncedSearch, dateRange.fromDate, dateRange.toDate],
  );

  const expenses = useExpenses(profile?.id ?? session?.user?.id, filters, sort);

  useFocusEffect(
    useCallback(() => {
      void expenses.refresh();
      if (profile?.id) {
        listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
      }
    }, [expenses.refresh, profile?.id]),
  );

  // Filter by category and transaction type in-memory
  const filteredExpenses = useMemo(() => {
    return expenses.items.filter((item) => {
      if (selectedCategoryId && item.category_id !== selectedCategoryId) return false;
      if (typeFilter === 'expense' && item.type === 'income') return false;
      if (typeFilter === 'income' && item.type !== 'income') return false;
      return true;
    });
  }, [expenses.items, selectedCategoryId, typeFilter]);

  const [rateResolver, setRateResolver] = useState<RateResolver | null>(null);

  useEffect(() => {
    let cancelled = false;
    buildRateResolver(filteredExpenses, preferredCurrency)
      .then((resolver) => {
        if (!cancelled) setRateResolver(resolver);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [filteredExpenses, preferredCurrency]);

  // Every expense converts at its own transaction date, never today's rate
  const convertAtDate = useCallback(
    (expense: Expense) => {
      if (rateResolver) {
        return rateResolver.convert(Number(expense.amount), expense.currency || 'NPR', preferredCurrency, expense.date);
      }
      return convert(Number(expense.amount), expense.currency || 'NPR', preferredCurrency);
    },
    [rateResolver, convert, preferredCurrency],
  );

  // Per-row converted amounts, computed once per (data, rate) change — list
  // rows, section totals and the summary all reuse these values.
  const displayAmounts = useMemo(() => {
    const map = new Map<string, number>();
    filteredExpenses.forEach((item) => map.set(item.id, convertAtDate(item)));
    return map;
  }, [filteredExpenses, convertAtDate]);

  // Stable delete callback so memoized ExpenseItem rows can bail out of
  // parent-driven re-renders.
  const handleDeleteExpense = useCallback(
    (expense: Expense) => {
      void expenses.remove(expense.id);
    },
    [expenses.remove],
  );

  const renderExpenseItem = useCallback(
    ({ item }: { item: Expense }) => (
      <ExpenseItem expense={item} displayAmount={displayAmounts.get(item.id)} onDelete={handleDeleteExpense} />
    ),
    [displayAmounts, handleDeleteExpense],
  );

  // Total summary of all matching expenses (reuses the per-row converted values)
  const totalAmount = useMemo(
    () => filteredExpenses.reduce((sum, item) => sum + convertAtDate(item), 0),
    [filteredExpenses, convertAtDate],
  );

  // Highest single expense
  const highestSingleSpend = useMemo(() => {
    if (filteredExpenses.length === 0) return 0;
    return filteredExpenses.reduce((max, e) => Math.max(max, Number(e.amount)), 0);
  }, [filteredExpenses]);

  // Reset to page 1 whenever filters, search, or category changes
  const handleSearchChange = (text: string) => {
    setSearch(text);
    setCurrentPage(1);
    // The input stays instant; the network filter updates 300ms after typing
    // stops so every keystroke doesn't fire a fresh server query.
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (text === '') {
      setDebouncedSearch('');
      return;
    }
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  };

  const handlePeriodChange = (nextPeriod: HistoryPeriod) => {
    setPeriodModalOpen(false);
    if (nextPeriod === 'custom') {
      setPeriod('custom');
      setCalendarOpen(true);
    } else {
      setPeriod(nextPeriod);
    }
    setCurrentPage(1);
  };

  const handleCategorySelect = (catId: string | null) => {
    setSelectedCategoryId(catId);
    setCurrentPage(1);
  };

  // Pagination slice calculations
  const totalItems = filteredExpenses.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredExpenses.slice(startIndex, startIndex + pageSize);
  }, [filteredExpenses, safeCurrentPage, pageSize]);

  // Group the current page's expenses by date for sleek SectionList headers
  const groupedSections = useMemo(() => {
    const groups: { [dateStr: string]: { title: string; total: number; data: Expense[] } } = {};

    paginatedItems.forEach((item) => {
      const rawDate = item.date ? item.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      if (!groups[rawDate]) {
        let title = rawDate;
        try {
          const parsed = parseISO(rawDate);
          if (isTodayFn(parsed)) {
            title = `${t('history_section_today') || 'Today'} · ${format(parsed, 'MMM d')}`;
          } else if (isYesterdayFn(parsed)) {
            title = `${t('history_section_yesterday') || 'Yesterday'} · ${format(parsed, 'MMM d')}`;
          } else {
            title = format(parsed, 'EEEE, MMM d, yyyy');
          }
        } catch {
          title = rawDate;
        }

        groups[rawDate] = { title, total: 0, data: [] };
      }

      groups[rawDate].data.push(item);
      groups[rawDate].total += displayAmounts.get(item.id) ?? 0;
    });

    return Object.keys(groups).map((key) => groups[key]);
  }, [paginatedItems, t, displayAmounts]);

  const goToPage = (pageNumber: number) => {
    const clamped = Math.max(1, Math.min(pageNumber, totalPages));
    setCurrentPage(clamped);
    listRef.current?.scrollToLocation({
      sectionIndex: 0,
      itemIndex: 0,
      animated: true,
      viewOffset: 0,
    });
  };

  const formattedCustomLabel = useMemo(() => {
    if (!customRange.startDate) return t('history_period_custom') || 'Custom';
    if (!customRange.endDate || customRange.startDate === customRange.endDate) {
      try {
        return format(parseISO(customRange.startDate), 'MMM d');
      } catch {
        return customRange.startDate;
      }
    }
    try {
      return `${format(parseISO(customRange.startDate), 'MMM d')} - ${format(parseISO(customRange.endDate), 'MMM d')}`;
    } catch {
      return `${customRange.startDate} - ${customRange.endDate}`;
    }
  }, [customRange, t]);

  const activeChipLabel = useCallback(
    (p: HistoryPeriod) => {
      if (p === 'custom' && customRange.startDate) return formattedCustomLabel;
      return PERIOD_CHIPS.find((c) => c.value === p)?.label || t('history_period_all') || 'All Time';
    },
    [customRange.startDate, formattedCustomLabel, PERIOD_CHIPS, t],
  );

  const startItemNum = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItemNum = Math.min(safeCurrentPage * pageSize, totalItems);

  async function handleExport(type: 'pdf' | 'excel' | 'csv') {
    setExporting(type);
    try {
      if (type === 'pdf') {
        await exportPdf(filteredExpenses, profile ?? null, preferredCurrency);
      } else if (type === 'excel') {
        await exportExcel(filteredExpenses, preferredCurrency);
      } else {
        await exportCsv(filteredExpenses);
      }
      setExportModalOpen(false);
    } catch (err) {
      // Handled in export service
    } finally {
      setExporting(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ── TOP HEADER & CONTROLS CONTAINER (ELEVATED Z-INDEX FOR IN-PLACE DROPDOWNS) ── */}
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: 6,
          gap: 10,
          zIndex: 5000,
          position: 'relative',
          backgroundColor: theme.colors.background,
        }}
      >
        {/* ── 1. TOP APP BAR ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <Text
              variant="caption"
              style={{
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 1.1,
                fontSize: 11,
                color: theme.colors.textMuted,
              }}
            >
              All Transactions
            </Text>
            <Text
              variant="h1"
              style={{
                fontWeight: '800',
                fontSize: 28,
                letterSpacing: -0.5,
                color: theme.colors.text,
              }}
              numberOfLines={1}
            >
              {t('history_title') || 'History'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Export Shortcut Button (Prominent & Easy to Tap) */}
            <Pressable
              onPress={() => setExportModalOpen(true)}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: theme.radius.full,
                backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.1)',
                borderWidth: 1.5,
                borderColor: theme.colors.primary,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Download size={14} color={theme.colors.primary} />
              <Text style={{ fontWeight: '800', color: theme.colors.primary, fontSize: 12 }}>
                Export
              </Text>
            </Pressable>

            <PrivacyEyeButton />
            <ThemeToggle />
          </View>
        </View>

        {/* ── 2. CONSOLIDATED VAULT & FLOW CARD ── */}
        <Card
          style={{
            padding: 12,
            gap: 10,
            backgroundColor: theme.colors.surface,
            borderColor: theme.isDark ? 'rgba(129, 140, 248, 0.35)' : theme.colors.border,
            borderWidth: 1.5,
            borderRadius: 18,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: theme.isDark ? 0.2 : 0.05,
          }}
        >
          {/* Row 1: Subtitle & Badges */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Wallet size={14} color={theme.colors.primary} />
              <Text
                variant="caption"
                style={{
                  color: theme.colors.primary,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  fontSize: 11,
                }}
              >
                {typeFilter === 'income'
                  ? 'Total Inflow'
                  : typeFilter === 'expense'
                  ? 'Total Outflow'
                  : 'Cash Flow'}{' '}
                · {activeChipLabel(period)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 7,
                  paddingVertical: 2.5,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Receipt size={10} color={theme.colors.primary} />
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: theme.colors.text }}>
                  {totalItems} {totalItems === 1 ? 'entry' : 'entries'}
                </Text>
              </View>

              {selectedCategoryId ? (
                <Pressable
                  onPress={() => setSelectedCategoryId(null)}
                  style={{
                    paddingHorizontal: 7,
                    paddingVertical: 2.5,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.colors.primary,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }}>
                    Filtered ✕
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Row 2: Amount & Peak */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 26,
                lineHeight: 30,
                fontWeight: '900',
                color:
                  typeFilter === 'income'
                    ? theme.colors.income
                    : typeFilter === 'expense'
                    ? (theme.isDark ? '#EF4444' : '#DC2626')
                    : theme.colors.text,
                fontVariant: ['tabular-nums'],
                letterSpacing: -0.5,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(totalAmount, preferredCurrency)}
            </Text>

            {highestSingleSpend > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
                  borderWidth: 1,
                  borderColor: theme.isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.25)',
                }}
              >
                <Sparkles size={11} color="#F59E0B" />
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.colors.textMuted }}>
                  Peak:{' '}
                  <Text style={{ fontWeight: '800', color: theme.isDark ? '#FCD34D' : '#D97706' }}>
                    {formatMoney(highestSingleSpend, preferredCurrency)}
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>

          {/* Row 3: Integrated 3-Way Flow Switcher inside the card */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: theme.colors.surfaceElevated,
              padding: 2.5,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.colors.border,
              height: 38,
              alignItems: 'center',
            }}
          >
            <Pressable
              onPress={() => setTypeFilter('all')}
              style={{
                flex: 1,
                height: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                backgroundColor: typeFilter === 'all' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: typeFilter === 'all' ? '#FFFFFF' : theme.colors.textMuted,
                }}
              >
                All Flow
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setTypeFilter('expense')}
              style={{
                flex: 1,
                height: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                borderRadius: 8,
                backgroundColor:
                  typeFilter === 'expense'
                    ? (theme.isDark ? '#EF4444' : '#DC2626')
                    : 'transparent',
              }}
            >
              <ArrowDownRight
                size={13}
                color={typeFilter === 'expense' ? '#FFFFFF' : theme.colors.textMuted}
                strokeWidth={2.5}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: typeFilter === 'expense' ? '#FFFFFF' : theme.colors.textMuted,
                }}
              >
                Expenses
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setTypeFilter('income')}
              style={{
                flex: 1,
                height: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                borderRadius: 8,
                backgroundColor:
                  typeFilter === 'income' ? theme.colors.income : 'transparent',
              }}
            >
              <ArrowUpRight
                size={13}
                color={typeFilter === 'income' ? '#FFFFFF' : theme.colors.textMuted}
                strokeWidth={2.5}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: typeFilter === 'income' ? '#FFFFFF' : theme.colors.textMuted,
                }}
              >
                Income
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* ── 3. SEARCH & FILTERS TOOLBAR (WITH IN-PLACE FLOATING DROPDOWNS) ── */}
        <View style={{ zIndex: 6000, position: 'relative' }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', position: 'relative', zIndex: 6002 }}>
            {/* Search Box */}
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.colors.surfaceElevated,
                borderRadius: theme.radius.md,
                paddingHorizontal: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
                height: 40,
              }}
            >
              <Search size={14} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                value={search}
                onChangeText={handleSearchChange}
                placeholder={t('history_search_placeholder') || 'Search...'}
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: theme.colors.text,
                  paddingVertical: 0,
                }}
              />
              {search ? (
                <Pressable
                  onPress={() => handleSearchChange('')}
                  hitSlop={8}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: theme.colors.textMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={11} color="#FFFFFF" />
                </Pressable>
              ) : null}
            </View>

            {/* 1. Timeframe Icon Button */}
            {(() => {
              const isPeriodActive = period !== 'all';
              return (
                <View ref={timeframeBtnRef} collapsable={false} onLayout={updateTimeframePos} style={{ position: 'relative' }}>
                  <PressableScale
                    onPress={() => handleOpenPopover('period')}
                    activeScale={0.92}
                    style={{
                      width: 40,
                      height: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radius.md,
                      backgroundColor: isPeriodActive || periodModalOpen
                        ? theme.isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.12)'
                        : theme.colors.surfaceElevated,
                      borderWidth: 1.5,
                      borderColor: isPeriodActive || periodModalOpen ? theme.colors.primary : theme.colors.border,
                      position: 'relative',
                    }}
                  >
                    <Calendar size={16} color={isPeriodActive || periodModalOpen ? theme.colors.primary : theme.colors.textMuted} />
                    {isPeriodActive && !periodModalOpen ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 5,
                          right: 5,
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: theme.colors.primary,
                        }}
                      />
                    ) : null}
                  </PressableScale>
                </View>
              );
            })()}

            {/* 2. Category Icon Button */}
            {(() => {
              const selectedCat = categories.find((c) => c.id === selectedCategoryId);
              return (
                <View ref={categoryBtnRef} collapsable={false} onLayout={updateCategoryPos} style={{ position: 'relative' }}>
                  {selectedCat ? (
                    <PressableScale
                      onPress={() => handleOpenPopover('category')}
                      activeScale={0.92}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 10,
                        height: 40,
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.12)',
                        borderWidth: 1.5,
                        borderColor: theme.colors.primary,
                      }}
                    >
                      <CategoryIcon name={selectedCat.icon} size={15} color={theme.colors.primary} />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: theme.colors.primary,
                          maxWidth: 75,
                        }}
                        numberOfLines={1}
                      >
                        {selectedCat.name}
                      </Text>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleCategorySelect(null);
                        }}
                        hitSlop={8}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: theme.colors.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={10} color="#FFFFFF" />
                      </Pressable>
                    </PressableScale>
                  ) : (
                    <PressableScale
                      onPress={() => handleOpenPopover('category')}
                      activeScale={0.92}
                      style={{
                        width: 40,
                        height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: theme.radius.md,
                        backgroundColor: categoryModalOpen
                          ? theme.isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.12)'
                          : theme.colors.surfaceElevated,
                        borderWidth: 1.5,
                        borderColor: categoryModalOpen ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Tag size={16} color={categoryModalOpen ? theme.colors.primary : theme.colors.textMuted} />
                    </PressableScale>
                  )}
                </View>
              );
            })()}

            {/* 3. Sort Icon Button */}
            {(() => {
              const isSortActive = sort !== 'date_desc';
              return (
                <View ref={sortBtnRef} collapsable={false} onLayout={updateSortPos} style={{ position: 'relative' }}>
                  <PressableScale
                    onPress={() => handleOpenPopover('sort')}
                    activeScale={0.92}
                    style={{
                      width: 40,
                      height: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radius.md,
                      backgroundColor: isSortActive || filtersOpen
                        ? theme.isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.12)'
                        : theme.colors.surfaceElevated,
                      borderWidth: 1.5,
                      borderColor: isSortActive || filtersOpen ? theme.colors.primary : theme.colors.border,
                      position: 'relative',
                    }}
                  >
                    <ArrowUpDown size={16} color={isSortActive || filtersOpen ? theme.colors.primary : theme.colors.textMuted} />
                    {isSortActive && !filtersOpen ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 5,
                          right: 5,
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: theme.colors.primary,
                        }}
                      />
                    ) : null}
                  </PressableScale>
                </View>
              );
            })()}
          </View>
        </View>

        {/* ── FLOATING IN-PLACE POPOVER MENUS (LAYOUT MIRROR CONTAINER FOR EXACT ANDROID & WEB POSITIONING) ── */}
        <Modal
          visible={categoryModalOpen || periodModalOpen || filtersOpen}
          transparent
          animationType="none"
          onRequestClose={() => {
            setCategoryModalOpen(false);
            setPeriodModalOpen(false);
            setFiltersOpen(false);
          }}
        >
          <Pressable
            onPress={() => {
              setCategoryModalOpen(false);
              setPeriodModalOpen(false);
              setFiltersOpen(false);
            }}
            style={{ flex: 1, backgroundColor: 'transparent' }}
          >
            <View
              pointerEvents="box-none"
              style={{
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.lg,
                paddingBottom: 6,
                gap: 10,
              }}
            >
              {/* Top Header Bar Spacer */}
              <View pointerEvents="none" style={{ height: 44, marginTop: 4 }} />

              {/* Vault & Flow Card Spacer */}
              <Card
                pointerEvents="none"
                style={{
                  padding: 12,
                  gap: 10,
                  opacity: 0,
                }}
              >
                <View style={{ height: 120 }} />
              </Card>

              {/* Toolbar Anchor Box */}
              <View pointerEvents="box-none" style={{ height: 40, position: 'relative' }}>
                {/* Timeframe Popover */}
                {periodModalOpen && (
                  <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: 50,
                      right: timeframePos.right ?? 0,
                      width: 190,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 16,
                      borderWidth: 1.2,
                      borderColor: theme.colors.border,
                      padding: 6,
                      gap: 2,
                      elevation: 25,
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.25,
                      shadowRadius: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: theme.colors.textMuted,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      Timeframe
                    </Text>
                    {PERIOD_CHIPS.map((chip) => {
                      const isSelected = period === chip.value;
                      return (
                        <Pressable
                          key={chip.value}
                          onPress={() => {
                            handlePeriodChange(chip.value);
                            if (chip.value !== 'custom') setPeriodModalOpen(false);
                          }}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 9,
                            backgroundColor: isSelected
                              ? theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)'
                              : 'transparent',
                            opacity: pressed ? 0.75 : 1,
                          })}
                        >
                          <Text
                            style={{
                              fontSize: 12.5,
                              fontWeight: isSelected ? '800' : '600',
                              color: isSelected ? theme.colors.primary : theme.colors.text,
                            }}
                          >
                            {chip.value === 'custom' && customRange.startDate ? formattedCustomLabel : chip.label}
                          </Text>
                          {isSelected && <Check size={14} color={theme.colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </Pressable>
                )}

                {/* Category Popover (Scrollable on Android & iOS) */}
                {categoryModalOpen && (
                  <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: 50,
                      right: categoryPos.right ?? 0,
                      width: 220,
                      maxHeight: 280,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 16,
                      borderWidth: 1.2,
                      borderColor: theme.colors.border,
                      padding: 6,
                      elevation: 25,
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.25,
                      shadowRadius: 10,
                    }}
                  >
                    <ScrollView
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                      bounces={true}
                      style={{ maxHeight: 260 }}
                      contentContainerStyle={{ gap: 3, paddingVertical: 2 }}
                    >
                      {/* All Categories Option */}
                      <Pressable
                        onPress={() => {
                          handleCategorySelect(null);
                          setCategoryModalOpen(false);
                        }}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          borderRadius: 10,
                          backgroundColor: !selectedCategoryId
                            ? theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)'
                            : 'transparent',
                          opacity: pressed ? 0.75 : 1,
                        })}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <Tag size={14} color={!selectedCategoryId ? theme.colors.primary : theme.colors.textMuted} />
                          <Text
                            style={{
                              fontSize: 12.5,
                              fontWeight: !selectedCategoryId ? '800' : '600',
                              color: !selectedCategoryId ? theme.colors.primary : theme.colors.text,
                            }}
                          >
                            All Categories
                          </Text>
                        </View>
                        {!selectedCategoryId && <Check size={14} color={theme.colors.primary} />}
                      </Pressable>

                      {/* Category Items */}
                      {categories.map((cat) => {
                        const isSelected = selectedCategoryId === cat.id;
                        return (
                          <Pressable
                            key={cat.id}
                            onPress={() => {
                              handleCategorySelect(cat.id);
                              setCategoryModalOpen(false);
                            }}
                            style={({ pressed }) => ({
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              borderRadius: 10,
                              backgroundColor: isSelected
                                ? theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)'
                                : 'transparent',
                              opacity: pressed ? 0.75 : 1,
                            })}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                              <CategoryIcon
                                name={cat.icon}
                                size={14}
                                color={isSelected ? theme.colors.primary : theme.colors.text}
                              />
                              <Text
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: isSelected ? '800' : '600',
                                  color: isSelected ? theme.colors.primary : theme.colors.text,
                                }}
                                numberOfLines={1}
                              >
                                {cat.name}
                              </Text>
                            </View>
                            {isSelected && <Check size={14} color={theme.colors.primary} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </Pressable>
                )}

                {/* Sort Popover */}
                {filtersOpen && (
                  <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: 50,
                      right: sortPos.right ?? 0,
                      width: 200,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 16,
                      borderWidth: 1.2,
                      borderColor: theme.colors.border,
                      padding: 6,
                      gap: 2,
                      elevation: 25,
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.25,
                      shadowRadius: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: theme.colors.textMuted,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      Sort Order
                    </Text>

                    {SORT_OPTIONS.map((opt) => {
                      const isSelected = sort === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => {
                            setSort(opt.value as SortKey);
                            setCurrentPage(1);
                            setFiltersOpen(false);
                          }}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 9,
                            backgroundColor: isSelected
                              ? theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)'
                              : 'transparent',
                            opacity: pressed ? 0.75 : 1,
                          })}
                        >
                          <Text
                            style={{
                              fontSize: 12.5,
                              fontWeight: isSelected ? '800' : '600',
                              color: isSelected ? theme.colors.primary : theme.colors.text,
                            }}
                          >
                            {opt.label}
                          </Text>
                          {isSelected && <Check size={14} color={theme.colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </Pressable>
                )}
              </View>
            </View>
          </Pressable>
        </Modal>
      </View>

      {/* ── TRANSACTIONS LIST ── */}
      <SectionList
        ref={listRef}
        scrollEnabled={!categoryModalOpen && !filtersOpen && !periodModalOpen}
        sections={groupedSections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 130 }}
        refreshControl={
          <RefreshControl
            refreshing={expenses.refreshing}
            onRefresh={() => {
              void refreshProfile(true);
              void expenses.refresh(true);
            }}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: { title, total } }) => (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 4,
              marginTop: 10,
              marginBottom: 4,
            }}
          >
            <Text
              variant="caption"
              style={{
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: theme.colors.textMuted,
                fontSize: 11,
              }}
            >
              {title}
            </Text>
            <Text
              variant="caption"
              style={{
                fontWeight: '800',
                color: theme.colors.primary,
                fontSize: 12,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatMoney(total, preferredCurrency)}
            </Text>
          </View>
        )}
        renderItem={renderExpenseItem}
        ListEmptyComponent={
          expenses.loading ? (
            <View style={{ paddingVertical: theme.spacing['4xl'], alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <EmptyState
              icon={Search}
              title={t('history_no_transactions_title') || 'No Outflows Found'}
              message={
                search || selectedCategoryId || period !== 'all'
                  ? 'No transactions match your active filters. Try clearing your search.'
                  : t('history_no_transactions_message') || 'Start recording expenses by tapping +'
              }
            />
          )
        }
        ListFooterComponent={
          totalItems > 0 ? (
            <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
              {/* Pagination Controller Card */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: theme.colors.surfaceElevated,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: theme.radius.lg,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                {/* Previous Button */}
                <Pressable
                  disabled={safeCurrentPage <= 1}
                  onPress={() => goToPage(safeCurrentPage - 1)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: theme.radius.md,
                    backgroundColor: safeCurrentPage <= 1 ? 'transparent' : theme.colors.surface,
                    borderWidth: safeCurrentPage <= 1 ? 0 : 1,
                    borderColor: theme.colors.border,
                    opacity: safeCurrentPage <= 1 ? 0.35 : pressed ? 0.7 : 1,
                  })}
                >
                  <ChevronLeft size={16} color={theme.colors.text} />
                  <Text variant="caption" style={{ fontWeight: '700' }}>
                    Prev
                  </Text>
                </Pressable>

                {/* Page Indicator & Stats */}
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text variant="label" style={{ fontWeight: '800', fontSize: 13 }}>
                    Page {safeCurrentPage} of {totalPages}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Showing {startItemNum}–{endItemNum} of {totalItems}
                  </Text>
                </View>

                {/* Next Button */}
                <Pressable
                  disabled={safeCurrentPage >= totalPages}
                  onPress={() => goToPage(safeCurrentPage + 1)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: theme.radius.md,
                    backgroundColor: safeCurrentPage >= totalPages ? 'transparent' : theme.colors.surface,
                    borderWidth: safeCurrentPage >= totalPages ? 0 : 1,
                    borderColor: theme.colors.border,
                    opacity: safeCurrentPage >= totalPages ? 0.35 : pressed ? 0.7 : 1,
                  })}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>
                    Next
                  </Text>
                  <ChevronRight size={16} color={theme.colors.text} />
                </Pressable>
              </View>

              {/* Page Number Quick Jump Pills */}
              {totalPages > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, justifyContent: 'center', paddingHorizontal: 4 }}
                >
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => {
                    const isActive = pageNum === safeCurrentPage;
                    return (
                      <Pressable
                        key={pageNum}
                        onPress={() => goToPage(pageNum)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceElevated,
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
                          {pageNum}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>
          ) : null
        }
      />

      {/* ── CUSTOM DATE RANGE CALENDAR MODAL ── */}
      <CalendarModal
        visible={calendarOpen}
        onClose={() => {
          setCalendarOpen(false);
          setPeriodModalOpen(false);
        }}
        onApply={(range) => {
          setCustomRange(range);
          setCalendarOpen(false);
          setPeriodModalOpen(false);
          setCurrentPage(1);
        }}
        initialRange={customRange}
      />

      {/* ── EXPORT STATEMENT MODAL ── */}
      <Modal
        visible={exportModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExportModalOpen(false)}
      >
        <Pressable
          onPress={() => setExportModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: theme.colors.surface,
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: theme.colors.border,
              padding: 22,
              gap: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 16 },
              shadowOpacity: 0.4,
              shadowRadius: 28,
              elevation: 24,
            }}
          >
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Download size={20} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 17 }}>
                    {t('history_export_statement_title') || 'Export Statement'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 12 }}>
                    {t('history_export_statement_sub') || 'Download verified statement files'}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setExportModalOpen(false)}
                hitSlop={10}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <X size={16} color={theme.colors.text} />
              </Pressable>
            </View>

            {/* Scope Summary Badge */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                Scope: <Text style={{ fontWeight: '800', color: theme.colors.text }}>{PERIOD_CHIPS.find((c) => c.value === period)?.label || 'Filtered'}</Text>
              </Text>
              <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 11 }}>
                {filteredExpenses.length} records · {formatMoney(totalAmount, preferredCurrency)}
              </Text>
            </View>

            {/* Export Format Cards */}
            <View style={{ gap: 10 }}>
              {/* PDF Document */}
              <PressableScale
                disabled={exporting !== null}
                onPress={() => handleExport('pdf')}
                activeScale={0.96}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileText size={22} color="#EF4444" />
                  </View>
                  <View>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.text }}>
                      {t('history_pdf_statement') || 'PDF Statement Report'}
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      {t('history_pdf_statement_sub') || 'Formatted table, breakdown & summary'}
                    </Text>
                  </View>
                </View>
                {exporting === 'pdf' ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Download size={18} color={theme.colors.primary} />
                )}
              </PressableScale>

              {/* Excel Spreadsheet */}
              <PressableScale
                disabled={exporting !== null}
                onPress={() => handleExport('excel')}
                activeScale={0.96}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileSpreadsheet size={22} color="#10B981" />
                  </View>
                  <View>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.text }}>
                      {t('history_excel_sheet') || 'Excel Spreadsheet (.xlsx)'}
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      {t('history_excel_sheet_sub') || 'Full workbook with category analytics'}
                    </Text>
                  </View>
                </View>
                {exporting === 'excel' ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Download size={18} color={theme.colors.primary} />
                )}
              </PressableScale>

              {/* CSV Raw Data */}
              <PressableScale
                disabled={exporting !== null}
                onPress={() => handleExport('csv')}
                activeScale={0.96}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: 'rgba(99, 102, 241, 0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Receipt size={22} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.text }}>
                      {t('history_csv_raw') || 'CSV Raw Data (.csv)'}
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      {t('history_csv_raw_sub') || 'Universal comma-separated data file'}
                    </Text>
                  </View>
                </View>
                {exporting === 'csv' ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Download size={18} color={theme.colors.primary} />
                )}
              </PressableScale>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
