import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  PieChart,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney, sumExpenses, sumIncome } from '@/utils/format';

interface IncomeExpenseBudgetCardProps {
  expenses: Expense[];
  monthlyBudget?: number;
  targetCurrency?: string;
}

export function IncomeExpenseBudgetCard({
  expenses,
  monthlyBudget = 0,
  targetCurrency,
}: IncomeExpenseBudgetCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { rates } = useExchangeRates();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;

  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const effectiveBudget = monthlyBudget > 0 ? monthlyBudget : profile?.monthly_budget ? Number(profile.monthly_budget) : 0;

  const totalIncome = sumIncome(expenses, currency, rates);
  const totalExpense = sumExpenses(expenses, currency, rates, 'expense');
  const netSavings = totalIncome - totalExpense;

  const incomeItemsCount = expenses.filter((e) => e.type === 'income').length;
  const expenseItemsCount = expenses.filter((e) => e.type !== 'income').length;

  // Ratios & Percentages
  const savingsRate = totalIncome > 0 ? Math.max(-100, Math.round((netSavings / totalIncome) * 100)) : 0;
  const expenseToIncomeRatio = totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;
  const budgetUtilizationRatio = effectiveBudget > 0 ? Math.round((totalExpense / effectiveBudget) * 100) : 0;

  // Status badging
  const isHealthyCashflow = netSavings >= 0;
  const isOverBudget = effectiveBudget > 0 && totalExpense > effectiveBudget;
  const isNearBudget = effectiveBudget > 0 && budgetUtilizationRatio >= 85 && !isOverBudget;

  return (
    <Card
      style={{
        padding: 16,
        gap: 16,
        backgroundColor: theme.colors.surface,
        borderWidth: 1.2,
        borderColor: theme.colors.border,
      }}
    >
      {/* ── CARD HEADER ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : 'rgba(15, 92, 77, 0.1)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BarChart3 size={18} color={theme.colors.primary} />
          </View>
          <View>
            <Text variant="h3" style={{ fontSize: 16, fontWeight: '800', letterSpacing: -0.2 }}>
              Income, Expense & Budget
            </Text>
            <Text variant="caption" muted style={{ fontSize: 11 }}>
              Tri-flow financial analysis & target check
            </Text>
          </View>
        </View>

        {/* Cash Flow Badge */}
        {totalIncome > 0 && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              backgroundColor: isHealthyCashflow ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              borderWidth: 1,
              borderColor: isHealthyCashflow ? '#10B981' : '#EF4444',
            }}
          >
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: isHealthyCashflow ? '#10B981' : '#EF4444' }}>
              {isHealthyCashflow ? `+${savingsRate}% Saved` : 'Deficit'}
            </Text>
          </View>
        )}
      </View>

      {/* ── 3 TELEMETRY TILES GRID (INCOME | EXPENSE | BUDGET) ── */}
      <View style={{ flexDirection: isCompact ? 'column' : 'row', gap: 10 }}>
        {/* Tile 1: Income */}
        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: theme.radius.md,
            backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF4',
            borderWidth: 1,
            borderColor: theme.isDark ? 'rgba(16, 185, 129, 0.25)' : '#BBF7D0',
            gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="caption" style={{ fontWeight: '800', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#10B981' }}>
              Income (+)
            </Text>
            <ArrowDownRight size={14} color="#10B981" />
          </View>
          <Text
            variant="h3"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], color: '#10B981' }}
          >
            {formatMoney(totalIncome, currency)}
          </Text>
          <Text variant="caption" muted style={{ fontSize: 10.5 }}>
            {incomeItemsCount} {incomeItemsCount === 1 ? 'entry' : 'entries'}
          </Text>
        </View>

        {/* Tile 2: Expense */}
        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: theme.radius.md,
            backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
            borderWidth: 1,
            borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA',
            gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="caption" style={{ fontWeight: '800', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.danger }}>
              Expenses (-)
            </Text>
            <ArrowUpRight size={14} color={theme.colors.danger} />
          </View>
          <Text
            variant="h3"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], color: theme.colors.text }}
          >
            {formatMoney(totalExpense, currency)}
          </Text>
          <Text variant="caption" muted style={{ fontSize: 10.5 }}>
            {expenseItemsCount} {expenseItemsCount === 1 ? 'transaction' : 'transactions'}
          </Text>
        </View>

        {/* Tile 3: Budget Target */}
        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceElevated,
            borderWidth: 1,
            borderColor: isOverBudget ? theme.colors.danger : theme.colors.border,
            gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="caption" muted style={{ fontWeight: '800', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Budget Limit
            </Text>
            <Target size={14} color={theme.colors.primary} />
          </View>
          <Text
            variant="h3"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], color: theme.colors.text }}
          >
            {effectiveBudget > 0 ? formatMoney(effectiveBudget, currency) : 'Not Set'}
          </Text>
          <Text variant="caption" muted style={{ fontSize: 10.5 }}>
            {effectiveBudget > 0 ? `${budgetUtilizationRatio}% used` : 'Tap settings to set'}
          </Text>
        </View>
      </View>

      {/* ── COMPARATIVE PROGRESS BARS SECTION ── */}
      <View style={{ gap: 12, paddingTop: 4 }}>
        {/* Progress 1: Expense vs Income Ratio */}
        {totalIncome > 0 ? (
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="caption" style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                Income Consumption Rate
              </Text>
              <Text variant="caption" style={{ fontSize: 12, fontWeight: '800', color: expenseToIncomeRatio > 100 ? theme.colors.danger : theme.colors.primary }}>
                {expenseToIncomeRatio}% spent ({formatMoney(totalExpense, currency)})
              </Text>
            </View>

            <View
              style={{
                height: 8,
                borderRadius: 4,
                overflow: 'hidden',
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              }}
            >
              <View
                style={{
                  width: `${Math.min(100, expenseToIncomeRatio)}%`,
                  height: '100%',
                  backgroundColor: expenseToIncomeRatio > 100 ? theme.colors.danger : expenseToIncomeRatio > 80 ? theme.colors.warning : '#10B981',
                  borderRadius: 4,
                }}
              />
            </View>
          </View>
        ) : null}

        {/* Progress 2: Expense vs Budget Target Ratio */}
        {effectiveBudget > 0 ? (
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="caption" style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                Budget Ceiling Progress
              </Text>
              <Text
                variant="caption"
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: isOverBudget ? theme.colors.danger : isNearBudget ? theme.colors.warning : theme.colors.primary,
                }}
              >
                {budgetUtilizationRatio}% ({formatMoney(effectiveBudget - totalExpense, currency)} remaining)
              </Text>
            </View>

            <View
              style={{
                height: 8,
                borderRadius: 4,
                overflow: 'hidden',
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              }}
            >
              <View
                style={{
                  width: `${Math.min(100, budgetUtilizationRatio)}%`,
                  height: '100%',
                  backgroundColor: isOverBudget ? theme.colors.danger : isNearBudget ? theme.colors.warning : theme.colors.primary,
                  borderRadius: 4,
                }}
              />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => ({
              padding: 10,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.surfaceElevated,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="caption" muted style={{ fontSize: 12 }}>
              💡 Set a monthly budget target to unlock limit alerts
            </Text>
            <Text variant="caption" style={{ fontWeight: '800', color: theme.colors.primary }}>
              Set Budget →
            </Text>
          </Pressable>
        )}
      </View>

      {/* ── SMART INSIGHT FOOTER PILL ── */}
      <View
        style={{
          padding: 10,
          borderRadius: 10,
          backgroundColor: isOverBudget
            ? (theme.isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2')
            : totalIncome > 0 && isHealthyCashflow
            ? (theme.isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4')
            : (theme.isDark ? 'rgba(129, 140, 248, 0.12)' : 'rgba(15, 92, 77, 0.08)'),
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {isOverBudget ? (
          <TrendingUp size={16} color={theme.colors.danger} />
        ) : totalIncome > 0 && isHealthyCashflow ? (
          <TrendingDown size={16} color="#10B981" />
        ) : (
          <Zap size={16} color={theme.colors.primary} />
        )}
        <Text
          variant="caption"
          style={{
            flex: 1,
            fontSize: 11.5,
            lineHeight: 16,
            color: isOverBudget
              ? theme.colors.danger
              : totalIncome > 0 && !isHealthyCashflow
              ? theme.colors.danger
              : totalIncome > 0 && isHealthyCashflow
              ? '#10B981'
              : theme.colors.text,
          }}
        >
          {isOverBudget && !isHealthyCashflow
            ? `Critical Alert: Budget exceeded by ${formatMoney(totalExpense - effectiveBudget, currency)} AND cash flow is in deficit by ${formatMoney(Math.abs(netSavings), currency)}.`
            : isOverBudget && isHealthyCashflow
            ? `Budget Warning: Spending is ${formatMoney(totalExpense - effectiveBudget, currency)} over your budget limit, but cash flow remains positive (+${formatMoney(netSavings, currency)} saved).`
            : totalIncome > 0 && !isHealthyCashflow
            ? `Deficit Warning: Spending exceeds incoming revenue by ${formatMoney(Math.abs(netSavings), currency)}.`
            : totalIncome > 0 && isHealthyCashflow
            ? `Healthy Cash Flow: You are retaining ${formatMoney(netSavings, currency)} (${savingsRate}%) of incoming cash.`
            : `Tracking Outflow: ${formatMoney(totalExpense, currency)} spent across ${expenseItemsCount} transactions.`}
        </Text>
      </View>
    </Card>
  );
}
