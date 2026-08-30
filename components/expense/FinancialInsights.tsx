import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Moon,
  RefreshCw,
  Sun,
  Sunrise,
  Sunset,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney } from '@/utils/format';

interface FinancialInsightsProps {
  expenses: Expense[];
  targetCurrency: string;
  flowType: 'expense' | 'income';
  onFlipFlowType: () => void;
}

export function FinancialInsights({ expenses, targetCurrency, flowType, onFlipFlowType }: FinancialInsightsProps) {
  const theme = useTheme();
  const { t, language } = useLanguage();
  const { convert } = useExchangeRates();
  const { isPrivacyMode } = usePrivacy();
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<{ name: string; full: string; total: number; expenses: Expense[] } | null>(null);
  const flowFlipAnim = useRef(new Animated.Value(1)).current;

  const hasIncome = useMemo(() => expenses.some((e) => e.type === 'income'), [expenses]);

  // 1. Calculate Week Boundaries & Formatted Labels based on weekOffset
  const { weekStart, weekEnd, weekLabel, isCurrentWeek, startIso, endIso, daysWithDates } = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Target Monday (at local noon to avoid DST/timezone edge cases)
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday + weekOffset * 7, 12, 0, 0);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12, 0, 0);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const startIsoStr = toIso(monday);
    const endIsoStr = toIso(sunday);

    const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';
    const startStr = monday.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    const endStr = sunday.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

    const dayNames = [
      { name: 'Mon', full: 'Monday' },
      { name: 'Tue', full: 'Tuesday' },
      { name: 'Wed', full: 'Wednesday' },
      { name: 'Thu', full: 'Thursday' },
      { name: 'Fri', full: 'Friday' },
      { name: 'Sat', full: 'Saturday' },
      { name: 'Sun', full: 'Sunday' },
    ];

    const computedDays = dayNames.map((d, i) => {
      const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i, 12, 0, 0);
      return {
        ...d,
        dateStr: toIso(cur),
      };
    });

    return {
      weekStart: monday,
      weekEnd: sunday,
      startIso: startIsoStr,
      endIso: endIsoStr,
      daysWithDates: computedDays,
      weekLabel: `${startStr} – ${endStr}`,
      isCurrentWeek: weekOffset === 0,
    };
  }, [weekOffset, language]);

  // 2. Filter expenses & income to the navigated active week using ISO string comparison
  const activeWeekItems = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return false;
      const cleanDate = e.date.slice(0, 10);
      return cleanDate >= startIso && cleanDate <= endIso;
    });
  }, [expenses, startIso, endIso]);

  const activeWeekExpenses = useMemo(
    () => activeWeekItems.filter((e) => e.type !== 'income'),
    [activeWeekItems],
  );

  const activeWeekIncome = useMemo(
    () => activeWeekItems.filter((e) => e.type === 'income'),
    [activeWeekItems],
  );

  const activeTargetItems = useMemo(
    () => (flowType === 'income' ? activeWeekIncome : activeWeekExpenses),
    [flowType, activeWeekIncome, activeWeekExpenses],
  );

  const getAmount = (e: Expense) =>
    convert(Number(e.amount), e.currency || 'NPR', targetCurrency);

  const totalSpent = useMemo(
    () => activeWeekExpenses.reduce((sum, e) => sum + getAmount(e), 0),
    [activeWeekExpenses, targetCurrency, convert],
  );

  const totalIncome = useMemo(
    () => activeWeekIncome.reduce((sum, e) => sum + getAmount(e), 0),
    [activeWeekIncome, targetCurrency, convert],
  );

  const activeTotal = flowType === 'income' ? totalIncome : totalSpent;

  // 3. Day of Week Distribution (Mon -> Sun) for the active week
  const dayOfWeekStats = useMemo(() => {
    const days = daysWithDates.map((d) => ({
      ...d,
      total: 0,
      count: 0,
      expenses: [] as Expense[],
    }));

    activeTargetItems.forEach((e) => {
      if (!e.date) return;
      const cleanDate = e.date.slice(0, 10);
      const dayObj = days.find((d) => d.dateStr === cleanDate);
      if (dayObj) {
        const amt = getAmount(e);
        dayObj.total += amt;
        dayObj.count += 1;
        dayObj.expenses.push(e);
      }
    });

    const maxDaySpend = Math.max(...days.map((d) => d.total), 1);
    const peakDay = [...days].sort((a, b) => b.total - a.total)[0];

    return {
      days,
      maxDaySpend,
      peakDay: peakDay?.total > 0 ? peakDay : null,
      peakDayPct: peakDay?.total > 0 && activeTotal > 0 ? Math.round((peakDay.total / activeTotal) * 100) : 0,
    };
  }, [daysWithDates, activeTargetItems, targetCurrency, convert, activeTotal]);

  // 4. Time of Day Spending/Income Quadrants (Morning, Afternoon, Evening, Night) for active week
  const timeOfDayStats = useMemo(() => {
    const quadrants = [
      { key: 'morning', label: 'Morning', hours: '6 AM – 12 PM', icon: Sunrise, total: 0, count: 0, color: '#F59E0B' },
      { key: 'afternoon', label: 'Afternoon', hours: '12 PM – 5 PM', icon: Sun, total: 0, count: 0, color: '#38BDF8' },
      { key: 'evening', label: 'Evening', hours: '5 PM – 9 PM', icon: Sunset, total: 0, count: 0, color: '#818CF8' },
      { key: 'night', label: 'Night', hours: '9 PM – 6 AM', icon: Moon, total: 0, count: 0, color: '#C084FC' },
    ];

    activeTargetItems.forEach((e) => {
      const amt = getAmount(e);
      let hour = 12; // fallback noon if time not set
      if (e.time) {
        const parsedHour = parseInt(e.time.split(':')[0], 10);
        if (!isNaN(parsedHour)) hour = parsedHour;
      }

      if (hour >= 6 && hour < 12) {
        quadrants[0].total += amt;
        quadrants[0].count += 1;
      } else if (hour >= 12 && hour < 17) {
        quadrants[1].total += amt;
        quadrants[1].count += 1;
      } else if (hour >= 17 && hour < 21) {
        quadrants[2].total += amt;
        quadrants[2].count += 1;
      } else {
        quadrants[3].total += amt;
        quadrants[3].count += 1;
      }
    });

    const peakQuadrant = [...quadrants].sort((a, b) => b.total - a.total)[0];

    return {
      quadrants: quadrants.map((q) => ({
        ...q,
        pct: activeTotal > 0 ? Math.round((q.total / activeTotal) * 100) : 0,
      })),
      peakQuadrant: peakQuadrant?.total > 0 ? peakQuadrant : null,
    };
  }, [activeTargetItems, targetCurrency, convert, activeTotal]);

  function changeWeek(delta: number) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setWeekOffset((prev) => prev + delta);
  }

  function flipFlowType() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onFlipFlowType();
    setSelectedDay(null);
  }

  const chartColor = flowType === 'income' ? theme.colors.income : theme.colors.primary;
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
    <View style={{ gap: theme.spacing.md }}>
      {/* ── 1. DAY-OF-WEEK RHYTHM CARD WITH EMBEDDED WEEK NAVIGATOR & MINI FLOW SWITCHER ── */}
      <Animated.View style={flowFlipStyle}>
      <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
        {/* Card Header: Title on Left + Compact Mini-Pill & Stepper Controls on Right */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
            <Calendar size={17} color={chartColor} />
            <View style={{ minWidth: 0 }}>
              <Text variant="label" style={{ fontWeight: '700', fontSize: 14 }}>
                Day-of-Week Rhythm
              </Text>
              <Text variant="caption" muted style={{ fontSize: 10.5 }}>
                {weekLabel}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {/* Single flow flip button */}
            {hasIncome && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Flip to ${flowType === 'income' ? 'expenses' : 'income'}`}
                onPress={flipFlowType}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor:
                    flowType === 'income'
                      ? (theme.isDark ? 'rgba(52, 211, 153, 0.18)' : '#DCE9E3')
                      : (theme.isDark ? 'rgba(239, 68, 68, 0.18)' : '#F1DCD3'),
                  borderWidth: 1.2,
                  borderColor: flowType === 'income' ? '#059669' : theme.colors.danger,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <RefreshCw size={12} color={flowType === 'income' ? '#059669' : theme.colors.danger} />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: flowType === 'income' ? '#059669' : theme.colors.danger,
                  }}
                >
                  {flowType === 'income' ? t('flow_income') : t('flow_expenses')}
                </Text>
              </Pressable>
            )}

            {/* Stepper Controls */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                onPress={() => changeWeek(-1)}
                hitSlop={6}
                style={({ pressed }) => ({
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <ChevronLeft size={13} color={chartColor} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next week"
                onPress={() => changeWeek(1)}
                disabled={isCurrentWeek}
                hitSlop={6}
                style={({ pressed }) => ({
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: isCurrentWeek ? 'transparent' : theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: isCurrentWeek ? 'transparent' : theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isCurrentWeek ? 0.25 : pressed ? 0.6 : 1,
                })}
              >
                <ChevronRight size={13} color={isCurrentWeek ? theme.colors.textMuted : chartColor} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Peak day indicator and weekly total */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -2 }}>
          <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>
            {flowType === 'income' ? 'Weekly Inflow: ' : 'Weekly Total: '}
            <Text style={{ fontWeight: '800', color: chartColor }}>
              {isPrivacyMode ? '••••' : `${flowType === 'income' ? '+' : ''}${formatMoney(activeTotal, targetCurrency)}`}
            </Text>
          </Text>

          {dayOfWeekStats.peakDay ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: theme.radius.full,
                backgroundColor: flowType === 'income'
                  ? (theme.isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)')
                  : (theme.isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)'),
              }}
            >
              <Flame size={11} color={flowType === 'income' ? theme.colors.income : '#F59E0B'} />
              <Text
                variant="caption"
                style={{
                  fontWeight: '800',
                  color: flowType === 'income' ? '#10B981' : '#F59E0B',
                  fontSize: 10.5,
                }}
              >
                Peak: {dayOfWeekStats.peakDay.name} ({dayOfWeekStats.peakDayPct}%)
              </Text>
            </View>
          ) : null}
        </View>

        {activeTargetItems.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Text variant="caption" muted style={{ fontStyle: 'italic', fontSize: 12 }}>
              No {flowType === 'income' ? 'income' : 'expenses'} recorded in this week.
            </Text>
          </View>
        ) : (
          /* 7-Day Vertical Bar Chart */
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 6 }}>
            {dayOfWeekStats.days.map((day) => {
              const isPeak = dayOfWeekStats.peakDay?.name === day.name && day.total > 0;
              const hasSpend = day.total > 0;
              const barHeight = Math.max(8, Math.round((day.total / dayOfWeekStats.maxDaySpend) * 65));

              return (
                <Pressable
                  key={day.name}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${day.full} ${flowType}: ${formatMoney(day.total, targetCurrency)}`}
                  onPress={() => setSelectedDay(day)}
                  style={{ alignItems: 'center', flex: 1, gap: 4 }}
                >
                  {/* Amount label above bar (fixed height to prevent layout shifts) */}
                  <View style={{ height: 16, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                    {hasSpend ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 9.5,
                          fontWeight: '700',
                          color: isPeak ? chartColor : theme.colors.text,
                        }}
                      >
                        {isPrivacyMode
                          ? '••'
                          : day.total >= 1000
                          ? `${(day.total / 1000).toFixed(1)}k`
                          : Math.round(day.total)}
                      </Text>
                    ) : (
                      <Text variant="caption" muted style={{ fontSize: 9, opacity: 0.35 }}>
                        -
                      </Text>
                    )}
                  </View>

                  {/* Pillar Track (baseline alignment with 65px max height) */}
                  <View style={{ height: 65, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
                    <View
                      style={{
                        width: 22,
                        height: barHeight,
                        borderRadius: 6,
                        backgroundColor: isPeak
                          ? chartColor
                          : hasSpend
                          ? flowType === 'income'
                            ? (theme.isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)')
                            : (theme.isDark ? 'rgba(99, 102, 241, 0.45)' : 'rgba(79, 70, 229, 0.35)')
                          : theme.isDark
                          ? 'rgba(255,255,255,0.08)'
                          : 'rgba(0,0,0,0.08)',
                        shadowColor: isPeak ? chartColor : 'transparent',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: isPeak ? 0.35 : 0,
                        shadowRadius: 6,
                        elevation: isPeak ? 4 : 0,
                      }}
                    />
                  </View>

                  {/* Day label with comfortable room */}
                  <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                    <Text
                      variant="caption"
                      style={{
                        fontSize: 11,
                        fontWeight: isPeak || hasSpend ? '700' : '600',
                        color: isPeak ? chartColor : hasSpend ? theme.colors.text : theme.colors.textMuted,
                      }}
                    >
                      {day.name}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>
      </Animated.View>

      <Modal
        visible={Boolean(selectedDay)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDay(null)}
      >
        <Pressable
          onPress={() => setSelectedDay(null)}
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: theme.spacing.lg,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              maxHeight: '80%',
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">{selectedDay?.full} {flowType === 'income' ? 'Income' : 'Expenses'}</Text>
                <Text variant="caption" style={{ fontWeight: '700', color: chartColor }}>
                  {isPrivacyMode ? '••••' : formatMoney(selectedDay?.total ?? 0, targetCurrency)} · {selectedDay?.expenses.length ?? 0} {(selectedDay?.expenses.length ?? 0) === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close day details"
                onPress={() => setSelectedDay(null)}
                hitSlop={8}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={{ fontSize: 22, color: theme.colors.textMuted }}>×</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
              {selectedDay?.expenses.map((expense) => (
                <View
                  key={expense.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    paddingVertical: theme.spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{expense.categories?.icon || '💳'}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label" numberOfLines={1}>
                      {expense.description || expense.categories?.name || (flowType === 'income' ? 'Income' : 'Expense')}
                    </Text>
                    <Text variant="caption" muted>
                      {expense.date} · {expense.payment_method || 'Cash'}
                    </Text>
                  </View>
                  <Text
                    variant="label"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    style={{ maxWidth: 110, textAlign: 'right', color: chartColor, fontWeight: '800' }}
                  >
                    {isPrivacyMode ? '••••' : `${flowType === 'income' ? '+' : ''}${formatMoney(getAmount(expense), targetCurrency)}`}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 2. TIME-OF-DAY CHRONO PATTERN ── */}
      <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={18} color={chartColor} />
            <View>
              <Text variant="label" style={{ fontWeight: '700', fontSize: 15 }}>
                {flowType === 'income' ? 'Time-of-Day Earning Pattern' : 'Time-of-Day Spending Pattern'}
              </Text>
              <Text variant="caption" muted style={{ fontSize: 10.5 }}>
                {weekLabel} Chronotypes
              </Text>
            </View>
          </View>

          {timeOfDayStats.peakQuadrant ? (
            <Text variant="caption" muted style={{ fontSize: 11 }}>
              Prime: <Text style={{ fontWeight: '700', color: theme.colors.text }}>{timeOfDayStats.peakQuadrant.label}</Text>
            </Text>
          ) : null}
        </View>

        {/* 4 Quadrants Grid */}
        <View style={{ gap: 10 }}>
          {timeOfDayStats.quadrants.map((q) => {
            const Icon = q.icon;
            return (
              <View key={q.key} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon size={14} color={q.color} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>
                      {q.label}
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 10 }}>
                      ({q.hours})
                    </Text>
                  </View>
                  <Text variant="caption" style={{ fontWeight: '700', color: chartColor }}>
                    {formatMoney(q.total, targetCurrency)} ({q.pct}%)
                  </Text>
                </View>

                {/* Micro Progress Bar */}
                <View style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                  <View
                    style={{
                      width: `${q.pct}%`,
                      height: '100%',
                      backgroundColor: q.color,
                      borderRadius: 2,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}
