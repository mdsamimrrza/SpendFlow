import React, { useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { format, parseISO } from 'date-fns';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useRateResolver } from '@/hooks/useRateResolver';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney, getMonthlyBudget, sumExpenses, sumIncome } from '@/utils/format';

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
  const { t, language } = useLanguage();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;

  // ── Month-to-month navigation: bucket the provided scope by calendar month.
  // Offset 0 = latest month in the data; < walks back, > walks forward. ──
  const [monthOffset, setMonthOffset] = useState(0);
  const monthKeys = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) set.add(e.date.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [expenses]);
  const safeOffset = Math.min(monthOffset, Math.max(monthKeys.length - 1, 0));
  const activeMonthKey = monthKeys[safeOffset] ?? '';
  const monthItems = useMemo(
    () => (activeMonthKey ? expenses.filter((e) => e.date.slice(0, 7) === activeMonthKey) : expenses),
    [expenses, activeMonthKey],
  );
  const monthLabel = useMemo(() => {
    if (!activeMonthKey) return '';
    const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';
    try {
      return parseISO(`${activeMonthKey}-01`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    } catch {
      return activeMonthKey;
    }
  }, [activeMonthKey, language]);
  const goPrevMonth = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    setMonthOffset((o) => Math.min(o + 1, Math.max(monthKeys.length - 1, 0)));
  };
  const goNextMonth = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    setMonthOffset((o) => Math.max(o - 1, 0));
  };

  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const { resolver: rateResolver } = useRateResolver(expenses, currency);
  const effectiveBudget = monthlyBudget > 0 ? monthlyBudget : getMonthlyBudget(profile, rateResolver, currency);

  const totalIncome = useMemo(() => rateResolver ? sumIncome(monthItems, currency, rateResolver) : 0, [monthItems, currency, rateResolver]);
  const totalExpense = useMemo(() => rateResolver ? sumExpenses(monthItems, currency, rateResolver, 'expense') : 0, [monthItems, currency, rateResolver]);
  const netSavings = totalIncome - totalExpense;

  const incomeItemsCount = monthItems.filter((e) => e.type === 'income').length;
  const expenseItemsCount = monthItems.filter((e) => e.type !== 'income').length;

  // Budget percentage calculation: convert both expenses and budget to the budget's currency
  // using the SAME RateResolver (historical rates) for consistency
  const budgetCurrency = (profile?.budget_currency || profile?.preferred_currency || 'NPR').toUpperCase();
  const expenseInBudgetCurrency = useMemo(() =>
    rateResolver ? sumExpenses(monthItems, budgetCurrency, rateResolver, 'expense') : 0,
    [monthItems, budgetCurrency, rateResolver]
  );
  const budgetInBudgetCurrency = useMemo(() => 
    getMonthlyBudget(profile, rateResolver, budgetCurrency), 
    [profile, rateResolver, budgetCurrency]
  );

  // Ratios & Percentages
  const savingsRate = totalIncome > 0 ? Math.max(-100, Math.round((netSavings / totalIncome) * 100)) : 0;
  const expenseToIncomeRatio = totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;
  // Use budget currency ratio so switching display currency never changes the %
  const budgetUtilizationRatio = budgetInBudgetCurrency > 0 ? Math.round((expenseInBudgetCurrency / budgetInBudgetCurrency) * 100) : 0;

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
              borderColor: isHealthyCashflow ? theme.colors.income : '#EF4444',
            }}
          >
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: isHealthyCashflow ? theme.colors.income : '#EF4444' }}>
              {isHealthyCashflow ? `+${savingsRate}% Saved` : 'Deficit'}
            </Text>
          </View>
        )}
      </View>

      {/* ── MONTH STEPPER — browse the scope month to month ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Pressable
          onPress={goPrevMonth}
          disabled={safeOffset >= monthKeys.length - 1}
          accessibilityLabel="Previous month"
          style={({ pressed }) => ({
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
            opacity: safeOffset >= monthKeys.length - 1 ? 0.35 : pressed ? 0.7 : 1,
          })}
        >
          <ChevronLeft size={15} color={theme.colors.text} />
        </Pressable>
        <Text
          variant="caption"
          numberOfLines={1}
          style={{ fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: theme.colors.textMuted, minWidth: 130, textAlign: 'center' }}
        >
          {monthLabel}
        </Text>
        <Pressable
          onPress={goNextMonth}
          disabled={safeOffset <= 0}
          accessibilityLabel="Next month"
          style={({ pressed }) => ({
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
            opacity: safeOffset <= 0 ? 0.35 : pressed ? 0.7 : 1,
          })}
        >
          <ChevronRight size={15} color={theme.colors.text} />
        </Pressable>
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
            <Text variant="caption" style={{ fontWeight: '800', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.income }}>
              Income (+)
            </Text>
            <ArrowDownRight size={14} color={theme.colors.income} />
          </View>
          <Text
            variant="h3"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], color: theme.colors.income }}
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

      {/* ── NET PROFIT — the selected month's bottom line ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <Text variant="caption" style={{ fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: theme.colors.textMuted }}>
          {netSavings >= 0 ? 'Net Profit' : 'Net Loss'}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            fontSize: 17,
            fontWeight: '900',
            fontVariant: ['tabular-nums'],
            color: netSavings >= 0 ? theme.colors.income : theme.colors.danger,
            flexShrink: 1,
          }}
        >
          {netSavings >= 0 ? '+' : '−'}{formatMoney(Math.abs(netSavings), currency)}
        </Text>
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
              <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 12, fontWeight: '800', flexShrink: 1, color: expenseToIncomeRatio > 100 ? theme.colors.danger : theme.colors.primary }}>
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
                  backgroundColor: expenseToIncomeRatio > 100 ? theme.colors.danger : expenseToIncomeRatio > 80 ? theme.colors.warning : theme.colors.income,
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
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  flexShrink: 1,
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
          <TrendingDown size={16} color={theme.colors.income} />
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
              ? theme.colors.income
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
