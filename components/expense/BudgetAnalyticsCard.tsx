import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, CheckCircle2, PieChart, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney } from '@/utils/format';

interface BudgetAnalyticsCardProps {
  expenses: Expense[];
  targetCurrency?: string;
  flowType: 'expense' | 'income';
}

export function BudgetAnalyticsCard({ expenses, targetCurrency, flowType }: BudgetAnalyticsCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { convert } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const flowFlipAnim = useRef(new Animated.Value(1)).current;

  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const now = new Date();
  const currentMonthStr = now.toISOString().slice(0, 7);
  const currentDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const currentMonthItems = useMemo(
    () => expenses.filter((expense) => expense.date.startsWith(currentMonthStr)),
    [expenses, currentMonthStr],
  );
  const totalMonthlySpend = useMemo(
    () => currentMonthItems
      .filter((expense) => expense.type !== 'income')
      .reduce((sum, expense) => sum + convert(Number(expense.amount), expense.currency || 'NPR', currency), 0),
    [currentMonthItems, convert, currency],
  );
  const totalMonthlyIncome = useMemo(
    () => currentMonthItems
      .filter((expense) => expense.type === 'income')
      .reduce((sum, expense) => sum + convert(Number(expense.amount), expense.currency || 'NPR', currency), 0),
    [currentMonthItems, convert, currency],
  );

  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;
  const isBudgetSet = monthlyBudget > 0;

  // Daily budget calculations
  const dailyAllowance = isBudgetSet ? monthlyBudget / daysInMonth : 0;
  const actualDailyPace = totalMonthlySpend / Math.max(currentDay, 1);
  const projectedEndMonthTotal = actualDailyPace * daysInMonth;
  const isOverBudget = isBudgetSet && totalMonthlySpend > monthlyBudget;
  const isHighBurnRate = isBudgetSet && actualDailyPace > dailyAllowance;
  const incomeDailyPace = totalMonthlyIncome / Math.max(currentDay, 1);
  const projectedMonthlyIncome = incomeDailyPace * daysInMonth;
  const isIncome = flowType === 'income';
  const flowFlipStyle = {
    opacity: flowFlipAnim,
    transform: [
      { perspective: 900 },
      {
        rotateY: flowFlipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['90deg', '0deg'],
        }),
      },
      {
        scale: flowFlipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  };

  useEffect(() => {
    flowFlipAnim.setValue(0);
    Animated.spring(flowFlipAnim, {
      toValue: 1,
      friction: 8,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [flowFlipAnim, flowType]);

  return (
    <Animated.View style={flowFlipStyle}>
    <Card style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <PieChart size={20} color={isIncome ? theme.colors.success : theme.colors.primary} />
          <Text variant="h3">{isIncome ? t('budget_perf_income_title') : t('budget_perf_title')}</Text>
        </View>
      </View>

      {!isIncome && !isBudgetSet ? (
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
            {t('budget_perf_set_prompt')}
          </Text>
          <Pressable
            onPress={() => router.push('/settings')}
            style={{
              marginTop: theme.spacing.xs,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Text variant="label" style={{ color: '#FFFFFF' }}>
              ⚙️ {t('home_set_budget')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {/* Analysis Rows */}
          <View style={{ flexDirection: isCompact ? 'column' : 'row', gap: theme.spacing.md }}>
            {/* Daily Allowance */}
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.md, borderRadius: theme.radius.md, gap: 4 }}>
              <Text variant="caption" muted>
                {isIncome ? t('budget_perf_monthly_income') : t('budget_perf_daily_target')}
              </Text>
              <Text variant="h3" style={{ color: isIncome ? theme.colors.success : theme.colors.primary }}>
                {formatMoney(isIncome ? totalMonthlyIncome : dailyAllowance, currency)}
                <Text variant="caption" muted>
                  {isIncome ? '' : t('budget_perf_per_day')}
                </Text>
              </Text>
            </View>

            {/* Actual Daily Pace */}
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.md, borderRadius: theme.radius.md, gap: 4 }}>
              <Text variant="caption" muted>
                {isIncome ? t('budget_perf_average_daily_income') : t('budget_perf_actual_pace')}
              </Text>
              <Text variant="h3" style={{ color: isIncome ? theme.colors.success : isHighBurnRate ? theme.colors.danger : theme.colors.success }}>
                {formatMoney(isIncome ? incomeDailyPace : actualDailyPace, currency)}
                <Text variant="caption" muted>
                  {t('budget_perf_per_day')}
                </Text>
              </Text>
            </View>
          </View>

          {/* End of Month Projection Banner */}
          <View
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: !isIncome && (isOverBudget || isHighBurnRate) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              borderWidth: 1,
              borderColor: !isIncome && (isOverBudget || isHighBurnRate) ? theme.colors.danger : theme.colors.success,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            {!isIncome && (isHighBurnRate || isOverBudget) ? (
              <TrendingUp size={22} color={theme.colors.danger} />
            ) : (
              <TrendingDown size={22} color={theme.colors.success} />
            )}
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ color: !isIncome && (isHighBurnRate || isOverBudget) ? theme.colors.danger : theme.colors.success }}>
                {isIncome
                  ? t('budget_perf_income_projection')
                  : isOverBudget
                  ? t('budget_perf_exceeded')
                  : isHighBurnRate
                  ? t('budget_perf_high_pace')
                  : t('budget_perf_on_track')}
              </Text>
              <Text variant="caption" muted>
                {isIncome
                  ? `${t('budget_perf_projected_income')}: ${formatMoney(projectedMonthlyIncome, currency)}`
                  : isOverBudget
                  ? `${t('budget_perf_exceeded_by')} ${formatMoney(totalMonthlySpend - monthlyBudget, currency)}`
                  : `${t('budget_perf_projected')}: ${formatMoney(projectedEndMonthTotal, currency)} (${Math.round((projectedEndMonthTotal / monthlyBudget) * 100)}%)`}
              </Text>
            </View>
          </View>
        </View>
      )}
    </Card>
    </Animated.View>
  );
}
