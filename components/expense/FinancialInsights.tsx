import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Calendar, Clock, Flame, Moon, Sparkles, Sun, Sunrise, Sunset, Zap } from 'lucide-react-native';
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

  const getAmount = (e: Expense) =>
    convert(Number(e.amount), e.currency || 'NPR', targetCurrency);

  const totalSpent = useMemo(
    () => expenses.reduce((sum, e) => sum + getAmount(e), 0),
    [expenses, targetCurrency, convert],
  );

  // 1. Day of Week Distribution (Mon -> Sun)
  const dayOfWeekStats = useMemo(() => {
    const days = [
      { name: 'Mon', full: 'Monday', total: 0, count: 0 },
      { name: 'Tue', full: 'Tuesday', total: 0, count: 0 },
      { name: 'Wed', full: 'Wednesday', total: 0, count: 0 },
      { name: 'Thu', full: 'Thursday', total: 0, count: 0 },
      { name: 'Fri', full: 'Friday', total: 0, count: 0 },
      { name: 'Sat', full: 'Saturday', total: 0, count: 0 },
      { name: 'Sun', full: 'Sunday', total: 0, count: 0 },
    ];

    expenses.forEach((e) => {
      if (!e.date) return;
      const d = new Date(e.date);
      const dayIdx = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
      const mappedIdx = dayIdx === 0 ? 6 : dayIdx - 1; // Map to Mon(0) -> Sun(6)
      const amt = getAmount(e);
      days[mappedIdx].total += amt;
      days[mappedIdx].count += 1;
    });

    const maxDaySpend = Math.max(...days.map((d) => d.total), 1);
    const peakDay = [...days].sort((a, b) => b.total - a.total)[0];

    return {
      days,
      maxDaySpend,
      peakDay: peakDay?.total > 0 ? peakDay : null,
      peakDayPct: peakDay?.total > 0 && totalSpent > 0 ? Math.round((peakDay.total / totalSpent) * 100) : 0,
    };
  }, [expenses, targetCurrency, convert, totalSpent]);

  // 2. Time of Day Spending Quadrants (Morning, Afternoon, Evening, Night)
  const timeOfDayStats = useMemo(() => {
    const quadrants = [
      { key: 'morning', label: 'Morning', hours: '6 AM – 12 PM', icon: Sunrise, total: 0, count: 0, color: '#F59E0B' },
      { key: 'afternoon', label: 'Afternoon', hours: '12 PM – 5 PM', icon: Sun, total: 0, count: 0, color: '#38BDF8' },
      { key: 'evening', label: 'Evening', hours: '5 PM – 9 PM', icon: Sunset, total: 0, count: 0, color: '#818CF8' },
      { key: 'night', label: 'Night', hours: '9 PM – 6 AM', icon: Moon, total: 0, count: 0, color: '#C084FC' },
    ];

    expenses.forEach((e) => {
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
  }, [expenses, targetCurrency, convert, totalSpent]);

  if (expenses.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {/* ── 1. DAY-OF-WEEK SPENDING RHYTHM CARD ── */}
      <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Calendar size={18} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
              Day-of-Week Spending Rhythm
            </Text>
          </View>

          {dayOfWeekStats.peakDay ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: theme.radius.full,
                backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
              }}
            >
              <Flame size={12} color="#F59E0B" />
              <Text variant="caption" style={{ fontWeight: '700', color: '#F59E0B', fontSize: 11 }}>
                Peak: {dayOfWeekStats.peakDay.name} ({dayOfWeekStats.peakDayPct}%)
              </Text>
            </View>
          ) : null}
        </View>

        {/* 7-Day Vertical Bar Chart */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 110, paddingTop: 10 }}>
          {dayOfWeekStats.days.map((day) => {
            const isPeak = dayOfWeekStats.peakDay?.name === day.name && day.total > 0;
            const barHeight = Math.max(8, Math.round((day.total / dayOfWeekStats.maxDaySpend) * 80));

            return (
              <View key={day.name} style={{ alignItems: 'center', flex: 1, gap: 6 }}>
                {/* Amount label above peak bar */}
                {isPeak ? (
                  <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.primary }}>
                    {day.total >= 1000 ? `${(day.total / 1000).toFixed(1)}k` : Math.round(day.total)}
                  </Text>
                ) : (
                  <View style={{ height: 12 }} />
                )}

                {/* Animated Pillar */}
                <View
                  style={{
                    width: 22,
                    height: barHeight,
                    borderRadius: 6,
                    backgroundColor: isPeak
                      ? theme.colors.primary
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

                {/* Day label */}
                <Text
                  variant="caption"
                  style={{
                    fontSize: 11,
                    fontWeight: isPeak ? '800' : '600',
                    color: isPeak ? theme.colors.primary : theme.colors.textMuted,
                  }}
                >
                  {day.name}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* ── 2. TIME-OF-DAY CHRONO SPENDING PATTERN ── */}
      <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={18} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
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
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                      {q.label}
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 10 }}>
                      ({q.hours})
                    </Text>
                  </View>
                  <Text variant="caption" style={{ fontWeight: '800', color: theme.colors.primary }}>
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
