import React from 'react';
import { Pressable, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { AlertCircle, CheckCircle2, Settings, Target } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney } from '@/utils/format';

interface OverallBudgetCardProps {
  expenses: Expense[];
  targetCurrency?: string;
}

export function OverallBudgetCard({ expenses, targetCurrency }: OverallBudgetCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { convert } = useExchangeRates();

  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Total spending in current month in target currency
  const totalMonthlySpend = expenses
    .filter((e) => e.date.startsWith(currentMonth))
    .reduce((sum, e) => sum + convert(Number(e.amount), e.currency || 'NPR', currency), 0);

  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;
  const isBudgetSet = monthlyBudget > 0;

  const ratio = isBudgetSet ? totalMonthlySpend / monthlyBudget : 0;
  const isOverBudget = isBudgetSet && totalMonthlySpend > monthlyBudget;
  const isNearingLimit = isBudgetSet && !isOverBudget && ratio >= 0.8;
  const remaining = isBudgetSet ? monthlyBudget - totalMonthlySpend : 0;

  const progressColor = isOverBudget
    ? theme.colors.danger
    : isNearingLimit
    ? '#F59E0B'
    : theme.colors.success;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <Target size={20} color={theme.colors.primary} />
          <Text variant="h3">Monthly Budget Target</Text>
        </View>
        <Link href="/(tabs)/settings" asChild>
          <Pressable
            hitSlop={8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.surfaceElevated,
            }}
          >
            <Settings size={14} color={theme.colors.textMuted} />
            <Text variant="caption" style={{ color: theme.colors.textMuted }}>
              Settings
            </Text>
          </Pressable>
        </Link>
      </View>

      {!isBudgetSet ? (
        <View
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceElevated,
            gap: theme.spacing.xs,
            alignItems: 'center',
          }}
        >
          <Text style={{ textAlign: 'center', color: theme.colors.textMuted }}>
            No overall monthly budget set. Set your target limit in Settings to monitor what's remaining each month!
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={{
              marginTop: theme.spacing.xs,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Text variant="label" style={{ color: '#FFFFFF' }}>
              ⚙️ Set Budget in Settings
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {/* Metrics Grid */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            {/* Target Budget */}
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm }}>
              <Text variant="caption" muted numberOfLines={1}>
                Target Budget
              </Text>
              <Text variant="label" style={{ marginTop: 2, fontWeight: '700' }} numberOfLines={1}>
                {formatMoney(monthlyBudget, currency)}
              </Text>
            </View>

            {/* Spent This Month */}
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm }}>
              <Text variant="caption" muted numberOfLines={1}>
                Spent This Month
              </Text>
              <Text variant="label" style={{ marginTop: 2, fontWeight: '700', color: progressColor }} numberOfLines={1}>
                {formatMoney(totalMonthlySpend, currency)}
              </Text>
            </View>

            {/* Remaining to Spend */}
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm }}>
              <Text variant="caption" muted numberOfLines={1}>
                {isOverBudget ? 'Exceeded By' : 'Remaining'}
              </Text>
              <Text
                variant="label"
                style={{
                  marginTop: 2,
                  fontWeight: '700',
                  color: isOverBudget ? theme.colors.danger : theme.colors.success,
                }}
                numberOfLines={1}
              >
                {isOverBudget ? formatMoney(Math.abs(remaining), currency) : formatMoney(remaining, currency)}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={{ gap: 4 }}>
            <View style={{ height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: theme.colors.surfaceElevated }}>
              <View
                style={{
                  width: `${Math.min(ratio * 100, 100)}%`,
                  height: '100%',
                  backgroundColor: progressColor,
                  borderRadius: 5,
                }}
              />
            </View>

            {/* Status Info */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isOverBudget ? (
                  <AlertCircle size={15} color={theme.colors.danger} />
                ) : (
                  <CheckCircle2 size={15} color={progressColor} />
                )}
                <Text variant="caption" style={{ color: progressColor, fontWeight: '600' }}>
                  {isOverBudget
                    ? `Over limit by ${formatMoney(Math.abs(remaining), currency)}`
                    : `${formatMoney(remaining, currency)} left to spend`}
                </Text>
              </View>

              <Text variant="caption" muted>
                {Math.round(ratio * 100)}% used
              </Text>
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}
