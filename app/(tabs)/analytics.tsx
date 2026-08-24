import { useFocusEffect } from 'expo-router';
import { BarChart3 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { BudgetAnalyticsCard } from '@/components/expense/BudgetAnalyticsCard';
import { CategoryBreakdown, TrendBars } from '@/components/expense/Charts';
import { SummaryCard } from '@/components/expense/SummaryCard';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PERIODS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';
import { PeriodKey } from '@/types';
import { filterExpensesByPeriod, formatMoney, groupByCategory, sumExpenses } from '@/utils/format';

export default function AnalyticsScreen() {
  const { profile, session } = useAuth();
  const theme = useTheme();
  const { rates, convert } = useExchangeRates();
  const [period, setPeriod] = useState<PeriodKey>('month');
  const expenses = useExpenses(profile?.id ?? session?.user?.id);

  useFocusEffect(
    useCallback(() => {
      void expenses.refresh();
    }, [expenses.refresh]),
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  // Apply Period Filter (Today, This Week, This Month, This Year, All Time)
  const filteredItems = useMemo(
    () => filterExpensesByPeriod(expenses.items, period),
    [expenses.items, period],
  );

  const total = sumExpenses(filteredItems, preferredCurrency, rates);
  const largest = Math.max(
    ...filteredItems.map((expense) => convert(Number(expense.amount), expense.currency || 'NPR', preferredCurrency)),
    0,
  );
  const categories = groupByCategory(filteredItems, preferredCurrency, rates);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={expenses.refreshing} onRefresh={expenses.refresh} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h1">Analytics</Text>
        <ThemeToggle />
      </View>

      <Select label="Period" value={period} options={PERIODS} onChange={setPeriod} />

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <SummaryCard title="Total" value={formatMoney(total, preferredCurrency)} icon={BarChart3} />
        <SummaryCard title="Largest" value={formatMoney(largest, preferredCurrency)} detail={`${filteredItems.length} transactions`} icon={BarChart3} />
      </View>

      <BudgetAnalyticsCard expenses={filteredItems} />
      <CategoryBreakdown expenses={filteredItems} targetCurrency={preferredCurrency} />
      <TrendBars expenses={filteredItems} targetCurrency={preferredCurrency} />

      <View style={{ gap: theme.spacing.md }}>
        <Text variant="h3">Top Categories</Text>
        {categories.length === 0 ? (
          <Text muted>No expenses found for this period.</Text>
        ) : (
          categories.map((item) => (
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <Text style={{ flex: 1 }}>{item.icon} {item.label}</Text>
              <Text variant="label">{formatMoney(item.total, preferredCurrency)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
