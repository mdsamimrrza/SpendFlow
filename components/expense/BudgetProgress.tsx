import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useTheme } from '@/hooks/useTheme';
import { Category, Expense } from '@/types';
import { formatMoney } from '@/utils/format';

export function BudgetProgress({ categories, expenses, targetCurrency }: { categories: Category[]; expenses: Expense[]; targetCurrency?: string }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { convert } = useExchangeRates();
  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const month = new Date().toISOString().slice(0, 7);
  const budgets = categories.filter((category) => category.budget_monthly && category.budget_monthly > 0);
  if (!budgets.length) return null;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Text variant="h3">Monthly Budgets</Text>
      {budgets.map((category) => {
        const spent = expenses
          .filter((expense) => expense.category_id === category.id && expense.date.startsWith(month))
          .reduce((total, expense) => total + convert(Number(expense.amount), expense.currency || 'NPR', currency), 0);
        const budget = Number(category.budget_monthly);
        const ratio = Math.min(spent / budget, 1);
        const overBudget = spent > budget;
        return (
          <View key={category.id} style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text>{category.icon} {category.name}</Text>
              <Text variant="caption" style={{ color: overBudget ? theme.colors.danger : theme.colors.textMuted }}>
                {formatMoney(spent, currency)} / {formatMoney(budget, currency)}
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.colors.surfaceElevated }}>
              <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: overBudget ? theme.colors.danger : theme.colors.success }} />
            </View>
            {overBudget ? <Text variant="caption" style={{ color: theme.colors.danger }}>Over budget by {formatMoney(spent - budget, currency)}.</Text> : null}
          </View>
        );
      })}
    </Card>
  );
}