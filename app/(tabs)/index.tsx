import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, ArrowUpRight, CheckCircle2, Plus, ReceiptText, Settings, Wallet } from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { CategoryBreakdown, TrendBars } from '@/components/expense/Charts';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExpenseItem } from '@/components/expense/ExpenseItem';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useSync } from '@/hooks/useSync';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { Category } from '@/types';
import { currentMonthRange, formatMoney, isoDate, sumExpenses } from '@/utils/format';

export default function HomeScreen() {
  const { profile, session } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { rates } = useExchangeRates();
  const expenses = useExpenses(profile?.id ?? session?.user?.id);
  const sync = useSync(profile?.id);
  const [, setCategories] = useState<Category[]>([]);
  const month = currentMonthRange();

  useFocusEffect(
    useCallback(() => {
      void expenses.refresh();
      if (profile?.id) listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
    }, [expenses.refresh, profile?.id]),
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const todayTotal = sumExpenses(
    expenses.items.filter((expense) => expense.date === isoDate()),
    preferredCurrency,
    rates,
  );
  const monthTotal = sumExpenses(
    expenses.items.filter((expense) => expense.date >= month.from && expense.date <= month.to),
    preferredCurrency,
    rates,
  );

  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;
  const isBudgetSet = monthlyBudget > 0;
  const remaining = isBudgetSet ? monthlyBudget - monthTotal : 0;
  const ratio = isBudgetSet ? Math.min(monthTotal / monthlyBudget, 1) : 0;
  const isOverBudget = isBudgetSet && monthTotal > monthlyBudget;

  const progressColor = isOverBudget ? theme.colors.danger : ratio >= 0.8 ? '#F59E0B' : theme.colors.success;

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const latestExpenses = expenses.items.slice(0, 5);
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'User';

  if (expenses.loading) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.lg, backgroundColor: theme.colors.background }}>
        <Skeleton height={60} />
        <Skeleton height={200} />
        <Skeleton height={180} />
        <Skeleton height={150} />
        <Skeleton height={240} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Offline Sync Banner */}
      {sync.pendingCount ? (
        <View style={{ backgroundColor: theme.colors.warning, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md }}>
          <Text variant="caption" style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '600' }}>
            ⚡ {sync.pendingCount} offline change{sync.pendingCount === 1 ? '' : 's'} waiting to sync
          </Text>
        </View>
      ) : null}

      <FlatList
        data={latestExpenses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={expenses.refreshing} onRefresh={expenses.refresh} />}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.lg }}>
            {/* 1. TOP APP BAR HEADER */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <Text variant="h2">SpendFlow</Text>
                <Text variant="caption" muted>
                  {formattedDate} • {preferredCurrency}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <ThemeToggle />
                <Avatar uri={profile?.avatar_url} name={displayName} size={38} />
              </View>
            </View>

            {/* 2. REDESIGNED TOTAL MONTHLY SPEND & BUDGET HERO CARD */}
            <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
              {/* Card Header: Total Monthly Spend Label & Settings Link */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Wallet size={18} color={theme.colors.primary} />
                  <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}>
                    Total Spent This Month
                  </Text>
                </View>
                <Link href="/(tabs)/settings" asChild>
                  <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Settings size={14} color={theme.colors.textMuted} />
                    <Text variant="caption" muted>
                      Settings
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {/* Main Total Monthly Spend Hero Amount */}
              <View>
                <Text variant="h1" style={{ fontSize: 34, lineHeight: 40, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {formatMoney(monthTotal, preferredCurrency)}
                </Text>
              </View>

              {/* Budget Health Bar (If Budget is Set) */}
              {isBudgetSet ? (
                <View style={{ gap: theme.spacing.xs, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {isOverBudget ? <AlertCircle size={14} color={theme.colors.danger} /> : <CheckCircle2 size={14} color={progressColor} />}
                      <Text variant="caption" style={{ color: progressColor, fontWeight: '700' }}>
                        {isOverBudget
                          ? `Exceeded by ${formatMoney(Math.abs(remaining), preferredCurrency)}`
                          : `${formatMoney(remaining, preferredCurrency)} remaining`}
                      </Text>
                    </View>
                    <Text variant="caption" muted>
                      Target: {formatMoney(monthlyBudget, preferredCurrency)} ({Math.round(ratio * 100)}%)
                    </Text>
                  </View>

                  {/* Progress Bar */}
                  <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.colors.border }}>
                    <View
                      style={{
                        width: `${Math.min(ratio * 100, 100)}%`,
                        height: '100%',
                        backgroundColor: progressColor,
                        borderRadius: 3,
                      }}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm }}>
                  <Text variant="caption" muted>
                    No monthly target budget set.
                  </Text>
                  <Pressable onPress={() => router.push('/(tabs)/settings')} hitSlop={6}>
                    <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                      Set Budget →
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Quick Metrics Sub-Row */}
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingTop: theme.spacing.xs }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" muted numberOfLines={1}>
                    Spent Today
                  </Text>
                  <Text variant="label" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {formatMoney(todayTotal, preferredCurrency)}
                  </Text>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" muted numberOfLines={1}>
                    Target Limit
                  </Text>
                  <Text variant="label" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {isBudgetSet ? formatMoney(monthlyBudget, preferredCurrency) : 'Not Set'}
                  </Text>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" muted numberOfLines={1}>
                    Budget Status
                  </Text>
                  <Text variant="label" style={{ fontWeight: '700', color: isBudgetSet ? progressColor : theme.colors.textMuted }}>
                    {isBudgetSet ? (isOverBudget ? 'Over Limit' : `${Math.round(ratio * 100)}% Used`) : 'Unset'}
                  </Text>
                </View>
              </View>
            </Card>

            {/* 3. CIRCULAR CATEGORY BREAKDOWN GRAPH */}
            <CategoryBreakdown expenses={expenses.items} targetCurrency={preferredCurrency} />

            {/* 4. SPENDING TREND BAR GRAPH CHART */}
            <TrendBars expenses={expenses.items} targetCurrency={preferredCurrency} />

            {/* 5. RECENT ACTIVITY HEADER */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.xs }}>
              <Text variant="h3">Recent Activity</Text>
              {expenses.items.length > 5 ? (
                <Link href="/(tabs)/history" asChild>
                  <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text variant="label" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                      View all ({expenses.items.length})
                    </Text>
                    <ArrowUpRight size={14} color={theme.colors.primary} />
                  </Pressable>
                </Link>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => <ExpenseItem expense={item} onDelete={(expense) => expenses.remove(expense.id)} />}
        ListEmptyComponent={<EmptyState icon={ReceiptText} title="No expenses yet" message="Tap + below to record your first transaction." />}
        ListFooterComponent={
          expenses.items.length > 5 ? (
            <Link href="/(tabs)/history" asChild>
              <Pressable
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  marginTop: theme.spacing.xs,
                }}
              >
                <Text variant="label" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                  View All {expenses.items.length} Transactions in History →
                </Text>
              </Pressable>
            </Link>
          ) : null
        }
      />

      {/* Floating Action Button (FAB) */}
      <Link href="/expense/add" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          style={{
            position: 'absolute',
            right: theme.spacing.xl,
            bottom: theme.spacing['3xl'],
            width: 56,
            height: 56,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
          }}
        >
          <Plus size={26} color="#FFFFFF" />
        </Pressable>
      </Link>
    </View>
  );
}
