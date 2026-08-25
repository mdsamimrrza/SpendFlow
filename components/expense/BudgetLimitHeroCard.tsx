import React from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { AlertCircle, ArrowUpRight, CheckCircle2, ChevronRight, Gauge, Sparkles, Target, Wallet } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { formatBudgetPercent, formatMoney } from '@/utils/format';

interface BudgetLimitHeroCardProps {
  monthTotal: number;
  monthlyBudget: number;
  preferredCurrency: string;
  formattedDate: string;
}

export function BudgetLimitHeroCard({
  monthTotal,
  monthlyBudget,
  preferredCurrency,
  formattedDate,
}: BudgetLimitHeroCardProps) {
  const theme = useTheme();
  const { t } = useLanguage();

  const isBudgetSet = monthlyBudget > 0;
  const remaining = isBudgetSet ? monthlyBudget - monthTotal : 0;
  const ratio = isBudgetSet ? Math.min(monthTotal / monthlyBudget, 1.5) : 0;
  const isOverBudget = isBudgetSet && monthTotal > monthlyBudget;

  const progressColor = isOverBudget
    ? theme.colors.danger
    : ratio >= 0.9
    ? '#EF4444'
    : ratio >= 0.75
    ? '#F59E0B'
    : theme.colors.success;

  // Compute days remaining in the current month
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);
  const dailySafeSpend = isBudgetSet && remaining > 0 ? Math.round(remaining / remainingDays) : 0;

  return (
    <Card
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        backgroundColor: theme.isDark ? '#111827' : '#EEF2FF',
        borderColor: isOverBudget ? theme.colors.danger : theme.colors.primary,
        borderWidth: 1.5,
        borderRadius: theme.radius.lg,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: theme.isDark ? 0.25 : 0.12,
        shadowRadius: 16,
        elevation: 6,
      }}
    >
      {/* 1. Header: Total Spent Label & Budget Target Indicator */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Wallet size={16} color={theme.colors.primary} />
          </View>
          <Text
            variant="caption"
            style={{
              color: theme.colors.primary,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              fontWeight: '800',
              fontSize: 11,
            }}
          >
            {t('home_total_spent_month') || 'Total Spent This Month'}
          </Text>
        </View>

        <Link href="/settings" asChild>
          <Pressable
            hitSlop={8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Target size={12} color={theme.colors.textMuted} />
            <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
              {isBudgetSet ? `${formatMoney(monthlyBudget, preferredCurrency)} limit` : 'Set Limit'}
            </Text>
            <ChevronRight size={12} color={theme.colors.textMuted} />
          </Pressable>
        </Link>
      </View>

      {/* 2. Main Spend Number & Remaining Counter Row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text
            variant="h1"
            style={{
              fontSize: 34,
              lineHeight: 40,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
              color: theme.colors.text,
            }}
          >
            {formatMoney(monthTotal, preferredCurrency)}
          </Text>
          <Text variant="caption" muted style={{ fontSize: 12 }}>
            {formattedDate} • {preferredCurrency}
          </Text>
        </View>

        {isBudgetSet ? (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
              {isOverBudget ? 'Exceeded by' : 'Remaining Limit'}
            </Text>
            <Text
              variant="label"
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: progressColor,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatMoney(Math.abs(remaining), preferredCurrency)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 3. Budget Saturation Gauge & Milestone Ticks */}
      {isBudgetSet ? (
        <View style={{ gap: 8, backgroundColor: theme.colors.surfaceElevated, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}>
          {/* Status line */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {isOverBudget ? (
                <AlertCircle size={14} color={theme.colors.danger} />
              ) : (
                <CheckCircle2 size={14} color={progressColor} />
              )}
              <Text variant="caption" style={{ color: progressColor, fontWeight: '700', fontSize: 12 }}>
                {isOverBudget
                  ? `Over budget limit by ${formatMoney(Math.abs(remaining), preferredCurrency)}`
                  : `${formatBudgetPercent(monthTotal, monthlyBudget)} used (${formatMoney(remaining, preferredCurrency)} left)`}
              </Text>
            </View>

            <Text variant="caption" muted style={{ fontSize: 11 }}>
              {remainingDays} days left
            </Text>
          </View>

          {/* Segmented Progress Bar */}
          <View style={{ position: 'relative', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
            <View
              style={{
                width: `${Math.min(ratio * 100, 100)}%`,
                height: '100%',
                backgroundColor: progressColor,
                borderRadius: 4,
              }}
            />
          </View>

          {/* Daily Safe Spend Velocity */}
          {dailySafeSpend > 0 && !isOverBudget ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Sparkles size={13} color={theme.colors.primary} />
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                Safe spend pace: <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{formatMoney(dailySafeSpend, preferredCurrency)} / day</Text>
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        /* No Budget Set Prompt */
        <Link href="/settings" asChild>
          <Pressable
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 12,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Gauge size={16} color={theme.colors.primary} />
              <Text variant="caption" style={{ fontWeight: '600', color: theme.colors.text }}>
                Set a Monthly Budget Limit to activate alerts & remaining gauges
              </Text>
            </View>
            <ArrowUpRight size={14} color={theme.colors.primary} />
          </Pressable>
        </Link>
      )}
    </Card>
  );
}
