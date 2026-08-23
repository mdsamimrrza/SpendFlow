import { BarChart3 } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { CategoryBreakdown, TrendBars } from '@/components/expense/Charts';
import { SummaryCard } from '@/components/expense/SummaryCard';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { PERIODS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';
import { PeriodKey } from '@/types';
import { formatMoney, groupByCategory, sumExpenses } from '@/utils/format';

export default function AnalyticsScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const [period, setPeriod] = useState<PeriodKey>('month');
  const expenses = useExpenses(profile?.id);
  const total = sumExpenses(expenses.items);
  const largest = Math.max(...expenses.items.map((expense) => Number(expense.amount)), 0);
  const categories = groupByCategory(expenses.items);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={expenses.refreshing} onRefresh={expenses.refresh} />}
    >
      <Text variant="h1">Analytics</Text>
      <Select label="Period" value={period} options={PERIODS} onChange={setPeriod} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <SummaryCard title="Total" value={formatMoney(total, profile?.preferred_currency)} icon={BarChart3} />
        <SummaryCard title="Largest" value={formatMoney(largest, profile?.preferred_currency)} detail={`${expenses.items.length} transactions`} icon={BarChart3} />
      </View>
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
