import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  ArrowDownRight,
  ArrowUpDown,
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
  endOfMonth,
  endOfWeek,
  format,
  isToday as isTodayFn,
  isYesterday as isYesterdayFn,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ExpenseItem } from '@/components/expense/ExpenseItem';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CalendarModal, DateRange } from '@/components/ui/CalendarModal';
import { Card } from '@/components/ui/Card';
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
import { formatMoney, sumExpenses } from '@/utils/format';

type HistoryPeriod = 'all' | 'today' | 'week' | 'month' | 'custom';

export default function HistoryScreen() {
  const { profile, session, refreshProfile } = useAuth();
  const { rates } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [period, setPeriod] = useState<HistoryPeriod>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Pagination state (1-indexed for user display)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const listRef = useRef<SectionList>(null);

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  useEffect(() => {
    if (profile?.id) {
      listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
    }
  }, [profile?.id]);

  const PERIOD_CHIPS: { label: string; value: HistoryPeriod }[] = [
    { label: t('history_period_all') || 'All Time', value: 'all' },
    { label: t('history_period_today') || 'Today', value: 'today' },
    { label: t('history_period_week') || 'This Week', value: 'week' },
    { label: t('history_period_month') || 'This Month', value: 'month' },
    { label: t('history_period_custom') || 'Custom 📅', value: 'custom' },
  ];

  // Compute date range based on selected period
  const dateRange = useMemo(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    switch (period) {
      case 'today':
        return { fromDate: todayStr, toDate: todayStr };
      case 'week':
        return {
          fromDate: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          toDate: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
      case 'month':
        return {
          fromDate: format(startOfMonth(today), 'yyyy-MM-dd'),
          toDate: format(endOfMonth(today), 'yyyy-MM-dd'),
        };
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
      search: search.trim() || undefined,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
    }),
    [search, dateRange.fromDate, dateRange.toDate],
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

  // Filter by category in-memory if selected
  const filteredExpenses = useMemo(() => {
    if (!selectedCategoryId) return expenses.items;
    return expenses.items.filter((item) => item.category_id === selectedCategoryId);
  }, [expenses.items, selectedCategoryId]);

  // Total summary of all matching expenses
  const totalAmount = useMemo(
    () => sumExpenses(filteredExpenses, preferredCurrency),
    [filteredExpenses, preferredCurrency],
  );

  // Highest single expense
  const highestSingleSpend = useMemo(() => {
    if (filteredExpenses.length === 0) return 0;
    return Math.max(...filteredExpenses.map((e) => Number(e.amount)));
  }, [filteredExpenses]);

  // Reset to page 1 whenever filters, search, or category changes
  const handleSearchChange = (text: string) => {
    setSearch(text);
    setCurrentPage(1);
  };

  const handlePeriodChange = (nextPeriod: HistoryPeriod) => {
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
      groups[rawDate].total += Number(item.amount);
    });

    return Object.keys(groups).map((key) => groups[key]);
  }, [paginatedItems, t]);

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
      <SectionList
        ref={listRef}
        sections={groupedSections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 130 }}
        refreshControl={
          <RefreshControl
            refreshing={expenses.refreshing}
            onRefresh={() => {
              void refreshProfile();
              void expenses.refresh();
            }}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.md }}>
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

            {/* ── 2. TOTAL OUTFLOW VAULT SUMMARY CARD (CLEAN & SYMMETRICAL) ── */}
            <Card
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                gap: 6,
                backgroundColor: theme.isDark ? '#0F172A' : theme.colors.cardHighlight,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: theme.isDark ? 'rgba(129, 140, 248, 0.35)' : theme.colors.border,
                shadowColor: theme.colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: theme.isDark ? 0.12 : 0.05,
                shadowRadius: 6,
                elevation: 2,
              }}
            >
              {/* Row 1: Header Label on Left + Entries Badge on Right */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Wallet size={11} color={theme.colors.primary} />
                  </View>
                  <Text
                    variant="caption"
                    style={{
                      color: theme.colors.primary,
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: 0.7,
                      fontSize: 10,
                    }}
                  >
                    {t('history_total_outflow') || 'Total Outflow'} · {activeChipLabel(period)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {/* Entries Pill Badge */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(99, 102, 241, 0.1)',
                      borderWidth: 1,
                      borderColor: theme.isDark ? 'rgba(129, 140, 248, 0.3)' : 'rgba(99, 102, 241, 0.2)',
                    }}
                  >
                    <Receipt size={10} color={theme.colors.primary} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '800',
                        color: theme.isDark ? '#E2E8F0' : '#1E293B',
                      }}
                    >
                      {totalItems} {totalItems === 1 ? 'entry' : 'entries'}
                    </Text>
                  </View>

                  {selectedCategoryId ? (
                    <Pressable
                      onPress={() => setSelectedCategoryId(null)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
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

              {/* Row 2: Outflow Amount on Left + Peak Expense Badge on Right */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text
                    style={{
                      fontSize: 22,
                      lineHeight: 26,
                      fontWeight: '900',
                      color: theme.colors.primary,
                      fontVariant: ['tabular-nums'],
                      letterSpacing: -0.5,
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatMoney(totalAmount, preferredCurrency)}
                  </Text>
                </View>

                {highestSingleSpend > 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 7,
                      paddingVertical: 2.5,
                      borderRadius: 6,
                      backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)',
                      borderWidth: 1,
                      borderColor: theme.isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)',
                    }}
                  >
                    <Sparkles size={10} color="#F59E0B" />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: theme.colors.textMuted,
                      }}
                    >
                      Peak:{' '}
                      <Text style={{ fontWeight: '800', color: theme.isDark ? '#FCD34D' : '#D97706' }}>
                        {formatMoney(highestSingleSpend, preferredCurrency)}
                      </Text>
                    </Text>
                  </View>
                ) : null}
              </View>
            </Card>

            {/* ── 3. HORIZONTAL TIMELINE PERIOD CHIPS ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
            >
              {PERIOD_CHIPS.map((chip) => {
                const active = period === chip.value;
                return (
                  <Pressable
                    key={chip.value}
                    onPress={() => handlePeriodChange(chip.value)}
                    style={{
                      paddingHorizontal: 13,
                      paddingVertical: 7,
                      borderRadius: theme.radius.full,
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceElevated,
                      borderWidth: 1.5,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? '#FFFFFF' : theme.colors.text,
                        fontWeight: active ? '800' : '600',
                        fontSize: 12,
                      }}
                    >
                      {chip.value === 'custom' && customRange.startDate ? formattedCustomLabel : chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── 4. SEARCH, CATEGORY & SORT ROW ── */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {/* Search Box */}
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.surfaceElevated,
                  borderRadius: theme.radius.md,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Search size={15} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  value={search}
                  onChangeText={(text) => {
                    setSearch(text);
                    setCurrentPage(1);
                  }}
                  placeholder={t('history_search_placeholder') || 'Search notes, merchant...'}
                  placeholderTextColor={theme.colors.textMuted}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: theme.colors.text,
                    paddingVertical: 10,
                  }}
                />
                {search ? (
                  <Pressable
                    onPress={() => handleSearchChange('')}
                    hitSlop={8}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: theme.colors.textMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <X size={12} color="#FFFFFF" />
                  </Pressable>
                ) : null}
              </View>

              {/* Category Dropdown Pill */}
              {(() => {
                const selectedCat = categories.find((c) => c.id === selectedCategoryId);
                return (
                  <PressableScale
                    onPress={() => setCategoryModalOpen(true)}
                    activeScale={0.92}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 11,
                      paddingVertical: 10,
                      borderRadius: theme.radius.md,
                      backgroundColor: selectedCategoryId
                        ? (theme.isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.12)')
                        : theme.colors.surfaceElevated,
                      borderWidth: 1.5,
                      borderColor: selectedCategoryId ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    {selectedCat ? (
                      <>
                        <Text style={{ fontSize: 14 }}>{selectedCat.icon}</Text>
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
                        >
                          <X size={13} color={theme.colors.primary} />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Tag size={14} color={theme.colors.textMuted} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                          Category
                        </Text>
                        <ChevronDown size={14} color={theme.colors.textMuted} />
                      </>
                    )}
                  </PressableScale>
                );
              })()}

              {/* Sort Trigger */}
              <PressableScale
                onPress={() => setFiltersOpen(true)}
                activeScale={0.92}
                style={{
                  paddingHorizontal: 11,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <ArrowUpDown size={15} color={theme.colors.primary} />
                <Text variant="caption" style={{ fontWeight: '800', color: theme.colors.text }}>
                  Sort
                </Text>
              </PressableScale>
            </View>
          </View>
        }
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
        renderItem={({ item }) => (
          <ExpenseItem expense={item} onDelete={(expense) => expenses.remove(expense.id)} />
        )}
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

      {/* ── SORT / FILTER BOTTOM SHEET ── */}
      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <View style={{ gap: theme.spacing.lg }}>
          <Select
            label={t('history_sort_date_new') || 'Sort Transactions By'}
            value={sort}
            options={SORT_OPTIONS}
            onChange={(nextSort) => {
              setSort(nextSort as SortKey);
              setFiltersOpen(false);
              setCurrentPage(1);
            }}
          />
          <Button title={t('common_done') || 'Apply Sort'} onPress={() => setFiltersOpen(false)} />
        </View>
      </BottomSheet>

      {/* ── CUSTOM DATE RANGE CALENDAR MODAL ── */}
      <CalendarModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onApply={(range) => {
          setCustomRange(range);
          setCalendarOpen(false);
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
      {/* ── LUXURY CATEGORY FILTER MODAL ── */}
      <Modal
        visible={categoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <Pressable
          onPress={() => setCategoryModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              maxHeight: '80%',
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              padding: 20,
              gap: 16,
              borderWidth: 1.5,
              borderColor: theme.colors.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.35,
              shadowRadius: 24,
              elevation: 20,
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
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Tag size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Filter by Category
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Isolate transactions by spending bucket
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setCategoryModalOpen(false)}
                hitSlop={10}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
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

            {/* Category Options List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {/* All Categories Option */}
              <PressableScale
                onPress={() => {
                  handleCategorySelect(null);
                  setCategoryModalOpen(false);
                }}
                activeScale={0.96}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  borderRadius: theme.radius.md,
                  borderWidth: 1.5,
                  borderColor: !selectedCategoryId ? theme.colors.primary : theme.colors.border,
                  backgroundColor: !selectedCategoryId
                    ? (theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.08)')
                    : theme.colors.surfaceElevated,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: theme.colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Layers size={16} color={theme.colors.text} />
                  </View>
                  <View>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: !selectedCategoryId ? theme.colors.primary : theme.colors.text }}>
                      All Categories
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      Show all {expenses.items.length} transactions
                    </Text>
                  </View>
                </View>

                {!selectedCategoryId ? (
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: theme.colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={13} color="#FFFFFF" />
                  </View>
                ) : null}
              </PressableScale>

              {/* Individual Categories */}
              {categories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                const count = expenses.items.filter((e) => e.category_id === cat.id).length;
                const total = sumExpenses(
                  expenses.items.filter((e) => e.category_id === cat.id),
                  preferredCurrency,
                  rates,
                );

                return (
                  <PressableScale
                    key={cat.id}
                    onPress={() => {
                      handleCategorySelect(cat.id);
                      setCategoryModalOpen(false);
                    }}
                    activeScale={0.96}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderRadius: theme.radius.md,
                      borderWidth: 1.5,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: isSelected
                        ? (theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.08)')
                        : theme.colors.surfaceElevated,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: cat.color ?? theme.colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontWeight: '800',
                            fontSize: 14,
                            color: isSelected ? theme.colors.primary : theme.colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {cat.name}
                        </Text>
                        <Text variant="caption" muted style={{ fontSize: 11 }}>
                          {count} {count === 1 ? 'transaction' : 'transactions'} {count > 0 ? `· ${formatMoney(total, preferredCurrency)}` : ''}
                        </Text>
                      </View>
                    </View>

                    {isSelected ? (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: theme.colors.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={13} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
