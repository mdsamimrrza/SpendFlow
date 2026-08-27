import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import {
  Clock,
  CreditCard,
  Settings,
} from 'lucide-react-native';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { formatBudgetPercent, formatMoney } from '@/utils/format';

interface BudgetLimitHeroCardProps {
  monthTotal: number;
  monthlyBudget: number;
  preferredCurrency: string;
  formattedDate: string;
  fullMonthName?: string;
  todayTotal?: number;
  prevMonthTotal?: number;
}

export function BudgetLimitHeroCard({
  monthTotal,
  monthlyBudget,
  preferredCurrency,
  formattedDate,
  todayTotal = 0,
  prevMonthTotal = 0,
}: BudgetLimitHeroCardProps) {
  const theme = useTheme();
  const { t, language } = useLanguage();
  const { isPrivacyMode } = usePrivacy();

  const isBudgetSet = monthlyBudget > 0;
  const remaining = isBudgetSet ? monthlyBudget - monthTotal : 0;
  const ratio = isBudgetSet ? Math.min(monthTotal / monthlyBudget, 1.5) : 0;
  const isOverBudget = isBudgetSet && monthTotal > monthlyBudget;

  const progressColor = isOverBudget
    ? theme.colors.danger
    : ratio >= 0.9
    ? '#EF4444'
    : ratio >= 0.75
    ? '#A8791F'
    : theme.colors.primary;

  // Month vs last month comparison calculation
  let pctVsLastMonth = 0;
  let isUp = true;
  if (prevMonthTotal > 0) {
    const diff = monthTotal - prevMonthTotal;
    pctVsLastMonth = Math.abs(Math.round((diff / prevMonthTotal) * 1000) / 10);
    isUp = diff >= 0;
  } else if (monthTotal > 0) {
    pctVsLastMonth = 100;
    isUp = true;
  }

  // Used percentage calculation
  const usedPercent = isBudgetSet ? formatBudgetPercent(monthTotal, monthlyBudget) : '0%';

  // Current month name (e.g. "August")
  const currentMonthName = new Date().toLocaleDateString(
    language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US',
    { month: 'long' }
  );

  // Calculate unmasked text length to establish stable minimum width
  const unmaskedLength = useMemo(() => {
    const unmaskedStr = formatMoney(monthTotal, preferredCurrency, false);
    return Math.max(140, unmaskedStr.length * 15.5);
  }, [monthTotal, preferredCurrency]);

  return (
    <Card
      style={{
        gap: 12,
        padding: 16,
        backgroundColor: theme.colors.surface,
        borderColor: isOverBudget
          ? theme.colors.danger
          : theme.isDark
          ? 'rgba(129, 140, 248, 0.35)'
          : theme.colors.border,
        borderWidth: 1.5,
        borderRadius: 20,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: theme.isDark ? 0.2 : 0.05,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      {/* ── 1. HEADER: [ 💳    TOTAL SPENT IN <MONTH> ] ... [ ⚙️ Settings ] ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CreditCard size={15} color={theme.isDark ? '#14c181' : '#064E3B'} />
          <Text
            variant="caption"
            style={{
              color: theme.isDark ? '#34D399' : '#064E3B',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              fontWeight: '600',
              fontSize: 11,
            }}
          >
            TOTAL SPENT IN {currentMonthName.toUpperCase()}
          </Text>
        </View>

        <Link href="/settings" asChild>
          <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Settings size={13} color={theme.colors.textMuted} />
            <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
              Settings
            </Text>
          </Pressable>
        </Link>
      </View>

      {/* ── 2. AMOUNT & DYNAMIC TREND ROW ── */}
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ minWidth: unmaskedLength, justifyContent: 'center' }}>
              <Text
                variant="h1"
                numberOfLines={1}
                style={{
                  fontSize: 28,
                  lineHeight: 34,
                  fontWeight: '900',
                  fontVariant: ['tabular-nums'],
                  color: theme.colors.text,
                  letterSpacing: -0.5,
                }}
              >
                {formatMoney(monthTotal, preferredCurrency)}
              </Text>
            </View>
            <PrivacyEyeButton />
          </View>

          {/* ▲ 4.1% vs last month badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: theme.radius.full,
              backgroundColor: isUp
                ? (theme.isDark ? 'rgba(239,68,68,0.18)' : '#F1DCD3')
                : (theme.isDark ? 'rgba(16,185,129,0.18)' : '#DCE9E3'),
              borderWidth: 1,
              borderColor: isUp
                ? (theme.isDark ? '#EF4444' : '#A5442B')
                : (theme.isDark ? '#10B981' : '#0F5C4D'),
            }}
          >
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: '800',
                color: isUp
                  ? (theme.isDark ? '#EF4444' : '#A5442B')
                  : (theme.isDark ? '#10B981' : '#0F5C4D'),
              }}
            >
              {isUp ? '▲' : '▼'} {pctVsLastMonth}% vs last month
            </Text>
          </View>
        </View>

        <Text variant="caption" muted style={{ fontSize: 12, fontWeight: '500' }}>
          {formattedDate} • {preferredCurrency}
        </Text>
      </View>

      {/* ── 3. REMAINING BADGE & PROGRESS BAR ── */}
      {isBudgetSet ? (
        <View style={{ gap: 5, marginTop: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={12} color={isOverBudget ? theme.colors.danger : '#A8791F'} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: isOverBudget ? theme.colors.danger : '#A8791F',
                }}
              >
                {isOverBudget
                  ? `${formatMoney(Math.abs(remaining), preferredCurrency)} exceeded`
                  : `${formatMoney(remaining, preferredCurrency)} remaining`}
              </Text>
            </View>

            <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
              Target: {formatMoney(monthlyBudget, preferredCurrency)} ({usedPercent})
            </Text>
          </View>

          {/* Progress Bar */}
          <View
            style={{
              position: 'relative',
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : theme.colors.surfaceElevated,
            }}
          >
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
      ) : null}

      {/* ── 4. BOTTOM 3-BOX METRICS TILES (SPENT TODAY | TARGET LIMIT | BUDGET STATUS) ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 2,
        }}
      >
        {/* Box 1: Spent Today */}
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: 14,
            paddingVertical: 9,
            paddingHorizontal: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
            Spent Today
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: theme.colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatMoney(todayTotal, preferredCurrency)}
          </Text>
        </View>

        {/* Box 2: Target Limit */}
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: 14,
            paddingVertical: 9,
            paddingHorizontal: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
            Target Limit
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: theme.colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {isBudgetSet ? formatMoney(monthlyBudget, preferredCurrency) : 'Not set'}
          </Text>
        </View>

        {/* Box 3: Budget Status */}
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: 14,
            paddingVertical: 9,
            paddingHorizontal: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
            Budget Status
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: progressColor,
              fontVariant: ['tabular-nums'],
            }}
          >
            {usedPercent} Used
          </Text>
        </View>
      </View>
    </Card>
  );
}
