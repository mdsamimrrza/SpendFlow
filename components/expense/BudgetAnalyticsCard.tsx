import React from 'react';
import { Pressable, View } from 'react-native';
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
}

export function BudgetAnalyticsCard({ expenses, targetCurrency }: BudgetAnalyticsCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { convert } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();

  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const now = new Date();
  const currentMonthStr = now.toISOString().slice(0, 7);
  const currentDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Total spent in current month
  const totalMonthlySpend = expenses
    .filter((e) => e.date.startsWith(currentMonthStr))
    .reduce((sum, e) => sum + convert(Number(e.amount), e.currency || 'NPR', currency), 0);

  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;
  const isBudgetSet = monthlyBudget > 0;

  // Daily budget calculations
  const dailyAllowance = isBudgetSet ? monthlyBudget / daysInMonth : 0;
  const actualDailyPace = totalMonthlySpend / Math.max(currentDay, 1);
  const projectedEndMonthTotal = actualDailyPace * daysInMonth;
  const isOverBudget = isBudgetSet && totalMonthlySpend > monthlyBudget;
  const isHighBurnRate = isBudgetSet && actualDailyPace > dailyAllowance;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <PieChart size={20} color={theme.colors.primary} />
          <Text variant="h3">{t('budget_perf_title')}</Text>
        </View>
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
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            {/* Daily Allowance */}
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.md, borderRadius: theme.radius.md, gap: 4 }}>
              <Text variant="caption" muted>
                {t('budget_perf_daily_target')}
              </Text>
              <Text variant="h3" style={{ color: theme.colors.primary }}>
                {formatMoney(dailyAllowance, currency)}
                <Text variant="caption" muted>
                  {t('budget_perf_per_day')}
                </Text>
              </Text>
            </View>

            {/* Actual Daily Pace */}
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.md, borderRadius: theme.radius.md, gap: 4 }}>
              <Text variant="caption" muted>
                {t('budget_perf_actual_pace')}
              </Text>
              <Text variant="h3" style={{ color: isHighBurnRate ? theme.colors.danger : theme.colors.success }}>
                {formatMoney(actualDailyPace, currency)}
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
              backgroundColor: isOverBudget || isHighBurnRate ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              borderWidth: 1,
              borderColor: isOverBudget || isHighBurnRate ? theme.colors.danger : theme.colors.success,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            {isHighBurnRate || isOverBudget ? (
              <TrendingUp size={22} color={theme.colors.danger} />
            ) : (
              <TrendingDown size={22} color={theme.colors.success} />
            )}
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ color: isHighBurnRate || isOverBudget ? theme.colors.danger : theme.colors.success }}>
                {isOverBudget
                  ? t('budget_perf_exceeded')
                  : isHighBurnRate
                  ? t('budget_perf_high_pace')
                  : t('budget_perf_on_track')}
              </Text>
              <Text variant="caption" muted>
                {isOverBudget
                  ? `${t('budget_perf_exceeded_by')} ${formatMoney(totalMonthlySpend - monthlyBudget, currency)}`
                  : `${t('budget_perf_projected')}: ${formatMoney(projectedEndMonthTotal, currency)} (${Math.round((projectedEndMonthTotal / monthlyBudget) * 100)}%)`}
              </Text>
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}
