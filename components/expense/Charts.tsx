import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney, groupByCategory } from '@/utils/format';

export function CategoryBreakdown({ expenses, targetCurrency }: { expenses: Expense[]; targetCurrency?: string }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { rates } = useExchangeRates();
  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const data = groupByCategory(expenses, currency, rates).slice(0, 5);
  const total = data.reduce((sum, item) => sum + item.total, 0);
  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Text variant="h3">Category Breakdown</Text>
      {total === 0 ? (
        <Text muted>No category data yet.</Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'center' }}>
          <Svg width={118} height={118} viewBox="0 0 118 118">
            {data.map((item, index) => {
              const radius = 48 - index * 7;
              const stroke = 6;
              const circumference = 2 * Math.PI * radius;
              return (
                <Circle
                  key={item.label}
                  cx={59}
                  cy={59}
                  r={radius}
                  stroke={item.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${(item.total / total) * circumference} ${circumference}`}
                  strokeLinecap="round"
                  fill="transparent"
                  rotation="-90"
                  origin="59,59"
                />
              );
            })}
          </Svg>
          <View style={{ flex: 1, gap: theme.spacing.sm }}>
            {data.map((item) => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {item.icon} {item.label}
                </Text>
                <Text variant="caption" muted>
                  {Math.round((item.total / total) * 100)}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

export function TrendBars({ expenses, targetCurrency }: { expenses: Expense[]; targetCurrency?: string }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { rates, convert } = useExchangeRates();
  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';

  const days = expenses.reduce<Record<string, number>>((acc, expense) => {
    const converted = convert(Number(expense.amount), expense.currency || 'NPR', currency);
    acc[expense.date] = (acc[expense.date] ?? 0) + converted;
    return acc;
  }, {});
  const data = Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14);
  const max = Math.max(...data.map(([, amount]) => amount), 1);
  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Text variant="h3">Spending Trend</Text>
      <Svg width="100%" height={132}>
        {data.map(([, amount], index) => {
          const barWidth = 14;
          const x = index * 22 + 4;
          const h = Math.max(6, (amount / max) * 108);
          return <Rect key={index} x={x} y={116 - h} width={barWidth} height={h} rx={4} fill={theme.colors.primary} />;
        })}
      </Svg>
      <Text variant="caption" muted>
        Peak day: {formatMoney(max, currency)}
      </Text>
    </Card>
  );
}

