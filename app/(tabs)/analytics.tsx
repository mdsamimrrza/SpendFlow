import { useFocusEffect } from 'expo-router';
import { BarChart3 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { CategoryBreakdown, TrendBars } from '@/components/expense/Charts';
import { OverallBudgetCard } from '@/components/expense/OverallBudgetCard';
import { SummaryCard } from '@/components/expense/SummaryCard';

import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { PERIODS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';
import { PeriodKey } from '@/types';
import { formatMoney, groupByCategory, sumExpenses } from '@/utils/format';

import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function AnalyticsScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const { rates, convert } = useExchangeRates();
  const [period, setPeriod] = useState<PeriodKey>('month');
  const expenses = useExpenses(profile?.id);

  useFocusEffect(
    useCallback(() => {
      void expenses.refresh();
    }, [expenses.refresh]),
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const total = sumExpenses(expenses.items, preferredCurrency, rates);
  const largest = Math.max(
    ...expenses.items.map((expense) => convert(Number(expense.amount), expense.currency || 'NPR', preferredCurrency)),
    0,
  );
  const categories = groupByCategory(expenses.items, preferredCurrency, rates);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={expenses.refreshing} onRefresh={expenses.refresh} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h1">Analytics</Text>
        <ThemeToggle />
      </View>
      <Select label="Period" value={period} options={PERIODS} onChange={setPeriod} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <SummaryCard title="Total" value={formatMoney(total, profile?.preferred_currency)} icon={BarChart3} />
        <SummaryCard title="Largest" value={formatMoney(largest, profile?.preferred_currency)} detail={`${expenses.items.length} transactions`} icon={BarChart3} />
      </View>
      <OverallBudgetCard expenses={expenses.items} />
      <CategoryBreakdown expenses={expenses.items} />
      <TrendBars expenses={expenses.items} />
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="h3">Top Categories</Text>
        {categories.map((item) => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Text style={{ flex: 1 }}>{item.icon} {item.label}</Text>
            <Text variant="label">{formatMoney(item.total, profile?.preferred_currency)}</Text>
          </View>
        ))}
      </View>
      <Text muted>Month-over-month comparison expands in Phase 2; the schema already supports the required data.</Text>
    </ScrollView>
  );
}
