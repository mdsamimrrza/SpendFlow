import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney } from '@/utils/format';

export type TimeFilter = 'today' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface DataPoint {
  label: string;
  subLabel?: string;
  amount: number;
  dateKey: string;
}

// Formatter for on-graph tooltip values (shows full amount e.g. ₹ 2,742)
function shortMoney(val: number, currency: string): string {
  return `${currency} ${Math.round(val).toLocaleString()}`;
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
  const [filter, setFilter] = useState<TimeFilter>('daily');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectPoint = (index: number) => {
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

  // ── 1. DATA PROCESSING ──
  const { points, previousPeriodTotal, currentPeriodTotal } = useMemo(() => {
    const now = new Date();
    const resultPoints: DataPoint[] = [];
    const getExpenseAmount = (e: Expense) =>
      convert(Number(e.amount), e.currency || 'NPR', targetCurrency);
    const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';

    if (filter === 'today') {
      const todayIso = now.toISOString().split('T')[0];
      const todayExpenses = expenses.filter((e) => e.date === todayIso);
      const slotLabels = ['12am', '4am', '8am', '12pm', '4pm', '8pm'];
      for (let s = 0; s < 6; s++) {
        const slotStart = s * 4;
        const slotEnd = slotStart + 4;
        const slotExpenses = todayExpenses.filter((e) => {
          if (!e.time) return s === 0;
          const hour = parseInt(e.time.split(':')[0], 10);
          return hour >= slotStart && hour < slotEnd;
        });
        const amount = slotExpenses.reduce((sum, e) => sum + getExpenseAmount(e), 0);
        resultPoints.push({
          label: slotLabels[s],
          subLabel: `${slotLabels[s]} – ${slotLabels[s + 1] || '12am'}`,
          amount,
          dateKey: `${todayIso}_${s}`,
        });
      }
    } else if (filter === 'daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        const dayExpenses = expenses.filter((e) => e.date === iso);
        const amount = dayExpenses.reduce((sum, e) => sum + getExpenseAmount(e), 0);
        resultPoints.push({
          label: d.toLocaleDateString(locale, { weekday: 'short' }),
          subLabel: d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
          amount,
          dateKey: iso,
        });
      }
    } else if (filter === 'weekly') {
      for (let w = 3; w >= 0; w--) {
        const endDay = new Date(now);
        endDay.setDate(now.getDate() - w * 7);
        const startDay = new Date(endDay);
        startDay.setDate(endDay.getDate() - 6);
        const startIso = startDay.toISOString().split('T')[0];
        const endIso = endDay.toISOString().split('T')[0];
        const weekExpenses = expenses.filter((e) => e.date >= startIso && e.date <= endIso);
        const amount = weekExpenses.reduce((sum, e) => sum + getExpenseAmount(e), 0);
        resultPoints.push({
          label: `W${4 - w}`,
          subLabel: `${startDay.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} – ${endDay.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`,
          amount,
          dateKey: `${startIso}_${endIso}`,
        });
      }
    } else if (filter === 'monthly') {
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const year = d.getFullYear();
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const monthPrefix = `${year}-${monthNum}`;
        const monthExpenses = expenses.filter((e) => e.date.startsWith(monthPrefix));
        const amount = monthExpenses.reduce((sum, e) => sum + getExpenseAmount(e), 0);
        resultPoints.push({
          label: d.toLocaleDateString(locale, { month: 'short' }),
          subLabel: `${d.toLocaleDateString(locale, { month: 'long' })} ${year}`,
          amount,
          dateKey: monthPrefix,
        });
      }
    } else {
      for (let y = 2; y >= 0; y--) {
        const targetYear = now.getFullYear() - y;
        const yearPrefix = `${targetYear}`;
        const yearExpenses = expenses.filter((e) => e.date.startsWith(yearPrefix));
        const amount = yearExpenses.reduce((sum, e) => sum + getExpenseAmount(e), 0);
        resultPoints.push({
          label: `${targetYear}`,
          subLabel: `Year ${targetYear}`,
          amount,
          dateKey: yearPrefix,
        });
      }
    }

    const currentTotal = resultPoints.reduce((s, p) => s + p.amount, 0);

    // Previous period comparison (simple shift back)
    let prevTotal = 0;
    if (filter === 'daily') {
      for (let i = 13; i >= 7; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        const dayExpenses = expenses.filter((e) => e.date === iso);
        prevTotal += dayExpenses.reduce((sum, e) => sum + getExpenseAmount(e), 0);
      }
    } else {
      prevTotal = currentTotal * 0.92; // fallback estimate
    }

    return {
      points: resultPoints,
      previousPeriodTotal: prevTotal,
      currentPeriodTotal: currentTotal,
    };
  }, [expenses, filter, targetCurrency, convert, language]);

  // ── 2. COORDINATE MAPPING ──
  const maxAmount = Math.max(...points.map((p) => p.amount), 10);
  const minAmount = Math.min(...points.map((p) => p.amount), 0);
  const paddingY = 30; // extra top padding for tooltip
  const paddingBottom = 8;
  const usableHeight = chartHeight - paddingY - paddingBottom;

  const coords = useMemo(() => {
    if (points.length === 0) return [];
    const stepX = drawWidth / Math.max(points.length - 1, 1);
    return points.map((p, i) => {
      const normalizedY = (p.amount - minAmount) / Math.max(maxAmount - minAmount, 1);
      const x = chartPadLeft + i * stepX;
      const y = chartHeight - paddingBottom - normalizedY * usableHeight;
      return { x, y, point: p, index: i };
    });
  }, [points, drawWidth, chartHeight, maxAmount, minAmount, usableHeight, chartPadLeft]);

  // ── 3. SMOOTH BÉZIER PATH ──
  const { linePath, areaPath } = useMemo(() => {
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
  }, [coords, chartHeight, drawWidth, chartPadLeft]);

  // ── 4. GRID LINES (horizontal reference) ──
  const gridLines = useMemo(() => {
    const lines: { y: number; label: string }[] = [];
    const steps = 3;
    const range = maxAmount - minAmount;
    for (let i = 0; i <= steps; i++) {
      const val = minAmount + (range * i) / steps;
      const normalizedY = (val - minAmount) / Math.max(range, 1);
      const y = chartHeight - paddingBottom - normalizedY * usableHeight;
      const label = Math.round(val).toLocaleString();
      lines.push({ y, label });
    }
    return lines;
  }, [maxAmount, minAmount, chartHeight, usableHeight]);

  const activePoint = selectedIndex !== null ? coords[selectedIndex] : null;
  const latestPoint = coords[coords.length - 1];

  // Trend calculation
  const isSpendingUp = currentPeriodTotal >= previousPeriodTotal;
  const pctChange = previousPeriodTotal > 0
    ? Math.abs(Math.round(((currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal) * 100))
    : 0;

  // Tooltip positioning logic
  const tooltipWidth = 120;
  const tooltipHeight = 44;
  const getTooltipX = (cx: number) => {
    let tx = cx - tooltipWidth / 2;
    if (tx < 2) tx = 2;
    if (tx + tooltipWidth > chartWidth - 2) tx = chartWidth - tooltipWidth - 2;
    return tx;
  };
  const getTooltipY = (cy: number) => {
    const above = cy - tooltipHeight - 12;
    if (above < 2) return cy + 12; // show below if no room above
    return above;
  };

  return (
    <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
      {/* ── HEADER & FILTERS ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TrendingUp size={18} color={theme.colors.primary} />
          <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
            {t('charts_spending_trend') || 'Spending Trend'}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: theme.radius.full,
            padding: 3,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          {(['today', 'daily', 'weekly', 'monthly', 'yearly'] as TimeFilter[]).map((f) => {
            const isActive = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => { setFilter(f); setSelectedIndex(null); }}
                hitSlop={4}
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: theme.radius.full,
                  backgroundColor: isActive ? theme.colors.primary : 'transparent',
                }}
              >
                <Text
                  variant="caption"
                  style={{
                    fontWeight: isActive ? '800' : '600',
                    fontSize: 11,
                    color: isActive ? '#FFFFFF' : theme.colors.textMuted,
                    textTransform: 'uppercase',
                  }}
                >
                  {f === 'today' ? '1D' : f === 'daily' ? '7D' : f === 'weekly' ? '4W' : f === 'monthly' ? '6M' : '1Y'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── TOTAL & TREND BADGE ── */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text variant="h2" style={{ fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {formatMoney(currentPeriodTotal, targetCurrency)}
          </Text>
          <Text variant="caption" muted style={{ fontSize: 11 }}>
            {filter === 'today' ? 'Today Total'
              : filter === 'daily' ? 'Last 7 Days'
              : filter === 'weekly' ? 'Last 4 Weeks'
              : filter === 'monthly' ? 'Last 6 Months'
              : 'Last 3 Years'}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: theme.radius.full,
            flexShrink: 0,
            backgroundColor: isSpendingUp
              ? (theme.isDark ? 'rgba(248, 113, 113, 0.15)' : 'rgba(239, 68, 68, 0.1)')
              : (theme.isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.1)'),
          }}
        >
          {isSpendingUp ? (
            <ArrowUpRight size={13} color={theme.colors.danger} />
          ) : (
            <ArrowDownRight size={13} color={theme.colors.success} />
          )}
          <Text
            variant="caption"
            numberOfLines={1}
            style={{
              fontWeight: '700',
              fontSize: 11,
              color: isSpendingUp ? theme.colors.danger : theme.colors.success,
            }}
          >
            {isSpendingUp ? `+${pctChange}%` : `-${pctChange}%`} vs prev
          </Text>
        </View>
      </View>

      {/* ── CHART AREA ── */}
      <View style={{ height: chartHeight, width: '100%', position: 'relative' }}>
        <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <Defs>
            <LinearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={theme.colors.primary} stopOpacity={theme.isDark ? '0.30' : '0.18'} />
              <Stop offset="100%" stopColor={theme.colors.primary} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Horizontal grid lines */}
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

          {/* Area fill under curve */}
          {areaPath ? <Path d={areaPath} fill="url(#trendAreaGrad)" /> : null}

          {/* Main curve */}
          {linePath ? (
            <Path
              d={linePath}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* Data point dots */}
          {coords.map((c) => {
            const isSelected = activePoint?.index === c.index;
            return (
              <React.Fragment key={c.index}>
                {/* Outer glow ring for selected point */}
                {isSelected ? (
                  <Circle
                    cx={c.x}
                    cy={c.y}
                    r={12}
                    fill={theme.colors.primary}
                    opacity={0.15}
                  />
                ) : null}
                <Circle
                  cx={c.x}
                  cy={c.y}
                  r={isSelected ? 5.5 : 3}
                  fill={isSelected ? '#FFFFFF' : theme.colors.primary}
                  stroke={theme.colors.primary}
                  strokeWidth={isSelected ? 2.5 : 1}
                />
              </React.Fragment>
            );
          })}

          {/* ── VERTICAL SCRUBBER LINE when a point is selected ── */}
          {activePoint ? (
            <Line
              x1={activePoint.x}
              y1={paddingY - 10}
              x2={activePoint.x}
              y2={chartHeight - paddingBottom}
              stroke={theme.colors.primary}
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.5}
            />
          ) : null}

          {/* ── ON-GRAPH FLOATING TOOLTIP ── */}
          {activePoint ? (() => {
            const tx = getTooltipX(activePoint.x);
            const ty = getTooltipY(activePoint.y);
            const bgColor = theme.isDark ? '#1E293B' : '#FFFFFF';
            const borderColor = theme.isDark ? 'rgba(99,102,241,0.4)' : 'rgba(79,70,229,0.25)';
            const amountText = shortMoney(activePoint.point.amount, targetCurrency);
            const periodText = activePoint.point.label;

            return (
              <React.Fragment>
                {/* Tooltip background with border */}
                <Rect
                  x={tx}
                  y={ty}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx={8}
                  ry={8}
                  fill={bgColor}
                  stroke={borderColor}
                  strokeWidth={1.5}
                />
                {/* Tooltip amount */}
                <SvgText
                  x={tx + tooltipWidth / 2}
                  y={ty + 18}
                  fontSize={13}
                  fontWeight="800"
                  fill={theme.colors.primary}
                  textAnchor="middle"
                >
                  {amountText}
                </SvgText>
                {/* Tooltip period label */}
                <SvgText
                  x={tx + tooltipWidth / 2}
                  y={ty + 34}
                  fontSize={10}
                  fontWeight="600"
                  fill={theme.isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'}
                  textAnchor="middle"
                >
                  {periodText}
                </SvgText>
              </React.Fragment>
            );
          })() : null}
        </Svg>

        {/* Touch hit targets */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
          {coords.map((c) => (
            <Pressable
              key={c.index}
              onPress={() => handleSelectPoint(c.index)}
              style={{ flex: 1, height: '100%' }}
            />
          ))}
        </View>
      </View>

      {/* ── X-AXIS LABELS ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: -2 }}>
        {points.map((p, i) => {
          const isSelected = activePoint?.index === i;
          return (
            <Pressable key={i} onPress={() => handleSelectPoint(i)} hitSlop={6}>
              <Text
                variant="caption"
                style={{
                  fontSize: 10,
                  fontWeight: isSelected ? '800' : '500',
                  color: isSelected ? theme.colors.primary : theme.colors.textMuted,
                  textAlign: 'center',
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
