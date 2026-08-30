import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import { Link } from 'expo-router';
import {
  Clock,
  CreditCard,
  RefreshCw,
  Settings,
  TrendingUp,
  Wallet,
} from 'lucide-react-native';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { CURRENCY_DETAILS } from '@/constants/app';
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
  monthIncome?: number;
  prevMonthIncome?: number;
}

export function BudgetLimitHeroCard({
  monthTotal,
  monthlyBudget,
  preferredCurrency,
  formattedDate,
  fullMonthName,
  todayTotal = 0,
  prevMonthTotal = 0,
  monthIncome = 0,
  prevMonthIncome = 0,
}: BudgetLimitHeroCardProps) {
  const theme = useTheme();
  const currencyDetails = CURRENCY_DETAILS[preferredCurrency as keyof typeof CURRENCY_DETAILS] ?? { flag: '💱', label: preferredCurrency };
  const { language } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 380;
  const [measuredWidth, setMeasuredWidth] = useState<number | undefined>(undefined);
  const [isFlipped, setIsFlipped] = useState(false);
  const isFlippedRef = useRef(false);
  // pointerEventsFlipped tracks which face should be interactive —
  // updated at the animation midpoint so the hidden face never steals taps.
  const [pointerEventsFlipped, setPointerEventsFlipped] = useState(false);
  // Measured heights of both faces so the wrapper resizes to the ACTIVE face
  // (prevents blank gaps / overlap below the card after flipping)
  const [frontHeight, setFrontHeight] = useState<number | null>(null);
  const [backHeight, setBackHeight] = useState<number | null>(null);

  // ── Flip Animation ──
  const flipAnim = useRef(new Animated.Value(0)).current;

  const handleFlip = () => {
    setIsFlipped((prev) => {
      const next = !prev;
      isFlippedRef.current = next;
      // Switch pointer events at the midpoint so the hidden face never intercepts taps
      const listener = flipAnim.addListener(({ value }) => {
        if ((next && value >= 0.5) || (!next && value <= 0.5)) {
          setPointerEventsFlipped(next);
          flipAnim.removeListener(listener);
        }
      });
      Animated.spring(flipAnim, {
        toValue: next ? 1 : 0,
        friction: 8,
        tension: 60,
        useNativeDriver: true,
      }).start();
      return next;
    });
  };

  const frontRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  // ── Expense Side Calculations ──
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

  // Month vs last month comparison (expense)
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

  const usedPercent = isBudgetSet ? formatBudgetPercent(monthTotal, monthlyBudget) : '0%';

  // ── Income Side Calculations ──
  const netSavings = monthIncome - monthTotal;
  const savingsRate = monthIncome > 0 ? Math.max(0, Math.round((netSavings / monthIncome) * 100)) : 0;
  const savingsRatio = monthIncome > 0 ? Math.min(Math.max(netSavings / monthIncome, 0), 1) : 0;
  const isPositiveSavings = netSavings >= 0;

  // Income vs last month comparison
  let incPctVsLastMonth = 0;
  let incIsUp = true;
  if (prevMonthIncome > 0) {
    const diff = monthIncome - prevMonthIncome;
    incPctVsLastMonth = Math.abs(Math.round((diff / prevMonthIncome) * 1000) / 10);
    incIsUp = diff >= 0;
  } else if (monthIncome > 0) {
    incPctVsLastMonth = 100;
    incIsUp = true;
  }

  // Current month name (abbreviated: Jan, Feb, Mar …)
  const currentMonthName = new Date().toLocaleDateString(
    language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US',
    { month: 'short' }
  );

  // Measure the unmasked amount width so that when privacy mode turns on (and amount becomes ••••••),
  // the eye button remains locked in the EXACT same spot with zero layout jump or shift.
  const unmaskedStr = useMemo(() => formatMoney(monthTotal, preferredCurrency, false), [monthTotal, preferredCurrency]);
  const amountBoxWidth = useMemo(() => {
    if (measuredWidth && measuredWidth > 0) return measuredWidth;
    return Math.max(105, unmaskedStr.length * (isCompact ? 12.5 : 14.5));
  }, [measuredWidth, unmaskedStr, isCompact]);

  const [measuredIncomeWidth, setMeasuredIncomeWidth] = useState<number | undefined>(undefined);
  const unmaskedIncomeStr = useMemo(() => `+ ${formatMoney(monthIncome, preferredCurrency, false)}`, [monthIncome, preferredCurrency]);
  const incomeAmountBoxWidth = useMemo(() => {
    if (measuredIncomeWidth && measuredIncomeWidth > 0) return measuredIncomeWidth;
    return Math.max(105, unmaskedIncomeStr.length * (isCompact ? 12.5 : 14.5));
  }, [measuredIncomeWidth, unmaskedIncomeStr, isCompact]);

  // ── Color accents for balanced visual hierarchy ──
  const expenseHeaderColor = theme.isDark ? '#F43F5E' : '#BE123C';
  const incomeHeaderColor = theme.isDark ? '#34D399' : '#047857';
  const incomePlusColor = theme.isDark ? '#10B981' : '#059669';
  const savingsAccent = theme.isDark ? '#10B981' : '#0F5C4D';
  const savingsAccentDark = theme.isDark ? '#34D399' : '#047857';
  const rateAccent = theme.isDark ? '#34D399' : '#0F5C4D';

  // ── Card border color ──
  const cardBorderColor = isFlipped
    ? (theme.isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(15, 92, 77, 0.3)')
    : isOverBudget
      ? theme.colors.danger
      : theme.isDark
        ? 'rgba(244, 63, 94, 0.25)'
        : theme.colors.border;

  // ── Shared card style ──
  const cardStyle = {
    gap: 10,
    padding: isCompact ? 14 : 16,
    backgroundColor: theme.colors.surface,
    borderColor: cardBorderColor,
    borderWidth: 1.5,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: theme.isDark ? 0.2 : 0.05,
    shadowRadius: 8,
    elevation: 3,
  };

  // ── Metric tile style helper ──
  const metricTile = {
    flex: 1,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 2,
  };

  return (
    <View>
      <View
        style={{
          transform: [{ perspective: 1200 }],
          height: isFlipped ? (backHeight ?? undefined) : (frontHeight ?? undefined),
        }}
      >
        {/* ═══════════════ FRONT FACE: EXPENSE / BUDGET ═══════════════ */}
        <Animated.View
          pointerEvents={pointerEventsFlipped ? 'none' : 'auto'}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setFrontHeight(Math.round(h));
          }}
          style={{
            backfaceVisibility: 'hidden',
            transform: [{ rotateY: frontRotateY }],
            opacity: frontOpacity,
          }}
        >
          <Card style={cardStyle}>
            {/* ── 1. HEADER: [ 💳  TOTAL SPENT IN <MONTH> ] ... [ 🔄 Flip ] [ ⚙️ Settings ] ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CreditCard size={15} color={expenseHeaderColor} />
                <Text
                  variant="caption"
                  style={{
                    color: expenseHeaderColor,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    fontWeight: '600',
                    fontSize: 11,
                  }}
                >
                  TOTAL SPENT IN {currentMonthName.toUpperCase()}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {/* Dedicated Flip Button — icon only, red = currently on Expense side */}
                <Pressable
                  onPress={handleFlip}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.18)' : '#F1DCD3',
                    borderWidth: 1.2,
                    borderColor: theme.colors.danger,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <RefreshCw size={14} color={theme.colors.danger} />
                </Pressable>

                <Link href="/settings" asChild>
                  <Pressable
                    hitSlop={10}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Settings size={13} color={theme.colors.textMuted} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textMuted }}>
                      Settings
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </View>

            {/* ── 2. AMOUNT & PRIVACY ROW ── */}
            <View style={{ gap: 2, marginTop: -4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <View style={isPrivacyMode ? { width: amountBoxWidth, justifyContent: 'center' } : { justifyContent: 'center' }}>
                    <Text
                      variant="h1"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      onLayout={(e) => {
                        const w = e.nativeEvent.layout.width;
                        if (w > 0 && !isPrivacyMode) {
                          setMeasuredWidth(Math.round(w));
                        }
                      }}
                      style={{
                        fontSize: isCompact ? 19 : 21,
                        fontWeight: '900',
                        color: theme.colors.text,
                        includeFontPadding: false,
                        lineHeight: isCompact ? 23 : 25,
                      }}
                    >
                      {formatMoney(monthTotal, preferredCurrency)}
                    </Text>
                  </View>
                  <PrivacyEyeButton size={34} iconSize={21} />
                </View>

                {/* Month vs Last Month Badge */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: theme.radius.full,
                    flexShrink: 0,
                    backgroundColor: isUp
                      ? (theme.isDark ? 'rgba(239, 68, 68, 0.18)' : '#F1DCD3')
                      : (theme.isDark ? 'rgba(52, 211, 153, 0.18)' : '#DCE9E3'),
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: isUp ? (theme.isDark ? '#F87171' : '#A5442B') : (theme.isDark ? '#34D399' : '#0F5C4D'),
                    }}
                  >
                    {isUp ? '▲' : '▼'} {pctVsLastMonth}% vs last mon
                  </Text>
                </View>
              </View>

              {/* Date & Preferred Currency */}
              <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '500' }}>
                {formattedDate} • {currencyDetails.flag} {currencyDetails.label}
              </Text>
            </View>

            {/* ── 3. REMAINING TARGET & PROGRESS BAR (If Budget is Set) ── */}
            {isBudgetSet && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} color={isOverBudget ? theme.colors.danger : '#F59E0B'} />
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '700',
                        color: isOverBudget ? theme.colors.danger : '#F59E0B',
                      }}
                    >
                      {isPrivacyMode ? '••••' : formatMoney(Math.abs(remaining), preferredCurrency)} {isOverBudget ? 'over budget' : 'remaining'}
                    </Text>
                  </View>

                  <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                    Target: {isPrivacyMode ? '••••' : formatMoney(monthlyBudget, preferredCurrency)} ({usedPercent})
                  </Text>
                </View>

                <View
                  style={{
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: theme.colors.surfaceElevated,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${Math.min(ratio * 100, 100)}%`,
                      backgroundColor: progressColor,
                      borderRadius: 4,
                    }}
                  />
                </View>
              </View>
            )}

            {/* ── 4. THREE INFO METRIC TILES ── */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              <View style={metricTile}>
                <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
                  Spent Today
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: isCompact ? 12 : 13,
                    fontWeight: '800',
                    color: theme.colors.text,
                    fontVariant: ['tabular-nums'],
                    textAlign: 'center',
                  }}
                >
                  {isPrivacyMode ? '••••' : formatMoney(todayTotal, preferredCurrency)}
                </Text>
              </View>

              <View style={metricTile}>
                <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
                  Target Limit
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: isCompact ? 12 : 13,
                    fontWeight: '800',
                    color: theme.colors.text,
                    fontVariant: ['tabular-nums'],
                    textAlign: 'center',
                  }}
                >
                  {isBudgetSet ? (isPrivacyMode ? '••••' : formatMoney(monthlyBudget, preferredCurrency)) : 'Not set'}
                </Text>
              </View>

              <View style={metricTile}>
                <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
                  Budget Status
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: isCompact ? 12 : 13,
                    fontWeight: '800',
                    color: isOverBudget ? theme.colors.danger : theme.colors.primary,
                    fontVariant: ['tabular-nums'],
                    textAlign: 'center',
                  }}
                >
                  {isBudgetSet ? `${usedPercent} Used` : 'No Limit'}
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>

        {/* ═══════════════ BACK FACE: INCOME / SAVINGS ═══════════════ */}
        <Animated.View
          pointerEvents={pointerEventsFlipped ? 'auto' : 'none'}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setBackHeight(Math.round(h));
          }}
          style={{
            backfaceVisibility: 'hidden',
            transform: [{ rotateY: backRotateY }],
            opacity: backOpacity,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          <Card style={cardStyle}>
            {/* ── 1. HEADER: [ 💰 TOTAL INCOME IN <MONTH> ] ... [ ⚙️ Settings ] ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Wallet size={15} color={incomeHeaderColor} />
                <Text
                  variant="caption"
                  style={{
                    color: incomeHeaderColor,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    fontWeight: '700',
                    fontSize: 11,
                  }}
                >
                  TOTAL INCOME IN {currentMonthName.toUpperCase()}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {/* Dedicated Flip Button — icon only */}
                <Pressable
                  onPress={handleFlip}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: theme.isDark ? 'rgba(52, 211, 153, 0.18)' : '#DCE9E3',
                    borderWidth: 1.2,
                    borderColor: savingsAccent,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <RefreshCw size={14} color={savingsAccent} />
                </Pressable>

                <Link href="/settings" asChild>
                  <Pressable
                    hitSlop={10}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Settings size={13} color={theme.colors.textMuted} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textMuted }}>
                      Settings
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </View>

            {/* ── 2. INCOME AMOUNT & PRIVACY ROW ── */}
            <View style={{ gap: 2, marginTop: -4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <View style={isPrivacyMode ? { width: incomeAmountBoxWidth, justifyContent: 'center' } : { justifyContent: 'center' }}>
                    <Text
                      variant="h1"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      onLayout={(e) => {
                        const w = e.nativeEvent.layout.width;
                        if (w > 0 && !isPrivacyMode) {
                          setMeasuredIncomeWidth(Math.round(w));
                        }
                      }}
                      style={{
                        fontSize: isCompact ? 19 : 21,
                        fontWeight: '900',
                        color: theme.colors.text,
                        includeFontPadding: false,
                        lineHeight: isCompact ? 23 : 25,
                      }}
                    >
                      {isPrivacyMode ? (
                        '••••••'
                      ) : (
                        <>
                          <Text style={{ color: incomePlusColor, fontWeight: '900' }}>+ </Text>
                          {formatMoney(monthIncome, preferredCurrency, false)}
                        </>
                      )}
                    </Text>
                  </View>
                  <PrivacyEyeButton size={34} iconSize={21} />
                </View>

                {/* Income vs Last Month Badge */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: theme.radius.full,
                    flexShrink: 0,
                    backgroundColor: incIsUp
                      ? (theme.isDark ? 'rgba(52, 211, 153, 0.18)' : '#DCE9E3')
                      : (theme.isDark ? 'rgba(239, 68, 68, 0.18)' : '#F1DCD3'),
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: incIsUp ? incomeHeaderColor : (theme.isDark ? '#F87171' : '#A5442B'),
                    }}
                  >
                    {incIsUp ? '▲' : '▼'} {incPctVsLastMonth}% vs last mon
                  </Text>
                </View>
              </View>

              {/* Date & Preferred Currency */}
              <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '500' }}>
                {formattedDate} • {currencyDetails.flag} {currencyDetails.label}
              </Text>
            </View>

            {/* ── 3. NET SAVINGS PROGRESS BAR ── */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TrendingUp size={12} color={isPositiveSavings ? savingsAccent : theme.colors.danger} />
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontWeight: '700',
                      color: isPositiveSavings ? savingsAccent : theme.colors.danger,
                    }}
                  >
                    {isPrivacyMode ? '••••' : formatMoney(Math.abs(netSavings), preferredCurrency)} {isPositiveSavings ? 'saved' : 'deficit'}
                  </Text>
                </View>

                <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                  Savings Rate: {savingsRate}%
                </Text>
              </View>

              <View
                style={{
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: theme.colors.surfaceElevated,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${Math.min(savingsRatio * 100, 100)}%`,
                    backgroundColor: isPositiveSavings ? savingsAccent : theme.colors.danger,
                    borderRadius: 4,
                  }}
                />
              </View>
            </View>

            {/* ── 4. THREE INFO METRIC TILES (INCOME SIDE) ── */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              {/* Box 1: Income This Month */}
              <View style={metricTile}>
                <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
                  Income
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: isCompact ? 12 : 13,
                    fontWeight: '800',
                    color: incomeHeaderColor,
                    fontVariant: ['tabular-nums'],
                    textAlign: 'center',
                  }}
                >
                  {isPrivacyMode ? '••••' : formatMoney(monthIncome, preferredCurrency)}
                </Text>
              </View>

              {/* Box 2: Net Savings */}
              <View style={metricTile}>
                <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
                  Net Savings
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: isCompact ? 12 : 13,
                    fontWeight: '800',
                    color: isPositiveSavings ? savingsAccent : theme.colors.danger,
                    fontVariant: ['tabular-nums'],
                    textAlign: 'center',
                  }}
                >
                  {isPrivacyMode ? '••••' : formatMoney(netSavings, preferredCurrency)}
                </Text>
              </View>

              {/* Box 3: Savings Rate */}
              <View style={metricTile}>
                <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }}>
                  Savings Rate
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: isCompact ? 12 : 13,
                    fontWeight: '800',
                    color: isPositiveSavings ? rateAccent : theme.colors.danger,
                    fontVariant: ['tabular-nums'],
                    textAlign: 'center',
                  }}
                >
                  {savingsRate}%
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>
      </View>
    </View>
  );
}
