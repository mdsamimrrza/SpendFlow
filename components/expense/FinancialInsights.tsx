import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Moon,
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
}

export function FinancialInsights({ expenses, targetCurrency }: FinancialInsightsProps) {
  const theme = useTheme();
  const { t, language } = useLanguage();
  const { convert } = useExchangeRates();
  const { isPrivacyMode } = usePrivacy();
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<{ name: string; full: string; total: number; expenses: Expense[] } | null>(null);

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

  // 2. Filter expenses to the navigated active week using ISO string comparison (robust across Hermes & Web)
  const activeWeekExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return false;
      const cleanDate = e.date.slice(0, 10);
      return cleanDate >= startIso && cleanDate <= endIso;
    });
  }, [expenses, startIso, endIso]);

  const getAmount = (e: Expense) =>
    convert(Number(e.amount), e.currency || 'NPR', targetCurrency);

  const totalSpent = useMemo(
    () => activeWeekExpenses.reduce((sum, e) => sum + getAmount(e), 0),
    [activeWeekExpenses, targetCurrency, convert],
  );

  // 3. Day of Week Distribution (Mon -> Sun) for the active week
  const dayOfWeekStats = useMemo(() => {
    const days = daysWithDates.map((d) => ({
      ...d,
      total: 0,
      count: 0,
      expenses: [] as Expense[],
    }));

    activeWeekExpenses.forEach((e) => {
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
      peakDayPct: peakDay?.total > 0 && totalSpent > 0 ? Math.round((peakDay.total / totalSpent) * 100) : 0,
    };
  }, [daysWithDates, activeWeekExpenses, targetCurrency, convert, totalSpent]);

  // 4. Time of Day Spending Quadrants (Morning, Afternoon, Evening, Night) for active week
  const timeOfDayStats = useMemo(() => {
    const quadrants = [
      { key: 'morning', label: 'Morning', hours: '6 AM – 12 PM', icon: Sunrise, total: 0, count: 0, color: '#F59E0B' },
      { key: 'afternoon', label: 'Afternoon', hours: '12 PM – 5 PM', icon: Sun, total: 0, count: 0, color: '#38BDF8' },
      { key: 'evening', label: 'Evening', hours: '5 PM – 9 PM', icon: Sunset, total: 0, count: 0, color: '#818CF8' },
      { key: 'night', label: 'Night', hours: '9 PM – 6 AM', icon: Moon, total: 0, count: 0, color: '#C084FC' },
    ];

    activeWeekExpenses.forEach((e) => {
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
        pct: totalSpent > 0 ? Math.round((q.total / totalSpent) * 100) : 0,
      })),
      peakQuadrant: peakQuadrant?.total > 0 ? peakQuadrant : null,
    };
  }, [activeWeekExpenses, targetCurrency, convert, totalSpent]);

  function changeWeek(delta: number) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setWeekOffset((prev) => prev + delta);
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      {/* ── 1. DAY-OF-WEEK SPENDING RHYTHM CARD WITH EMBEDDED WEEK NAVIGATOR ── */}
      <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
        {/* Card Header: Title on Left + Embedded Week Stepper [ ◀ ] [ ▶ ] on Right */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Calendar size={18} color={theme.colors.primary} />
            <View>
              <Text variant="label" style={{ fontWeight: '700', fontSize: 15 }}>
                Day-of-Week Rhythm
              </Text>
              <Text variant="caption" muted style={{ fontSize: 10.5 }}>
                {weekLabel}
              </Text>
            </View>
          </View>

          {/* Stepper Controls embedded in header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              onPress={() => changeWeek(-1)}
              hitSlop={8}
              style={({ pressed }) => ({
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <ChevronLeft size={14} color={theme.colors.primary} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next week"
              onPress={() => changeWeek(1)}
              disabled={isCurrentWeek}
              hitSlop={8}
              style={({ pressed }) => ({
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isCurrentWeek ? 'transparent' : theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: isCurrentWeek ? 'transparent' : theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isCurrentWeek ? 0.25 : pressed ? 0.6 : 1,
              })}
            >
              <ChevronRight size={14} color={isCurrentWeek ? theme.colors.textMuted : theme.colors.primary} />
            </Pressable>
          </View>
        </View>

        {/* Peak day indicator */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          {dayOfWeekStats.peakDay ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: theme.radius.full,
                backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
              }}
            >
              <Flame size={11} color="#F59E0B" />
              <Text variant="caption" style={{ fontWeight: '700', color: '#F59E0B', fontSize: 10.5 }}>
                Peak: {dayOfWeekStats.peakDay.name} ({dayOfWeekStats.peakDayPct}%)
              </Text>
            </View>
          ) : null}
        </View>

        {activeWeekExpenses.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Text variant="caption" muted style={{ fontStyle: 'italic', fontSize: 12 }}>
              No expenses recorded in this week.
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
                  accessibilityLabel={`View ${day.full} expenses: ${formatMoney(day.total, targetCurrency)}`}
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
                          color: isPeak ? theme.colors.primary : theme.colors.text,
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
                          ? theme.colors.primary
                          : hasSpend
                          ? (theme.isDark ? 'rgba(99, 102, 241, 0.45)' : 'rgba(79, 70, 229, 0.35)')
                          : theme.isDark
                          ? 'rgba(255,255,255,0.08)'
                          : 'rgba(0,0,0,0.08)',
                        shadowColor: isPeak ? theme.colors.primary : 'transparent',
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
                        color: isPeak ? theme.colors.primary : hasSpend ? theme.colors.text : theme.colors.textMuted,
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
                <Text variant="h3">{selectedDay?.full} Expenses</Text>
                <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary }}>
                  {isPrivacyMode ? '••••' : formatMoney(selectedDay?.total ?? 0, targetCurrency)} · {selectedDay?.expenses.length ?? 0} {(selectedDay?.expenses.length ?? 0) === 1 ? 'transaction' : 'transactions'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close day expenses"
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
                      {expense.description || expense.categories?.name || 'Expense'}
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
                    style={{ maxWidth: 110, textAlign: 'right', color: theme.colors.primary }}
                  >
                    {isPrivacyMode ? '••••' : formatMoney(getAmount(expense), targetCurrency)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 2. TIME-OF-DAY CHRONO SPENDING PATTERN ── */}
      <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={18} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '700', fontSize: 15 }}>
              Time-of-Day Chrono Pattern
            </Text>
          </View>

          {timeOfDayStats.peakQuadrant ? (
            <Text variant="caption" muted style={{ fontSize: 11 }}>
              Most active: <Text style={{ fontWeight: '700', color: theme.colors.text }}>{timeOfDayStats.peakQuadrant.label}</Text>
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
                  <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary }}>
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
