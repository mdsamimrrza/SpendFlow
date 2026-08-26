import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Flame,
  Info,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
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
  const { convert } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();

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
            icon: Info,
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
        const savingsPct = Math.round((1 - budgetUsedRatio / Math.max(expectedRatio, 0.01)) * 100);
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
          desc: `Current pace is trending ahead of your monthly budget calendar. Consider pacing down.`,
        });
      } else {
        budgetPoints = 0;
        insights.push({
          type: 'warning',
          icon: AlertTriangle,
          title: 'Budget Ceiling Exceeded',
          desc: `Total spending (${formatMoney(totalSpent, currency)}) has passed your set limit.`,
        });
      }
    } else {
      budgetPoints = 25;
      insights.push({
        type: 'info',
        icon: Info,
        title: 'Set Monthly Limit',
        desc: 'Define a monthly spending target in Settings to enable precise budget adherence scoring.',
      });
    }

    // 2. Category Concentration (0-20 pts)
    const categories = groupByCategory(expenses, currency);
    if (categories.length > 0 && totalSpent > 0) {
      const topCat = categories[0];
      const topCatShare = topCat.total / totalSpent;

      if (topCatShare > 0.55) {
        categoryPoints = 10;
        insights.push({
          type: 'warning',
          icon: Zap,
          title: `High ${topCat.label} Concentration`,
          desc: `${Math.round(topCatShare * 100)}% of your outflow is concentrated in ${topCat.label}.`,
        });
      } else {
        categoryPoints = 20;
        insights.push({
          type: 'success',
          icon: Sparkles,
          title: 'Balanced Outflow Spread',
          desc: `Spending is well distributed across ${categories.length} distinct categories.`,
        });
      }
    }

    // 3. Weekend vs Weekday Surge (0-20 pts)
    let weekendSpend = 0;
    let weekdaySpend = 0;
    expenses.forEach((e) => {
      if (!e.date) return;
      const day = new Date(e.date).getDay();
      const amt = convert(Number(e.amount), e.currency || 'NPR', currency);
      if (day === 0 || day === 6) weekendSpend += amt;
      else weekdaySpend += amt;
    });

    const weekendDailyAvg = weekendSpend / 2;
    const weekdayDailyAvg = weekdaySpend / 5;
    if (weekdayDailyAvg > 0 && weekendDailyAvg > weekdayDailyAvg * 2.2) {
      weekendPoints = 12;
      insights.push({
        type: 'warning',
        icon: Flame,
        title: 'Weekend Surge Pattern',
        desc: `Weekend daily spending averages ${formatMoney(Math.round(weekendDailyAvg), currency)}, significantly above weekdays.`,
      });
    } else {
      weekendPoints = 20;
    }

    const totalScore = Math.min(100, Math.max(15, Math.round(budgetPoints + volatilityPoints + categoryPoints + weekendPoints)));

    let grade = 'A';
    let status = 'Excellent Health';
    let color = '#10B981';

    if (totalScore >= 88) {
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
      insights: insights.slice(0, 3), // show top 3 most relevant insights
    };
  }, [expenses, monthlyBudget, currency, convert]);

  // Radial dial geometry
  const radius = 40;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (healthData.score / 100) * circumference;

  return (
    <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
      {/* ── CARD HEADER ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Award size={18} color={theme.colors.primary} />
          <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
            {t('health_score_title') || 'Financial Health Score'}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: theme.radius.full,
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          }}
        >
          <ShieldCheck size={12} color={healthData.color} />
          <Text variant="caption" style={{ fontWeight: '800', color: healthData.color, fontSize: 11 }}>
            {healthData.status}
          </Text>
        </View>
      </View>

      {/* ── SCORE RADIAL DIAL + GRADE ROW ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
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
            <Text style={{ fontSize: 24, fontWeight: '900', color: healthData.color, fontVariant: ['tabular-nums'] }}>
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
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
                {healthData.grade}
              </Text>
            </View>

            <View style={{ gap: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: theme.colors.text }}>
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
      </View>

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
    </Card>
  );
}
