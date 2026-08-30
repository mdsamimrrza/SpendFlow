import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Sparkles, TrendingUp, Wallet } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney } from '@/utils/format';

export type TimeFilter = 'today' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type FlowViewMode = 'both' | 'expense' | 'income';

interface DayBreakdown {
  date: string;        // YYYY-MM-DD
  weekday: string;     // "Mon", "Tue" etc.
  dayNum: number;      // 15, 16 etc.
  expenseAmount: number;
  incomeAmount: number;
}

interface FlowDataPoint {
  label: string;
  subLabel?: string;
  expenseAmount: number;
  incomeAmount: number;
  dateKey: string;
  dayBreakdown?: DayBreakdown[];  // populated for weekly filter only
}

// Formatter for on-graph tooltip values (shows full amount e.g. ₹ 2,742)
function shortMoney(val: number, currency: string): string {
  return `${currency} ${Math.round(val).toLocaleString()}`;
}

function buildBezierPath(
  coords: { x: number; y: number }[],
  chartHeight: number,
  chartPadLeft: number,
  drawWidth: number,
) {
  if (coords.length === 0) return { linePath: '', areaPath: '' };
  if (coords.length === 1) {
    const p = coords[0];
    return {
      linePath: `M ${chartPadLeft},${p.y} L ${chartPadLeft + drawWidth},${p.y}`,
      areaPath: `M ${chartPadLeft},${p.y} L ${chartPadLeft + drawWidth},${p.y} L ${chartPadLeft + drawWidth},${chartHeight} L ${chartPadLeft},${chartHeight} Z`,
    };
  }
  let d = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const tension = 5;
    const cp1x = p1.x + (p2.x - p0.x) / tension;
    const cp1y = p1.y + (p2.y - p0.y) / tension;
    const cp2x = p2.x - (p3.x - p1.x) / tension;
    const cp2y = p2.y - (p3.y - p1.y) / tension;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  const area = `${d} L ${coords[coords.length - 1].x},${chartHeight} L ${coords[0].x},${chartHeight} Z`;
  return { linePath: d, areaPath: area };
}

