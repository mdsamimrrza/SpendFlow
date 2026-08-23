import { Link } from 'expo-router';
import { Plus, ReceiptText, TrendingUp, Wallet } from 'lucide-react-native';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { CategoryBreakdown, TrendBars } from '@/components/expense/Charts';
import { BudgetProgress } from '@/components/expense/BudgetProgress';
import { ExpenseItem } from '@/components/expense/ExpenseItem';
import { SummaryCard } from '@/components/expense/SummaryCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useSync } from '@/hooks/useSync';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { Category } from '@/types';
import { useEffect, useState } from 'react';
import { currentMonthRange, formatMoney, isoDate, sumExpenses } from '@/utils/format';

export default function HomeScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const expenses = useExpenses(profile?.id);
  const sync = useSync(profile?.id);
  const [categories, setCategories] = useState<Category[]>([]);
  const month = currentMonthRange();
  useEffect(() => {
    if (profile?.id) listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
  }, [profile?.id]);
  const todayTotal = sumExpenses(expenses.items.filter((expense) => expense.date === isoDate()));
  const monthTotal = sumExpenses(expenses.items.filter((expense) => expense.date >= month.from && expense.date <= month.to));
  const previousTotal = sumExpenses(expenses.items.filter((expense) => expense.date >= month.previousFrom && expense.date <= month.previousTo));
  const delta = previousTotal ? Math.round(((monthTotal - previousTotal) / previousTotal) * 100) : 0;

  if (expenses.loading) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
        <Skeleton height={110} />
        <Skeleton height={220} />
        <Skeleton height={320} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {sync.pendingCount ? (
        <View style={{ backgroundColor: theme.colors.warning, padding: theme.spacing.sm }}>
          <Text variant="caption" style={{ color: '#FFFFFF', textAlign: 'center' }}>
            {sync.pendingCount} offline change{sync.pendingCount === 1 ? '' : 's'} waiting to sync
          </Text>
        </View>
      ) : null}
      <FlatList
        data={expenses.items.slice(0, 20)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={expenses.refreshing} onRefresh={expenses.refresh} />}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.lg }}>
            <View>
              <Text variant="h1">Dashboard</Text>
              <Text muted>{profile?.preferred_currency ?? 'NPR'} spending overview</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <SummaryCard title="Today" value={formatMoney(todayTotal, profile?.preferred_currency)} icon={Wallet} />
              <SummaryCard title="This Month" value={formatMoney(monthTotal, profile?.preferred_currency)} detail={`${delta >= 0 ? '+' : ''}${delta}% vs last month`} icon={TrendingUp} />
            </View>
            <CategoryBreakdown expenses={expenses.items} />
            <BudgetProgress categories={categories} expenses={expenses.items} />
            <TrendBars expenses={expenses.items} />
            <Text variant="h3">Recent Expenses</Text>
          </View>
        }
        renderItem={({ item }) => <ExpenseItem expense={item} onDelete={(expense) => expenses.remove(expense.id)} />}
        ListEmptyComponent={<EmptyState icon={ReceiptText} title="No expenses yet" message="Add your first expense to see summaries and trends." />}
        onEndReached={expenses.loadMore}
        onEndReachedThreshold={0.5}
      />
      <Link href="/expense/add" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          style={{
            position: 'absolute',
            right: theme.spacing.xl,
            bottom: theme.spacing['3xl'],
            width: 60,
            height: 60,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={28} color="#FFFFFF" />
        </Pressable>
      </Link>
    </View>
  );
}
