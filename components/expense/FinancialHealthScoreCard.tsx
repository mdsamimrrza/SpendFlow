import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {
  Activity,
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  Flame,
  PieChart,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney, groupByCategory } from '@/utils/format';

interface FinancialHealthScoreCardProps {
  expenses: Expense[];
  targetCurrency?: string;
}

export function FinancialHealthScoreCard({
  expenses,
  targetCurrency,
}: FinancialHealthScoreCardProps) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { convert, rates } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();

  const [infoModalOpen, setInfoModalOpen] = useState(false);

  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;

  // Compute 0-100 Score and Smart Insights
  const healthData = useMemo(() => {
    if (expenses.length === 0) {
      return {
        score: 75,
        grade: 'B+',
        status: 'Neutral',
        color: '#38BDF8',
        insights: [
          {
            type: 'info',
            icon: ShieldCheck,
            title: 'Awaiting Transactions',
            desc: 'Log more expenses in this period to unlock detailed financial health diagnostics.',
          },
        ],
      };
    }

    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthProgress = currentDay / daysInMonth;

    const totalSpent = expenses.reduce(
      (sum, e) => sum + convert(Number(e.amount), e.currency || 'NPR', currency),
      0,
    );

    let budgetPoints = 30; // max 35
    let volatilityPoints = 20; // max 25
    let categoryPoints = 18; // max 20
    let weekendPoints = 16; // max 20
    const insights: { type: 'success' | 'warning' | 'info'; icon: any; title: string; desc: string }[] = [];

    // 1. Budget Adherence Score (0-35 pts)
    if (monthlyBudget > 0) {
      const budgetUsedRatio = totalSpent / monthlyBudget;
      const expectedRatio = monthProgress;

      if (budgetUsedRatio <= expectedRatio) {
        budgetPoints = 35;
        insights.push({
          type: 'success',
          icon: CheckCircle2,
          title: 'Optimal Burn Rate',
          desc: `You are spending safely within your ${formatMoney(monthlyBudget, currency)} monthly ceiling.`,
        });
      } else if (budgetUsedRatio <= 1.0) {
        const excess = Math.round((budgetUsedRatio - expectedRatio) * 100);
        budgetPoints = Math.max(10, 35 - excess * 0.6);
        insights.push({
          type: 'warning',
          icon: AlertTriangle,
          title: 'Elevated Spend Pace',
          desc: `Spending is running ${excess}% ahead of your monthly target schedule.`,
        });
      } else {
        budgetPoints = 5;
        insights.push({
          type: 'warning',
          icon: Flame,
          title: 'Budget Ceiling Exceeded',
          desc: `Current outflow has crossed 100% of your planned monthly budget limit.`,
        });
      }
    }

    // 2. Spending Volatility & Spikes (0-25 pts)
    const dailyMap = new Map<string, number>();
    expenses.forEach((e) => {
      const current = dailyMap.get(e.date) || 0;
      dailyMap.set(e.date, current + convert(Number(e.amount), e.currency || 'NPR', currency));
    });

    const dailyValues = Array.from(dailyMap.values());
    if (dailyValues.length >= 3) {
      const avgDaily = totalSpent / Math.max(dailyValues.length, 1);
      const variance = dailyValues.reduce((sum, v) => sum + Math.pow(v - avgDaily, 2), 0) / dailyValues.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / Math.max(avgDaily, 1);

      if (cv < 0.6) {
        volatilityPoints = 25;
        insights.push({
          type: 'success',
          icon: Sparkles,
          title: 'Stable Daily Rhythm',
          desc: 'Your day-to-day transaction amounts are well-balanced without wild fluctuations.',
        });
      } else if (cv < 1.2) {
        volatilityPoints = 18;
      } else {
        volatilityPoints = 10;
        insights.push({
          type: 'warning',
          icon: TrendingUp,
          title: 'Irregular Spike Pattern',
          desc: 'Large sudden purchases are causing volatility in your daily cash flow.',
        });
      }
    }

    // 3. Category Concentration & Diversity (0-20 pts)
    const categoryGroups = groupByCategory(expenses, currency, rates);
    if (categoryGroups.length > 0) {
      const topCat = categoryGroups[0];
      const topRatio = topCat.total / Math.max(totalSpent, 1);

      if (topRatio > 0.6 && categoryGroups.length > 1) {
        categoryPoints = 10;
        insights.push({
          type: 'warning',
          icon: AlertTriangle,
          title: 'High Category Concentration',
          desc: `${topCat.label} accounts for ${Math.round(topRatio * 100)}% of your total spend.`,
        });
      } else {
        categoryPoints = 20;
        insights.push({
          type: 'success',
          icon: ShieldCheck,
          title: 'Diversified Allocation',
          desc: 'Healthy spread across multiple living categories without over-concentration.',
        });
      }
    }

    // 4. Weekend vs Weekday Surge Ratio (0-20 pts)
    let weekendSpend = 0;
    let weekdaySpend = 0;
    expenses.forEach((e) => {
      const day = new Date(e.date).getDay();
      const amt = convert(Number(e.amount), e.currency || 'NPR', currency);
      if (day === 0 || day === 6) {
        weekendSpend += amt;
      } else {
        weekdaySpend += amt;
      }
    });

    const weekendRatio = weekendSpend / Math.max(totalSpent, 1);
    if (weekendRatio > 0.55 && expenses.length >= 4) {
      weekendPoints = 10;
      insights.push({
        type: 'warning',
        icon: TrendingDown,
        title: 'Weekend Outflow Surge',
        desc: `Over ${Math.round(weekendRatio * 100)}% of your spending occurs on Saturdays & Sundays.`,
      });
    } else {
      weekendPoints = 20;
    }

    // Total Score Calculation (0 - 100)
    const totalScore = Math.min(
      100,
      Math.max(10, Math.round(budgetPoints + volatilityPoints + categoryPoints + weekendPoints)),
    );

    let grade = 'A+';
    let status = 'Elite Discipline';
    let color = '#10B981';

    if (totalScore >= 90) {
      grade = 'A+';
      status = 'Elite Discipline';
      color = '#10B981';
    } else if (totalScore >= 75) {
      grade = 'A';
      status = 'Strong Financial Health';
      color = '#38BDF8';
    } else if (totalScore >= 60) {
      grade = 'B';
      status = 'Moderate Pacing';
      color = '#F59E0B';
    } else if (totalScore >= 45) {
      grade = 'C';
      status = 'Elevated Risk';
      color = '#FB923C';
    } else {
      grade = 'D';
      status = 'Ceiling Exceeded';
      color = '#EF4444';
    }

    return {
      score: totalScore,
      grade,
      status,
      color,
      insights: insights.slice(0, 3),
    };
  }, [expenses, monthlyBudget, currency, convert, rates]);

  // Radial dial geometry
  const radius = 40;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (healthData.score / 100) * circumference;

  function openInfoModal() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setInfoModalOpen(true);
  }

  function closeInfoModal() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setInfoModalOpen(false);
  }

  return (
    <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
      {/* ── CARD HEADER: Tapping Icon / Badge opens Calculation Explainer ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How Financial Health Score is calculated"
          onPress={openInfoModal}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Award size={18} color={theme.colors.primary} />
          <Text variant="label" style={{ fontWeight: '600', fontSize: 15 }}>
            {t('health_score_title') || 'Financial Health Score'}
          </Text>
        </Pressable>

        {/* Status Badge: Clickable to explain calculation */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Health Score Breakdown"
          onPress={openInfoModal}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: theme.radius.full,
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <ShieldCheck size={12} color={healthData.color} />
          <Text variant="caption" style={{ fontWeight: '600', color: healthData.color, fontSize: 11 }}>
            {healthData.status}
          </Text>
        </Pressable>
      </View>

      {/* ── SCORE RADIAL DIAL + GRADE ROW (Clickable) ── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Health Score Breakdown"
        onPress={openInfoModal}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 18,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ position: 'relative', width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={96} height={96} viewBox="0 0 96 96">
            <Defs>
              <LinearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={healthData.color} stopOpacity="1" />
                <Stop offset="100%" stopColor={theme.colors.primary} stopOpacity="0.8" />
              </LinearGradient>
            </Defs>

            {/* Background track */}
            <Circle
              cx={48}
              cy={48}
              r={radius}
              stroke={theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
              strokeWidth={strokeWidth}
              fill="transparent"
            />

            {/* Progress Arc */}
            <Circle
              cx={48}
              cy={48}
              r={radius}
              stroke="url(#healthGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              rotation={-90}
              originX={48}
              originY={48}
            />
          </Svg>

          {/* Center Score */}
          <View style={{ position: 'absolute', alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: healthData.color, fontVariant: ['tabular-nums'] }}>
              {healthData.score}
            </Text>
            <Text variant="caption" muted style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Score
            </Text>
          </View>
        </View>

        {/* Grade & Description */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: healthData.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                {healthData.grade}
              </Text>
            </View>

            <View style={{ gap: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 14.5, color: theme.colors.text }}>
                {healthData.status}
              </Text>
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                Calculated across {expenses.length} records
              </Text>
            </View>
          </View>

          <Text variant="caption" muted style={{ fontSize: 12, lineHeight: 16 }}>
            {healthData.score >= 75
              ? 'Your spending discipline is in top tier. Outflows match your planned pace.'
              : 'Pacing can be optimized. Review top categories and weekend expenditures.'}
          </Text>
        </View>
      </Pressable>

      {/* ── ACTIONABLE SMART INSIGHTS LIST ── */}
      <View
        style={{
          marginTop: theme.spacing.xs,
          paddingTop: theme.spacing.md,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          gap: 10,
        }}
      >
        <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 }}>
          {t('health_diagnostics') || 'Behavioral Diagnostics & Insights'}
        </Text>

        {healthData.insights.map((insight, idx) => {
          const Icon = insight.icon;
          const isWarning = insight.type === 'warning';
          const iconColor = isWarning ? '#F59E0B' : theme.colors.primary;

          return (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                gap: 10,
                alignItems: 'flex-start',
                padding: 10,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  marginTop: 1,
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  backgroundColor: isWarning
                    ? (theme.isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)')
                    : (theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.1)'),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={14} color={iconColor} />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: theme.colors.text }}>
                  {insight.title}
                </Text>
                <Text variant="caption" muted style={{ fontSize: 11, lineHeight: 15 }}>
                  {insight.desc}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── ℹ️ FINANCIAL HEALTH CALCULATION EXPLAINER MODAL ── */}
      <Modal
        visible={infoModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeInfoModal}
      >
        <Pressable
          onPress={closeInfoModal}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.72)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              maxHeight: '85%',
              backgroundColor: theme.colors.surface,
              borderRadius: 24,
              padding: 22,
              gap: 16,
              borderWidth: 1.2,
              borderColor: theme.colors.border,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Award size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Financial Health Score
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                    0–100 Diagnostic Algorithm Breakdown
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={closeInfoModal}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <X size={15} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              <Text muted style={{ fontSize: 13, lineHeight: 18 }}>
                The Financial Health Score is an automated 0–100 behavioral diagnostic evaluating your financial discipline across 4 core pillars:
              </Text>

              {/* Pillar 1: Budget Adherence */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Target size={16} color="#10B981" />
                    <Text style={{ fontWeight: '800', fontSize: 13.5, color: theme.colors.text }}>
                      1. Budget Adherence
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 12, color: '#10B981' }}>
                    Max 35 pts
                  </Text>
                </View>
                <Text variant="caption" muted style={{ fontSize: 12, lineHeight: 16 }}>
                  Measures whether your cumulative spending aligns with the current day of the month. Staying safely under your monthly ceiling yields maximum points.
                </Text>
              </View>

              {/* Pillar 2: Spending Volatility */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Activity size={16} color="#38BDF8" />
                    <Text style={{ fontWeight: '800', fontSize: 13.5, color: theme.colors.text }}>
                      2. Spending Stability
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 12, color: '#38BDF8' }}>
                    Max 25 pts
                  </Text>
                </View>
                <Text variant="caption" muted style={{ fontSize: 12, lineHeight: 16 }}>
                  Analyzes variance in daily transactions. Consistent day-to-day rhythm without unplanned huge spikes scores highest.
                </Text>
              </View>

              {/* Pillar 3: Category Diversification */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <PieChart size={16} color="#818CF8" />
                    <Text style={{ fontWeight: '800', fontSize: 13.5, color: theme.colors.text }}>
                      3. Category Balance
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 12, color: '#818CF8' }}>
                    Max 20 pts
                  </Text>
                </View>
                <Text variant="caption" muted style={{ fontSize: 12, lineHeight: 16 }}>
                  Evaluates diversification across essentials, dining, transport, and utilities. Penalizes over-concentration where a single category exceeds 60% of outflows.
                </Text>
              </View>

              {/* Pillar 4: Weekend vs Weekday Surge */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Calendar size={16} color="#F59E0B" />
                    <Text style={{ fontWeight: '800', fontSize: 13.5, color: theme.colors.text }}>
                      4. Weekend Rhythm
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 12, color: '#F59E0B' }}>
                    Max 20 pts
                  </Text>
                </View>
                <Text variant="caption" muted style={{ fontSize: 12, lineHeight: 16 }}>
                  Monitors leisure spending spikes on Saturdays and Sundays to prevent lifestyle inflation from derailing weekly targets.
                </Text>
              </View>

              {/* Rating Scale Legend */}
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={{ fontWeight: '800', fontSize: 13, color: theme.colors.text }}>
                  Grade Scale
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.15)' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>90–100: A+ (Elite)</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(56,189,248,0.15)' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#38BDF8' }}>75–89: A (Strong)</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.15)' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B' }}>60–74: B (Moderate)</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(251,146,60,0.15)' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#FB923C' }}>45–59: C (Risk)</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.15)' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>&lt;45: D (Over limit)</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Dismiss Button */}
            <Pressable
              onPress={closeInfoModal}
              style={{
                width: '100%',
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
            >
              <Text style={{ fontWeight: '800', color: '#FFFFFF', fontSize: 14 }}>
                Got It
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}