export function StockTrendChart({
  expenses,
  targetCurrency = 'NPR',
}: {
  expenses: Expense[];
  targetCurrency?: string;
}) {
  const theme = useTheme();
  const { t, language } = useLanguage();
  const { convert } = useExchangeRates();
  usePrivacy();
  const { width } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<FlowViewMode>('both');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filter, setFilter] = useState<TimeFilter>('daily');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasIncome = useMemo(() => expenses.some((e) => e.type === 'income'), [expenses]);

  const handleSelectPoint = (index: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setSelectedIndex((prev) => {
      const next = prev === index ? null : index;
      if (next !== null) {
        dismissTimerRef.current = setTimeout(() => {
          setSelectedIndex(null);
        }, 5000);
      }
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const chartWidth = Math.max(Math.min(width - 64, 720), 280);
  const chartHeight = 180;
  const chartPadLeft = 6;
  const chartPadRight = 6;
  const drawWidth = chartWidth - chartPadLeft - chartPadRight;

  const {
    points,
    currentExpenseTotal,
    currentIncomeTotal,
    previousExpenseTotal,
    previousIncomeTotal,
  } = useMemo(() => {
    const now = new Date();
    const resultPoints: FlowDataPoint[] = [];
    const getAmount = (e: Expense) =>
      convert(Number(e.amount), e.currency || 'NPR', targetCurrency);
    const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';

    const expenseOnly = expenses.filter((e) => (e.type || 'expense') === 'expense');
    const incomeOnly = expenses.filter((e) => e.type === 'income');

    if (filter === 'today') {
      const todayIso = now.toISOString().split('T')[0];
      const slotLabels = ['12am', '4am', '8am', '12pm', '4pm', '8pm'];
      for (let s = 0; s < 6; s++) {
        const slotStart = s * 4;
        const slotEnd = slotStart + 4;

        const slotExpenses = expenseOnly.filter((e) => {
          if (e.date !== todayIso) return false;
          if (!e.time) return s === 0;
          const hour = parseInt(e.time.split(':')[0], 10);
          return hour >= slotStart && hour < slotEnd;
        });

        const slotIncome = incomeOnly.filter((e) => {
          if (e.date !== todayIso) return false;
          if (!e.time) return s === 0;
          const hour = parseInt(e.time.split(':')[0], 10);
          return hour >= slotStart && hour < slotEnd;
        });

        const expAmt = slotExpenses.reduce((sum, e) => sum + getAmount(e), 0);
        const incAmt = slotIncome.reduce((sum, e) => sum + getAmount(e), 0);

        resultPoints.push({
          label: slotLabels[s],
          subLabel: `${slotLabels[s]} – ${slotLabels[s + 1] || '12am'}`,
          expenseAmount: expAmt,
          incomeAmount: incAmt,
          dateKey: `${todayIso}_${s}`,
        });
      }
    } else if (filter === 'daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const iso = d.toISOString().split('T')[0];

        const dayExp = expenseOnly.filter((e) => e.date === iso);
        const dayInc = incomeOnly.filter((e) => e.date === iso);

        const expAmt = dayExp.reduce((sum, e) => sum + getAmount(e), 0);
        const incAmt = dayInc.reduce((sum, e) => sum + getAmount(e), 0);

        resultPoints.push({
          label: d.toLocaleDateString(locale, { weekday: 'short' }),
          subLabel: d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
          expenseAmount: expAmt,
          incomeAmount: incAmt,
          dateKey: iso,
        });
      }
    } else if (filter === 'weekly') {
      // 1M = current calendar month split into 4 week-buckets (days 1–7, 8–14, 15–21, 22–end)
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthStr = String(month + 1).padStart(2, '0');
      const weekBuckets = [
        { start: 1,  end: 7,           label: 'W1', weekNum: 1 },
        { start: 8,  end: 14,          label: 'W2', weekNum: 2 },
        { start: 15, end: 21,          label: 'W3', weekNum: 3 },
        { start: 22, end: daysInMonth, label: 'W4', weekNum: 4 },
      ];

      for (const bucket of weekBuckets) {
        const pad = (n: number) => String(n).padStart(2, '0');
        const startIso = `${year}-${monthStr}-${pad(bucket.start)}`;
        const endIso   = `${year}-${monthStr}-${pad(bucket.end)}`;
        const startDate = new Date(year, month, bucket.start);
        const monthShort = startDate.toLocaleDateString(locale, { month: 'short' });

        const weekExp = expenseOnly.filter((e) => e.date >= startIso && e.date <= endIso);
        const weekInc = incomeOnly.filter((e) => e.date >= startIso && e.date <= endIso);

        // Build per-day breakdown for tooltip
        const breakdown: DayBreakdown[] = [];
        for (let d = bucket.start; d <= bucket.end; d++) {
          const iso = `${year}-${monthStr}-${pad(d)}`;
          const dateObj = new Date(year, month, d);
          const expAmt = expenseOnly.filter((e) => e.date === iso).reduce((sum, e) => sum + getAmount(e), 0);
          const incAmt = incomeOnly.filter((e) => e.date === iso).reduce((sum, e) => sum + getAmount(e), 0);
          if (expAmt > 0 || incAmt > 0) {
            breakdown.push({
              date: iso,
              weekday: dateObj.toLocaleDateString(locale, { weekday: 'short' }),
              dayNum: d,
              expenseAmount: expAmt,
              incomeAmount: incAmt,
            });
          }
        }

        resultPoints.push({
          label: bucket.label,
          subLabel: `Week ${bucket.weekNum} · ${monthShort} ${bucket.start}–${bucket.end}`,
          expenseAmount: weekExp.reduce((sum, e) => sum + getAmount(e), 0),
          incomeAmount:  weekInc.reduce((sum, e) => sum + getAmount(e), 0),
          dateKey: `${startIso}_${endIso}`,
          dayBreakdown: breakdown,
        });
      }
    } else if (filter === 'monthly') {
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const year = d.getFullYear();
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const monthPrefix = `${year}-${monthNum}`;

        const monthExp = expenseOnly.filter((e) => e.date.startsWith(monthPrefix));
        const monthInc = incomeOnly.filter((e) => e.date.startsWith(monthPrefix));

        const expAmt = monthExp.reduce((sum, e) => sum + getAmount(e), 0);
        const incAmt = monthInc.reduce((sum, e) => sum + getAmount(e), 0);

        resultPoints.push({
          label: d.toLocaleDateString(locale, { month: 'short' }),
          subLabel: `${d.toLocaleDateString(locale, { month: 'long' })} ${year}`,
          expenseAmount: expAmt,
          incomeAmount: incAmt,
          dateKey: monthPrefix,
        });
      }
    } else {
      // 1Y = Last 12 Months
      for (let m = 11; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const year = d.getFullYear();
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const monthPrefix = `${year}-${monthNum}`;

        const monthExp = expenseOnly.filter((e) => e.date.startsWith(monthPrefix));
        const monthInc = incomeOnly.filter((e) => e.date.startsWith(monthPrefix));

        const expAmt = monthExp.reduce((sum, e) => sum + getAmount(e), 0);
        const incAmt = monthInc.reduce((sum, e) => sum + getAmount(e), 0);

        resultPoints.push({
          label: d.toLocaleDateString(locale, { month: 'short' }),
          subLabel: `${d.toLocaleDateString(locale, { month: 'long' })} ${year}`,
          expenseAmount: expAmt,
          incomeAmount: incAmt,
          dateKey: monthPrefix,
        });
      }
    }

    const curExpTot = resultPoints.reduce((s, p) => s + p.expenseAmount, 0);
    const curIncTot = resultPoints.reduce((s, p) => s + p.incomeAmount, 0);

    let prevExp = 0;
    let prevInc = 0;
    if (filter === 'daily') {
      for (let i = 13; i >= 7; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        prevExp += expenseOnly.filter((e) => e.date === iso).reduce((sum, e) => sum + getAmount(e), 0);
        prevInc += incomeOnly.filter((e) => e.date === iso).reduce((sum, e) => sum + getAmount(e), 0);
      }
    } else if (filter === 'yearly') {
      for (let m = 23; m >= 12; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const year = d.getFullYear();
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const monthPrefix = `${year}-${monthNum}`;
        prevExp += expenseOnly.filter((e) => e.date.startsWith(monthPrefix)).reduce((sum, e) => sum + getAmount(e), 0);
        prevInc += incomeOnly.filter((e) => e.date.startsWith(monthPrefix)).reduce((sum, e) => sum + getAmount(e), 0);
      }
    } else {
      prevExp = curExpTot * 0.92;
      prevInc = curIncTot * 0.92;
    }

    return {
      points: resultPoints,
      currentExpenseTotal: curExpTot,
      currentIncomeTotal: curIncTot,
      previousExpenseTotal: prevExp,
      previousIncomeTotal: prevInc,
    };
  }, [expenses, filter, targetCurrency, convert, language]);

  const maxAmount = useMemo(() => {
    if (viewMode === 'expense') {
      return Math.max(...points.map((p) => p.expenseAmount), 10);
    }
    if (viewMode === 'income') {
      return Math.max(...points.map((p) => p.incomeAmount), 10);
    }
    return Math.max(...points.map((p) => Math.max(p.expenseAmount, p.incomeAmount)), 10);
  }, [points, viewMode]);

  const minAmount = 0;
  const paddingY = 30;
  const paddingBottom = 8;
  const usableHeight = chartHeight - paddingY - paddingBottom;

  const { expenseCoords, incomeCoords } = useMemo(() => {
    if (points.length === 0) return { expenseCoords: [], incomeCoords: [] };
    const stepX = drawWidth / Math.max(points.length - 1, 1);
    const range = Math.max(maxAmount - minAmount, 1);

    const expCoords = points.map((p, i) => {
      const normY = (p.expenseAmount - minAmount) / range;
      const x = chartPadLeft + i * stepX;
      const y = chartHeight - paddingBottom - normY * usableHeight;
      return { x, y, point: p, index: i, amount: p.expenseAmount };
    });

    const incCoords = points.map((p, i) => {
      const normY = (p.incomeAmount - minAmount) / range;
      const x = chartPadLeft + i * stepX;
      const y = chartHeight - paddingBottom - normY * usableHeight;
      return { x, y, point: p, index: i, amount: p.incomeAmount };
    });

    return { expenseCoords: expCoords, incomeCoords: incCoords };
  }, [points, drawWidth, chartHeight, maxAmount, minAmount, usableHeight, chartPadLeft]);

  const expensePaths = useMemo(
    () => buildBezierPath(expenseCoords, chartHeight, chartPadLeft, drawWidth),
    [expenseCoords, chartHeight, chartPadLeft, drawWidth],
  );

  const incomePaths = useMemo(
    () => buildBezierPath(incomeCoords, chartHeight, chartPadLeft, drawWidth),
    [incomeCoords, chartHeight, chartPadLeft, drawWidth],
  );

  const gridLines = useMemo(() => {
    const lines: { y: number; label: string }[] = [];
    const steps = 3;
    const range = Math.max(maxAmount - minAmount, 1);
    for (let i = 0; i <= steps; i++) {
      const val = minAmount + (range * i) / steps;
      const normalizedY = (val - minAmount) / range;
      const y = chartHeight - paddingBottom - normalizedY * usableHeight;
      // Use formatMoney to show proper currency formatting on y-axis
      const label = formatMoney(Math.round(val), targetCurrency);
      lines.push({ y, label });
    }
    return lines;
  }, [maxAmount, minAmount, chartHeight, usableHeight, targetCurrency]);

  // Days in current month — used for per-day average when filter === 'weekly' (1M)

  const isCompact = width < 390;

  const VIEW_OPTIONS: { key: FlowViewMode; label: string; iconColor: string }[] = [
    { key: 'both', label: 'Cash Flow', iconColor: '#818CF8' },
    { key: 'expense', label: 'Spending Trend', iconColor: theme.colors.primary },
    { key: 'income', label: 'Income Trend', iconColor: '#10B981' },
  ];

  const currentViewLabel = VIEW_OPTIONS.find((v) => v.key === viewMode)?.label || 'Cash Flow';

  const tooltipWidth = viewMode === 'both' ? 140 : 120;
  const tooltipHeight = viewMode === 'both' ? 56 : 44;
  const getTooltipX = (cx: number) => {
    let tx = cx - tooltipWidth / 2;
    if (tx < 2) tx = 2;
    if (tx + tooltipWidth > chartWidth - 2) tx = chartWidth - tooltipWidth - 2;
    return tx;
  };
  const getTooltipY = (cy: number) => {
    const above = cy - tooltipHeight - 12;
    if (above < 2) return cy + 12;
    return above;
  };

  const showExpenseLine = viewMode === 'both' || viewMode === 'expense';
  const showIncomeLine = viewMode === 'both' || viewMode === 'income';

  return (
    <Card style={{ gap: theme.spacing.md, padding: isCompact ? 14 : theme.spacing.lg, zIndex: 50, position: 'relative' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, zIndex: 100 }}>
        <View style={{ position: 'relative', zIndex: 101 }}>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
              setDropdownOpen((prev) => !prev);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1.2,
              borderColor: dropdownOpen ? theme.colors.primary : theme.colors.border,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <TrendingUp size={15} color={viewMode === 'income' ? '#10B981' : theme.colors.primary} />
            <Text style={{ fontWeight: '800', fontSize: isCompact ? 13 : 14, color: theme.colors.text }}>
              {currentViewLabel}
            </Text>
            <ChevronDown
              size={13}
              color={theme.colors.textMuted}
              style={{ transform: [{ rotate: dropdownOpen ? '180deg' : '0deg' }] }}
            />
          </Pressable>

          {dropdownOpen && (
            <>
              <Pressable
                onPress={() => setDropdownOpen(false)}
                style={
                  Platform.OS === 'web'
                    ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 } as any)
                    : { position: 'absolute', top: -3000, left: -2000, right: -2000, bottom: -8000, zIndex: 999 }
                }
              />
              <View
                style={{
                  position: 'absolute',
                  top: 38,
                  left: 0,
                  width: 195,
                  backgroundColor: theme.colors.surface,
                  borderRadius: 14,
                  borderWidth: 1.2,
                  borderColor: theme.colors.border,
                  padding: 5,
                  gap: 2,
                  zIndex: 1000,
                  elevation: 20,
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.25,
                  shadowRadius: 10,
                }}
              >
                {VIEW_OPTIONS.map((opt) => {
                  const isSelected = viewMode === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                        setViewMode(opt.key);
                        setSelectedIndex(null);
                        setDropdownOpen(false);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 8,
                        backgroundColor: isSelected
                          ? theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)'
                          : 'transparent',
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: opt.iconColor }} />
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontWeight: isSelected ? '800' : '600',
                            color: isSelected ? theme.colors.primary : theme.colors.text,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </View>
                      {isSelected && <Check size={13} color={theme.colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: theme.radius.full,
            padding: 2,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexShrink: 0,
          }}
        >
          {(['today', 'daily', 'weekly', 'monthly', 'yearly'] as TimeFilter[]).map((f) => {
            const isActive = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  setFilter(f);
                  setSelectedIndex(null);
                }}
                hitSlop={4}
                style={{
                  paddingHorizontal: isCompact ? 7 : 9,
                  paddingVertical: 4,
                  borderRadius: theme.radius.full,
                  backgroundColor: isActive ? theme.colors.primary : 'transparent',
                }}
              >
                <Text
                  variant="caption"
                  style={{
                    fontWeight: isActive ? '800' : '600',
                    fontSize: isCompact ? 10 : 11,
                    color: isActive ? '#FFFFFF' : theme.colors.textMuted,
                    textTransform: 'uppercase',
                  }}
                >
                  {f === 'today' ? '1D' : f === 'daily' ? '7D' : f === 'weekly' ? '1M' : f === 'monthly' ? '6M' : '1Y'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ gap: 2, flex: 1, minWidth: 140 }}>
          {viewMode === 'both' ? (
            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary }} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.text }}>
                    {formatMoney(currentExpenseTotal, targetCurrency)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#10B981' }}>
                    +{formatMoney(currentIncomeTotal, targetCurrency)}
                  </Text>
                </View>
              </View>
              <Text variant="caption" muted style={{ fontSize: 10.5 }}>
                🟣 Expenses vs 🟢 Inflow ({filter === 'today' ? 'Today' : filter === 'daily' ? '7 Days' : filter === 'weekly' ? '1 Month' : filter === 'monthly' ? '6 Months' : '1 Year'})
              </Text>
            </View>
          ) : viewMode === 'income' ? (
            <View style={{ gap: 2 }}>
              <Text
                variant="h2"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{ fontSize: isCompact ? 22 : 26, fontWeight: '800', fontVariant: ['tabular-nums'], color: '#10B981' }}
              >
                +{formatMoney(currentIncomeTotal, targetCurrency)}
              </Text>
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                Total Inflow ({filter === 'today' ? 'Today' : filter === 'daily' ? '7 Days' : filter === 'weekly' ? '1 Month' : filter === 'monthly' ? '6 Months' : '1 Year'})
              </Text>
            </View>
          ) : (
            <View style={{ gap: 2 }}>
              <Text
                variant="h2"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{ fontSize: isCompact ? 22 : 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}
              >
                {formatMoney(currentExpenseTotal, targetCurrency)}
              </Text>
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                Total Outflow ({filter === 'today' ? 'Today' : filter === 'daily' ? '7 Days' : filter === 'weekly' ? '1 Month' : filter === 'monthly' ? '6 Months' : '1 Year'})
              </Text>
            </View>
          )}
        </View>

        {/* Right Telemetry & Comparison Badges */}
        {viewMode === 'both' ? (
          currentIncomeTotal > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: theme.radius.full,
                backgroundColor: currentIncomeTotal >= currentExpenseTotal
                  ? (theme.isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(15, 92, 77, 0.12)')
                  : (theme.isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.1)'),
              }}
            >
              <Sparkles size={12} color={currentIncomeTotal >= currentExpenseTotal ? (theme.isDark ? '#10B981' : '#0F5C4D') : '#EF4444'} />
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: '800',
                  color: currentIncomeTotal >= currentExpenseTotal ? (theme.isDark ? '#10B981' : '#0F5C4D') : '#EF4444',
                }}
              >
                Net: {currentIncomeTotal >= currentExpenseTotal ? '+' : ''}{formatMoney(currentIncomeTotal - currentExpenseTotal, targetCurrency)}
              </Text>
            </View>
          ) : (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text variant="caption" muted style={{ fontSize: 10.5, fontWeight: '700' }}>
                ~{formatMoney(currentExpenseTotal / (filter === 'today' ? 1 : filter === 'daily' ? 7 : filter === 'weekly' ? 28 : filter === 'monthly' ? 180 : 365), targetCurrency)}/day
              </Text>
            </View>
          )
        ) : viewMode === 'expense' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {previousExpenseTotal > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  paddingHorizontal: isCompact ? 7 : 9,
                  paddingVertical: 3.5,
                  borderRadius: theme.radius.full,
                  backgroundColor: currentExpenseTotal >= previousExpenseTotal
                    ? (theme.isDark ? 'rgba(248, 113, 113, 0.15)' : 'rgba(239, 68, 68, 0.1)')
                    : (theme.isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.1)'),
                }}
              >
                {currentExpenseTotal >= previousExpenseTotal ? (
                  <ArrowUpRight size={12} color={theme.colors.danger} />
                ) : (
                  <ArrowDownRight size={12} color={theme.colors.success} />
                )}
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    fontWeight: '800',
                    fontSize: isCompact ? 10.5 : 11.5,
                    color: currentExpenseTotal >= previousExpenseTotal ? theme.colors.danger : theme.colors.success,
                  }}
                >
                  {currentExpenseTotal >= previousExpenseTotal ? '+' : '-'}{Math.abs(Math.round(((currentExpenseTotal - previousExpenseTotal) / previousExpenseTotal) * 100))}% vs prev
                </Text>
              </View>
            ) : null}
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text variant="caption" muted style={{ fontSize: 10.5, fontWeight: '700' }}>
                ~{formatMoney(currentExpenseTotal / (filter === 'today' ? 1 : filter === 'daily' ? 7 : filter === 'weekly' ? 28 : filter === 'monthly' ? 180 : 365), targetCurrency)}/day
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {previousIncomeTotal > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  paddingHorizontal: isCompact ? 7 : 9,
                  paddingVertical: 3.5,
                  borderRadius: theme.radius.full,
                  backgroundColor: currentIncomeTotal >= previousIncomeTotal
                    ? (theme.isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.1)')
                    : (theme.isDark ? 'rgba(248, 113, 113, 0.15)' : 'rgba(239, 68, 68, 0.1)'),
                }}
              >
                {currentIncomeTotal >= previousIncomeTotal ? (
                  <ArrowUpRight size={12} color="#10B981" />
                ) : (
                  <ArrowDownRight size={12} color={theme.colors.danger} />
                )}
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    fontWeight: '800',
                    fontSize: isCompact ? 10.5 : 11.5,
                    color: currentIncomeTotal >= previousIncomeTotal ? '#10B981' : theme.colors.danger,
                  }}
                >
                  {currentIncomeTotal >= previousIncomeTotal ? '+' : '-'}{Math.abs(Math.round(((currentIncomeTotal - previousIncomeTotal) / previousIncomeTotal) * 100))}% vs prev
                </Text>
              </View>
            ) : null}
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: '#10B981' }}>
                ~{formatMoney(currentIncomeTotal / (filter === 'today' ? 1 : filter === 'daily' ? 7 : filter === 'weekly' ? 28 : filter === 'monthly' ? 180 : 365), targetCurrency)}/day
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={{ height: chartHeight, width: '100%', position: 'relative' }}>
        <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <Defs>
            <LinearGradient id="expenseAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={theme.colors.primary} stopOpacity={theme.isDark ? '0.25' : '0.15'} />
              <Stop offset="100%" stopColor={theme.colors.primary} stopOpacity="0.0" />
            </LinearGradient>
            <LinearGradient id="incomeAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#10B981" stopOpacity={theme.isDark ? '0.25' : '0.15'} />
              <Stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {gridLines.map((gl, i) => (
            <React.Fragment key={i}>
              <Line
                x1={chartPadLeft}
                y1={gl.y}
                x2={chartPadLeft + drawWidth}
                y2={gl.y}
                stroke={theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              <SvgText
                x={chartPadLeft + drawWidth + 2}
                y={gl.y + 3}
                fontSize={9}
                fill={theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'}
                textAnchor="start"
              >
                {gl.label}
              </SvgText>
            </React.Fragment>
          ))}

          {showIncomeLine && incomePaths.areaPath ? (
            <Path d={incomePaths.areaPath} fill="url(#incomeAreaGrad)" />
          ) : null}

          {showIncomeLine && incomePaths.linePath ? (
            <Path
              d={incomePaths.linePath}
              fill="none"
              stroke="#10B981"
              strokeWidth={viewMode === 'both' ? 2 : 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {showExpenseLine && expensePaths.areaPath ? (
            <Path d={expensePaths.areaPath} fill="url(#expenseAreaGrad)" />
          ) : null}

          {showExpenseLine && expensePaths.linePath ? (
            <Path
              d={expensePaths.linePath}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth={viewMode === 'both' ? 2 : 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {showIncomeLine &&
            incomeCoords.map((c) => {
              const isSelected = selectedIndex === c.index;
              return (
                <React.Fragment key={`inc_${c.index}`}>
                  {isSelected ? (
                    <Circle cx={c.x} cy={c.y} r={10} fill="#10B981" opacity={0.15} />
                  ) : null}
                  <Circle
                    cx={c.x}
                    cy={c.y}
                    r={isSelected ? 5 : 2.8}
                    fill={isSelected ? '#FFFFFF' : '#10B981'}
                    stroke="#10B981"
                    strokeWidth={isSelected ? 2 : 1}
                  />
                </React.Fragment>
              );
            })}

          {showExpenseLine &&
            expenseCoords.map((c) => {
              const isSelected = selectedIndex === c.index;
              return (
                <React.Fragment key={`exp_${c.index}`}>
                  {isSelected ? (
                    <Circle cx={c.x} cy={c.y} r={10} fill={theme.colors.primary} opacity={0.15} />
                  ) : null}
                  <Circle
                    cx={c.x}
                    cy={c.y}
                    r={isSelected ? 5 : 2.8}
                    fill={isSelected ? '#FFFFFF' : theme.colors.primary}
                    stroke={theme.colors.primary}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                </React.Fragment>
              );
            })}

          {selectedIndex !== null && expenseCoords[selectedIndex] ? (
            <Line
              x1={expenseCoords[selectedIndex].x}
              y1={paddingY - 10}
              x2={expenseCoords[selectedIndex].x}
              y2={chartHeight - paddingBottom}
              stroke={theme.colors.primary}
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.5}
            />
          ) : null}

          {selectedIndex !== null && expenseCoords[selectedIndex] ? (() => {
            const expC = expenseCoords[selectedIndex];
            const incC = incomeCoords[selectedIndex];
            const primaryY = viewMode === 'income' ? incC.y : expC.y;
            const tx = getTooltipX(expC.x);
            const ty = getTooltipY(primaryY);
            const bgColor = theme.isDark ? '#1E293B' : '#FFFFFF';
            const borderColor = viewMode === 'income'
              ? (theme.isDark ? 'rgba(16,185,129,0.4)' : 'rgba(16,185,129,0.25)')
              : (theme.isDark ? 'rgba(99,102,241,0.4)' : 'rgba(79,70,229,0.25)');

            return (
              <React.Fragment>
                <Rect
                  x={tx}
                  y={ty}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx={8}
                  ry={8}
                  fill={bgColor}
                  stroke={borderColor}
                  strokeWidth={1.2}
                />
                {viewMode === 'both' ? (
                  <>
                    <SvgText
                      x={tx + 10}
                      y={ty + 15}
                      fontSize={10}
                      fontWeight="bold"
                      fill={theme.colors.primary}
                      textAnchor="start"
                    >
                      🟣 Exp: {shortMoney(expC.amount, targetCurrency)}
                    </SvgText>
                    <SvgText
                      x={tx + 10}
                      y={ty + 30}
                      fontSize={10}
                      fontWeight="bold"
                      fill="#10B981"
                      textAnchor="start"
                    >
                      🟢 Inc: +{shortMoney(incC.amount, targetCurrency)}
                    </SvgText>
                    <SvgText
                      x={tx + tooltipWidth / 2}
                      y={ty + 46}
                      fontSize={8.5}
                      fill={theme.colors.textMuted}
                      textAnchor="middle"
                    >
                      {expC.point.subLabel || expC.point.label}
                    </SvgText>
                  </>
                ) : (
                  <>
                    <SvgText
                      x={tx + tooltipWidth / 2}
                      y={ty + 15}
                      fontSize={11}
                      fontWeight="bold"
                      fill={viewMode === 'income' ? '#10B981' : theme.colors.text}
                      textAnchor="middle"
                    >
                      {viewMode === 'income' ? '+' : ''}{shortMoney(viewMode === 'income' ? incC.amount : expC.amount, targetCurrency)}
                    </SvgText>
                    <SvgText
                      x={tx + tooltipWidth / 2}
                      y={ty + 30}
                      fontSize={9}
                      fill={theme.colors.textMuted}
                      textAnchor="middle"
                    >
                      {expC.point.subLabel || expC.point.label}
                    </SvgText>
                  </>
                )}
              </React.Fragment>
            );
          })() : null}
        </Svg>

        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
          {expenseCoords.map((c) => (
            <Pressable
              key={c.index}
              onPress={() => handleSelectPoint(c.index)}
              style={{ flex: 1, height: '100%' }}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: -2 }}>
        {points.map((p, i) => {
          const isSelected = selectedIndex === i;
          return (
            <Pressable key={i} onPress={() => handleSelectPoint(i)} hitSlop={6}>
              <Text
                variant="caption"
                style={{
                  fontSize: 10,
                  fontWeight: isSelected ? '800' : '600',
                  color: isSelected ? theme.colors.primary : theme.colors.textMuted,
                }}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
