import { useFocusEffect } from 'expo-router';
import { Calendar as CalendarIcon, Filter, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  View,
} from 'react-native';
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
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SORT_OPTIONS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';
import { Expense, SortKey } from '@/types';
import { formatMoney, sumExpenses } from '@/utils/format';

type HistoryPeriod = 'all' | 'today' | 'week' | 'month' | 'custom';

const PERIOD_CHIPS: { label: string; value: HistoryPeriod }[] = [
  { label: 'All', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom 📅', value: 'custom' },
];

export default function HistoryScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [period, setPeriod] = useState<HistoryPeriod>('all');
  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

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

  const expenses = useExpenses(profile?.id, filters, sort);

  useFocusEffect(
    useCallback(() => {
      void expenses.refresh();
    }, [expenses.refresh]),
  );

  const handleApplyCustomRange = (range: DateRange) => {
    setCustomRange(range);
    setPeriod('custom');
  };

  const handleClearFilters = () => {
    setSearch('');
    setPeriod('all');
    setCustomRange({ startDate: null, endDate: null });
    setSort('date_desc');
  };

  const formattedCustomLabel = useMemo(() => {
    if (!customRange.startDate) return 'Custom Range';
    try {
      const s = format(parseISO(customRange.startDate), 'MMM d');
      if (customRange.endDate && customRange.endDate !== customRange.startDate) {
        const e = format(parseISO(customRange.endDate), 'MMM d, yyyy');
        return `${s} - ${e}`;
      }
      return format(parseISO(customRange.startDate), 'MMM d, yyyy');
    } catch {
      return 'Custom Range';
    }
  }, [customRange]);

  // Total amount in filtered list
  const totalAmount = useMemo(() => {
    return sumExpenses(expenses.items, preferredCurrency);
  }, [expenses.items, preferredCurrency]);

  // Group expenses by date for sleek SectionList headers
  const groupedSections = useMemo(() => {
    const groups: { [dateStr: string]: { title: string; total: number; data: Expense[] } } = {};

    expenses.items.forEach((item) => {
      const dateKey = item.date;
      if (!groups[dateKey]) {
        let title = dateKey;
        try {
          const parsed = parseISO(dateKey);
          if (isTodayFn(parsed)) {
            title = `Today · ${format(parsed, 'MMM d')}`;
          } else if (isYesterdayFn(parsed)) {
            title = `Yesterday · ${format(parsed, 'MMM d')}`;
          } else {
            title = format(parsed, 'EEEE, MMM d, yyyy');
          }
        } catch {
          title = dateKey;
        }

        groups[dateKey] = { title, total: 0, data: [] };
      }

      groups[dateKey].data.push(item);
      groups[dateKey].total += Number(item.amount);
    });

    return Object.keys(groups).map((key) => groups[key]);
  }, [expenses.items]);

  const activeChipLabel = (val: HistoryPeriod) => {
    if (val === 'custom' && customRange.startDate) {
      return formattedCustomLabel;
    }
    return PERIOD_CHIPS.find((c) => c.value === val)?.label || 'All';
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SectionList
        sections={groupedSections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={expenses.refreshing} onRefresh={expenses.refresh} />}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.md }}>
            {/* Top Bar */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ gap: 2 }}>
                <Text variant="h1">Transaction History</Text>
                <Text variant="caption" muted>
                  {expenses.items.length} {expenses.items.length === 1 ? 'transaction' : 'transactions'} recorded
                </Text>
              </View>
              <ThemeToggle />
            </View>

            {/* Total Spending Summary Hero Card */}
            <Card style={{ padding: theme.spacing.lg, gap: theme.spacing.xs, backgroundColor: theme.isDark ? '#141E33' : '#EEF2FF', borderColor: theme.colors.primary }}>
              <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Total Spending ({period === 'all' ? 'All Time' : activeChipLabel(period)})
              </Text>
              <Text variant="h1" style={{ fontSize: 32, lineHeight: 40, color: theme.colors.primary, fontWeight: '800' }}>
                {formatMoney(totalAmount, preferredCurrency)}
              </Text>
            </Card>

            {/* Horizontal Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs, paddingVertical: 2 }}>
              {PERIOD_CHIPS.map((chip) => {
                const active = period === chip.value;
                return (
                  <Pressable
                    key={chip.value}
                    onPress={() => {
                      if (chip.value === 'custom') {
                        setPeriod('custom');
                        setCalendarOpen(true);
                      } else {
                        setPeriod(chip.value);
                      }
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: theme.radius.full,
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? (theme.isDark ? '#0B0F19' : '#FFFFFF') : theme.colors.text,
                        fontWeight: active ? '700' : '500',
                        fontSize: 13,
                      }}
                    >
                      {chip.value === 'custom' && customRange.startDate ? formattedCustomLabel : chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Search Input & Sort Trigger */}
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="Search transactions..."
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFiltersOpen(true)}
                style={{
                  height: 48,
                  width: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <SlidersHorizontal size={20} color={theme.colors.primary} />
              </Pressable>
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
              marginTop: 12,
              marginBottom: 4,
            }}
          >
            <Text variant="caption" style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: theme.colors.textMuted }}>
              {title}
            </Text>
            <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary }}>
              {formatMoney(total, preferredCurrency)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => <ExpenseItem expense={item} onDelete={(expense) => expenses.remove(expense.id)} />}
        ListEmptyComponent={
          expenses.loading ? (
            <View style={{ paddingVertical: theme.spacing['4xl'], alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <EmptyState
              icon={Search}
              title="No matching transactions"
              message="Try adjusting your search keywords or date period filters."
            />
          )
        }
        onEndReached={expenses.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          expenses.loadingMore ? (
            <View style={{ paddingVertical: theme.spacing.lg }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : expenses.items.length && !expenses.hasMore ? (
            <Text muted style={{ paddingVertical: theme.spacing.lg, textAlign: 'center', fontSize: 13 }}>
              All transactions loaded.
            </Text>
          ) : null
        }
      />

      {/* Filter & Sort BottomSheet */}
      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <Text variant="h2">Sort & Date Filter</Text>

        <Select label="Sort Order" value={sort} options={SORT_OPTIONS} onChange={setSort} />

        <Pressable
          onPress={() => {
            setFiltersOpen(false);
            setCalendarOpen(true);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 14,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.colors.primary,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <CalendarIcon size={18} color={theme.colors.primary} />
            <Text variant="body" style={{ fontWeight: '600' }}>
              {customRange.startDate ? formattedCustomLabel : 'Choose Custom Date Range'}
            </Text>
          </View>
          <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
            Open Calendar
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <Button
            title="Reset Filters"
            variant="secondary"
            onPress={() => {
              handleClearFilters();
              setFiltersOpen(false);
            }}
            style={{ flex: 1 }}
          />
          <Button
            title="Done"
            onPress={() => setFiltersOpen(false)}
            style={{ flex: 1 }}
          />
        </View>
      </BottomSheet>

      {/* Calendar Date Picker Modal */}
      <CalendarModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onApply={handleApplyCustomRange}
        initialRange={customRange}
      />
    </View>
  );
}
