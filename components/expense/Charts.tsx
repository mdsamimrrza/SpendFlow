import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney, groupByCategory } from '@/utils/format';

export function CategoryBreakdown({ expenses, targetCurrency }: { expenses: Expense[]; targetCurrency?: string }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { rates } = useExchangeRates();
  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const data = groupByCategory(expenses, currency, rates).slice(0, 5);
  const total = data.reduce((sum, item) => sum + item.total, 0);

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Text variant="h3">Category Breakdown</Text>
      {total === 0 ? (
        <Text muted style={{ paddingVertical: theme.spacing.sm }}>
          No category spending recorded yet.
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'center' }}>
          <Svg width={118} height={118} viewBox="0 0 118 118">
            {data.map((item, index) => {
              const radius = 48 - index * 7;
              const stroke = 6;
              const circumference = 2 * Math.PI * radius;
              return (
                <Circle
                  key={item.label}
                  cx={59}
                  cy={59}
                  r={radius}
                  stroke={item.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${(item.total / total) * circumference} ${circumference}`}
                  strokeLinecap="round"
                  fill="transparent"
                  rotation={-90}
                  originX={59}
                  originY={59}
                />
              );
            })}
          </Svg>
          <View style={{ flex: 1, gap: theme.spacing.sm }}>
            {data.map((item) => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {item.icon} {item.label}
                </Text>
                <Text variant="caption" muted>
                  {Math.round((item.total / total) * 100)}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

export function TrendBars({ expenses, targetCurrency }: { expenses: Expense[]; targetCurrency?: string }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { rates, convert } = useExchangeRates();
  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';

  // 0 = Current Week, 1 = Previous Week, 2 = 2 Weeks Ago, etc.
  const [weekOffset, setWeekOffset] = useState(0);

  // 1. Map date -> total spent in target currency
  const spentByDate = expenses.reduce<Record<string, number>>((acc, expense) => {
    const converted = convert(Number(expense.amount), expense.currency || 'NPR', currency);
    acc[expense.date] = (acc[expense.date] ?? 0) + converted;
    return acc;
  }, {});

  // 2. Compute Monday through Sunday for the selected week offset
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const targetMonday = new Date(today);
  targetMonday.setDate(today.getDate() - distanceToMonday - weekOffset * 7);

  const weekDays: { dateStr: string; dayLabel: string; dayNum: number; fullDate: Date; amount: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(targetMonday);
    d.setDate(targetMonday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }); // Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const dayNum = d.getDate();
    weekDays.push({
      dateStr,
      dayLabel,
      dayNum,
      fullDate: d,
      amount: spentByDate[dateStr] ?? 0,
    });
  }

  const startDateStr = weekDays[0].fullDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDateStr = weekDays[6].fullDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const maxAmount = Math.max(...weekDays.map((d) => d.amount), 1);
  const totalWeekSpend = weekDays.reduce((sum, d) => sum + d.amount, 0);
  const dailyAverage = Math.round(totalWeekSpend / 7);

  const isCurrentWeek = weekOffset === 0;

  return (
    <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
      {/* HEADER & WEEK NAVIGATION */}
      <View style={{ gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h3">Spending Trend</Text>

          {/* Week Selector Controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.md, padding: 4, borderWidth: 1, borderColor: theme.colors.border }}>
            <Pressable
              hitSlop={8}
              onPress={() => setWeekOffset((prev) => prev + 1)}
              style={{ padding: 4, borderRadius: 4 }}
            >
              <ChevronLeft size={18} color={theme.colors.text} />
            </Pressable>

            <Text variant="caption" style={{ fontWeight: '700', paddingHorizontal: 4 }}>
              {isCurrentWeek ? 'This Week' : `${weekOffset} ${weekOffset === 1 ? 'Week' : 'Weeks'} Ago`}
            </Text>

            <Pressable
              hitSlop={8}
              disabled={isCurrentWeek}
              onPress={() => setWeekOffset((prev) => Math.max(0, prev - 1))}
              style={{ padding: 4, borderRadius: 4, opacity: isCurrentWeek ? 0.3 : 1 }}
            >
              <ChevronRight size={18} color={isCurrentWeek ? theme.colors.textMuted : theme.colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Date Range Subheader (Monday to Sunday) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="caption" muted style={{ fontWeight: '600' }}>
            📅 {startDateStr} – {endDateStr}
          </Text>
          <Text variant="caption" muted style={{ fontWeight: '600' }}>
            Avg: {formatMoney(dailyAverage, currency)}/day
          </Text>
        </View>
      </View>

      {/* SVG BAR CHART (MONDAY TO SUNDAY) */}
      <View style={{ height: 150, marginTop: theme.spacing.xs }}>
        <Svg width="100%" height="100%" viewBox="0 0 280 140" preserveAspectRatio="none">
          {/* Baseline Grid Line */}
          <Line x1="0" y1="95" x2="280" y2="95" stroke={theme.colors.border} strokeWidth="1" strokeDasharray="3 3" />

          {weekDays.map((item, index) => {
            const barWidth = 24;
            const gap = 16;
            const x = index * (barWidth + gap) + 8;
            const maxHeight = 75;
            const h = item.amount > 0 ? Math.max(8, (item.amount / maxAmount) * maxHeight) : 4;
            const isPeak = item.amount > 0 && item.amount === maxAmount;

            return (
              <React.Fragment key={item.dateStr}>
                {/* Background Track Bar */}
                <Rect
                  x={x}
                  y={20}
                  width={barWidth}
                  height={maxHeight}
                  rx={6}
                  fill={theme.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}
                />

                {/* Active Spend Bar */}
                <Rect
                  x={x}
                  y={95 - h}
                  width={barWidth}
                  height={h}
                  rx={6}
                  fill={theme.colors.primary}
                  opacity={item.amount > 0 ? (isPeak ? 1 : 0.75) : 0.2}
                />

                {/* Peak Indicator Dot */}
                {isPeak ? (
                  <Circle cx={x + barWidth / 2} cy={95 - h - 6} r={3} fill={theme.colors.primary} />
                ) : null}

                {/* Day Initial (Mon, Tue, Wed, Thu, Fri, Sat, Sun) */}
                <SvgText
                  x={x + barWidth / 2}
                  y={112}
                  fontSize="10"
                  fontWeight={isPeak ? '700' : '500'}
                  fill={isPeak ? theme.colors.primary : theme.colors.textMuted}
                  textAnchor="middle"
                >
                  {item.dayLabel}
                </SvgText>

                {/* Date Number (e.g. 18) */}
                <SvgText
                  x={x + barWidth / 2}
                  y={126}
                  fontSize="10"
                  fontWeight={isPeak ? '700' : '600'}
                  fill={isPeak ? theme.colors.primary : theme.colors.text}
                  textAnchor="middle"
                >
                  {item.dayNum}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>

      {/* SUMMARY FOOTER */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Text variant="caption" muted>
          Peak day: <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>{formatMoney(maxAmount, currency)}</Text>
        </Text>
        <Text variant="caption" muted>
          Week Total: <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>{formatMoney(totalWeekSpend, currency)}</Text>
        </Text>
      </View>
    </Card>
  );
}
