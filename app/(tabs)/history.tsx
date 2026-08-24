import { useFocusEffect } from 'expo-router';
import { Calendar as CalendarIcon, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import {
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ExpenseItem } from '@/components/expense/ExpenseItem';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CalendarModal, DateRange } from '@/components/ui/CalendarModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SORT_OPTIONS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';
import { SortKey } from '@/types';

type HistoryPeriod = 'all' | 'today' | 'week' | 'month' | 'custom';

const PERIOD_OPTIONS: { label: string; value: HistoryPeriod }[] = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom Range', value: 'custom' },
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

  // Compute date range based on selected period
  const dateRange = useMemo(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    switch (period) {
      case 'today':
        return { fromDate: todayStr, toDate: todayStr };
      case 'week':
        return {
          fromDate: format(startOfWeek(today), 'yyyy-MM-dd'),
          toDate: format(endOfWeek(today), 'yyyy-MM-dd'),
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

  const activePeriodLabel = useMemo(() => {
    switch (period) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'month':
        return 'This Month';
      case 'custom':
        return formattedCustomLabel;
      default:
        return 'All Time';
    }
  }, [period, formattedCustomLabel]);

  const isFilterActive = period !== 'all' || search.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={expenses.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={expenses.refreshing} onRefresh={expenses.refresh} />}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.md }}>
            {/* Top Bar */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="h1">History</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <ThemeToggle />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setFiltersOpen(true)}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.md,
                    backgroundColor: isFilterActive
                      ? (theme.isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(15, 159, 142, 0.1)')
                      : 'transparent',
                  }}
                >
                  <SlidersHorizontal
                    size={22}
                    color={isFilterActive ? theme.colors.primary : theme.colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            {/* Search Input */}
            <Input
              placeholder="Search description or notes"
              value={search}
              onChangeText={setSearch}
            />

            {/* Active Filter Banner (Only shown when filter/search is active) */}
            {isFilterActive && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text variant="caption" muted style={{ flex: 1 }}>
                  Filter: <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>{activePeriodLabel}</Text>
                  {search ? ` · "${search}"` : ''} ({expenses.items.length} {expenses.items.length === 1 ? 'item' : 'items'})
                </Text>
                <Pressable onPress={handleClearFilters} hitSlop={8}>
                  <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                    Clear
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => <ExpenseItem expense={item} onDelete={(expense) => expenses.remove(expense.id)} />}
        ListEmptyComponent={<EmptyState icon={SlidersHorizontal} title="No matching expenses" message="Try a different search or date filter." />}
        onEndReached={expenses.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          expenses.loadingMore ? (
            <View style={{ paddingVertical: theme.spacing.lg }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : expenses.items.length && !expenses.hasMore ? (
            <Text muted style={{ paddingVertical: theme.spacing.lg, textAlign: 'center' }}>
              You have reached the end.
            </Text>
          ) : null
        }
      />

      {/* Filter & Sort BottomSheet */}
      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <Text variant="h2">Filter & Sort</Text>

        <Select
          label="Date Period"
          value={period}
          options={PERIOD_OPTIONS}
          onChange={(val) => {
            if (val === 'custom') {
              setPeriod('custom');
              setFiltersOpen(false);
              setCalendarOpen(true);
            } else {
              setPeriod(val as HistoryPeriod);
            }
          }}
        />

        {period === 'custom' && (
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
                {customRange.startDate ? formattedCustomLabel : 'Choose Date Range'}
              </Text>
            </View>
            <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              Open Calendar
            </Text>
          </Pressable>
        )}

        <Select label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />

        <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <Button
            title="Reset"
            variant="secondary"
            onPress={() => {
              handleClearFilters();
              setFiltersOpen(false);
            }}
            style={{ flex: 1 }}
          />
          <Button
            title="Apply"
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
