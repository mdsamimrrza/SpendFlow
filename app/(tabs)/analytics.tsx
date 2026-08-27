import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Clock,
  Compass,
  CreditCard,
  Gauge,
  Layers,
  LayoutGrid,
  PieChart,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from 'lucide-react-native';
import { BudgetAnalyticsCard } from '@/components/expense/BudgetAnalyticsCard';
import { BudgetProgress } from '@/components/expense/BudgetProgress';
import { CategoryBudgetFormModal } from '@/components/expense/CategoryBudgetFormModal';
import { CategoryBreakdown } from '@/components/expense/Charts';
import { FinancialHealthScoreCard } from '@/components/expense/FinancialHealthScoreCard';
import { FinancialInsights } from '@/components/expense/FinancialInsights';
import { StockTrendChart } from '@/components/expense/StockTrendChart';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { Category, PeriodKey } from '@/types';
import { filterExpensesByPeriod, formatMoney, sumExpenses } from '@/utils/format';

type AnalyticsSectionTab = 'overview' | 'categories' | 'habits' | 'all';
type KpiMetricKey = 'total_spent' | 'daily_velocity' | 'peak_expense' | 'average_ticket';

export default function AnalyticsScreen() {
  const { profile, session } = useAuth();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const theme = useTheme();
  const { rates, convert } = useExchangeRates();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [activeTab, setActiveTab] = useState<AnalyticsSectionTab>('overview');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [kpiModalMetric, setKpiModalMetric] = useState<KpiMetricKey | null>(null);
  const expenses = useExpenses(profile?.id ?? session?.user?.id);

  const loadCategories = useCallback(() => {
    if (profile?.id) {
      listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
    }
  }, [profile?.id]);

  const PERIOD_OPTIONS: { label: string; value: PeriodKey }[] = [
    { label: t('analytics_period_today') || 'Today', value: 'today' },
    { label: t('analytics_period_week') || 'Week', value: 'week' },
    { label: t('analytics_period_month') || 'Month', value: 'month' },
    { label: t('analytics_period_year') || 'Year', value: 'year' },
    { label: t('analytics_period_all') || 'All Time', value: 'all' },
  ];

  const SECTION_TABS: { key: AnalyticsSectionTab; label: string; icon: any }[] = [
    { key: 'overview', label: t('analytics_tab_overview') || 'Overview', icon: LayoutGrid },
    { key: 'categories', label: t('analytics_tab_categories') || 'Categories', icon: PieChart },
    { key: 'habits', label: t('analytics_tab_habits') || 'Habits & Forecast', icon: Activity },
    { key: 'all', label: t('analytics_tab_all') || 'All Insights', icon: Layers },
  ];

  useFocusEffect(
    useCallback(() => {
      void expenses.refresh();
      loadCategories();
    }, [expenses.refresh, loadCategories]),
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  // Apply Period Filter (Today, This Week, This Month, This Year, All Time)
  const filteredItems = useMemo(
    () => filterExpensesByPeriod(expenses.items, period),
    [expenses.items, period],
  );

  const totalSpend = sumExpenses(filteredItems, preferredCurrency, rates);

  // Largest single expense item
  const peakItem = useMemo(() => {
    if (filteredItems.length === 0) return null;
    let highest = filteredItems[0];
    let maxVal = 0;
    filteredItems.forEach((e) => {
      const converted = convert(Number(e.amount), e.currency || 'NPR', preferredCurrency);
      if (converted > maxVal) {
        maxVal = converted;
        highest = e;
      }
    });
    return { expense: highest, amount: maxVal };
  }, [filteredItems, preferredCurrency, convert]);

  // Daily average spend velocity in this period
  const dailyVelocity = useMemo(() => {
    if (filteredItems.length === 0 || totalSpend === 0) return 0;
    const now = new Date();
    if (period === 'today') return totalSpend;
    if (period === 'week') return Math.round(totalSpend / 7);
    if (period === 'month') return Math.round(totalSpend / Math.max(now.getDate(), 1));
    if (period === 'year') {
      const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
      return Math.round(totalSpend / Math.max(dayOfYear, 1));
    }
    return Math.round(totalSpend / 30);
  }, [filteredItems, totalSpend, period]);

  // Average ticket per transaction
  const averageTicket = filteredItems.length > 0 ? Math.round(totalSpend / filteredItems.length) : 0;

  // Group by payment method
  const paymentMethodsBreakdown = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    filteredItems.forEach((e) => {
      const pm = e.payment_method || 'Cash';
      const converted = convert(Number(e.amount), e.currency || 'NPR', preferredCurrency);
      if (!map[pm]) map[pm] = { total: 0, count: 0 };
      map[pm].total += converted;
      map[pm].count += 1;
    });
    return Object.entries(map).map(([method, data]) => ({
      method,
      total: data.total,
      count: data.count,
      pct: totalSpend > 0 ? Math.round((data.total / totalSpend) * 100) : 0,
    }));
  }, [filteredItems, preferredCurrency, convert, totalSpend]);

  const showOverview = activeTab === 'overview' || activeTab === 'all';
  const showCategories = activeTab === 'categories' || activeTab === 'all';
  const showHabits = activeTab === 'habits' || activeTab === 'all';

  function openKpiModal(metric: KpiMetricKey) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setKpiModalMetric(metric);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 130 }}
      refreshControl={
        <RefreshControl
          refreshing={expenses.refreshing}
          onRefresh={() => {
            void expenses.refresh();
            loadCategories();
          }}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* ── 1. TOP APP BAR ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
            Financial Intelligence
          </Text>
          <Text variant="h1" style={{ fontWeight: '800', letterSpacing: -0.3 }}>
            {t('analytics_title') || 'Analytics'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PrivacyEyeButton />
          <ThemeToggle />
        </View>
      </View>

      {/* ── 2. PERIOD SELECTOR HORIZONTAL PILLS ── */}
      <View style={{ gap: 6 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = period === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setPeriod(opt.value)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  borderRadius: theme.radius.full,
                  backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: isActive ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? '800' : '600',
                    color: isActive ? '#FFFFFF' : theme.colors.textMuted,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── 3. FOCUS SUB-TABS (Overview | Categories | Habits | All) ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 4,
          padding: 4,
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {SECTION_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                minWidth: isCompact ? 112 : 0,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: theme.radius.md,
                backgroundColor: isActive ? (theme.isDark ? '#1E293B' : '#FFFFFF') : 'transparent',
                shadowColor: isActive ? '#000000' : 'transparent',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isActive ? 0.1 : 0,
                shadowRadius: 4,
                elevation: isActive ? 2 : 0,
              }}
            >
              <Icon size={14} color={isActive ? theme.colors.primary : theme.colors.textMuted} />
              <Text
                variant="caption"
                style={{
                  fontWeight: isActive ? '800' : '600',
                  fontSize: 11,
                  color: isActive ? theme.colors.primary : theme.colors.textMuted,
                }}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ═══════════════════════════════════════════════
          SECTION 1: OVERVIEW & PERFORMANCE
         ═══════════════════════════════════════════════ */}
      {showOverview && (
        <View style={{ gap: theme.spacing.md }}>
          {activeTab === 'all' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <LayoutGrid size={16} color={theme.colors.primary} />
              <Text variant="caption" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: theme.colors.primary }}>
                Executive Overview & Trends
              </Text>
            </View>
          )}

          {/* 4-Tile Executive KPI Cards (Tapping Icon or Card opens calculation explainer) */}
          <View style={{ gap: 10 }}>
            {/* Row 1: Total Spent & Daily Burn Velocity */}
            <View style={{ flexDirection: isCompact ? 'column' : 'row', gap: 10 }}>
              {/* Card 1: Total Spent */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="About Total Spent"
                onPress={() => openKpiModal('total_spent')}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Card
                  style={{
                    padding: 14,
                    gap: 4,
                    backgroundColor: theme.isDark ? '#111827' : theme.colors.cardHighlight,
                    borderWidth: 1.5,
                    borderColor: theme.colors.primary,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 }}>
                      {t('analytics_total_spending') || 'Total Spent'}
                    </Text>
                    <Wallet size={16} color={theme.colors.primary} />
                  </View>
                  <Text variant="h2" style={{ fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                    {formatMoney(totalSpend, preferredCurrency)}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    {filteredItems.length} transactions
                  </Text>
                </Card>
              </Pressable>

              {/* Card 2: Daily Velocity */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="About Daily Velocity"
                onPress={() => openKpiModal('daily_velocity')}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Card
                  style={{
                    padding: 14,
                    gap: 4,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 }}>
                      Daily Velocity
                    </Text>
                    <Gauge size={16} color={theme.colors.primary} />
                  </View>
                  <Text variant="h2" style={{ fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], color: theme.colors.text }}>
                    {formatMoney(dailyVelocity, preferredCurrency)}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Burn rate / day
                  </Text>
                </Card>
              </Pressable>
            </View>

            {/* Row 2: Peak Single Expense & Average Ticket Size */}
            <View style={{ flexDirection: isCompact ? 'column' : 'row', gap: 10 }}>
              {/* Card 3: Peak Expense */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="About Peak Expense"
                onPress={() => openKpiModal('peak_expense')}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Card
                  style={{
                    padding: 14,
                    gap: 4,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 }}>
                      Peak Expense
                    </Text>
                    <Zap size={16} color="#F59E0B" />
                  </View>
                  <Text variant="h2" style={{ fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], color: theme.colors.text }}>
                    {peakItem ? formatMoney(peakItem.amount, preferredCurrency) : '—'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }} numberOfLines={1}>
                    {peakItem ? `${peakItem.expense.categories?.icon || '💳'} ${peakItem.expense.description || peakItem.expense.categories?.name || 'Expense'}` : 'No purchases'}
                  </Text>
                </Card>
              </Pressable>

              {/* Card 4: Average Ticket */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="About Average Ticket"
                onPress={() => openKpiModal('average_ticket')}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Card
                  style={{
                    padding: 14,
                    gap: 4,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 }}>
                      Average Ticket
                    </Text>
                    <Sparkles size={16} color="#38BDF8" />
                  </View>
                  <Text variant="h2" style={{ fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], color: theme.colors.text }}>
                    {formatMoney(averageTicket, preferredCurrency)}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Per transaction size
                  </Text>
                </Card>
              </Pressable>
            </View>
          </View>

          {/* 0–100 Financial Health Score Card */}
          <FinancialHealthScoreCard
            expenses={filteredItems}
            targetCurrency={preferredCurrency}
          />

          {/* Stock Wave Trend Graph (Full Multi-Period: Today, 7D, 4W, 6M, 1Y) */}
          <StockTrendChart
            expenses={expenses.items}
            targetCurrency={preferredCurrency}
          />
        </View>
      )}

      {/* ═══════════════════════════════════════════════
          SECTION 2: CATEGORY & PAYMENT CHANNELS
         ═══════════════════════════════════════════════ */}
      {showCategories && (
        <View style={{ gap: theme.spacing.md }}>
          {activeTab === 'all' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <PieChart size={16} color={theme.colors.primary} />
              <Text variant="caption" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: theme.colors.primary }}>
                Category & Payment Channels
              </Text>
            </View>
          )}

          {/* Segmented Donut Category Breakdown */}
          <CategoryBreakdown
            expenses={filteredItems}
            targetCurrency={preferredCurrency}
          />

          {/* Category Budget Limits Progress & Tracking */}
          <BudgetProgress
            categories={categories}
            expenses={filteredItems}
            targetCurrency={preferredCurrency}
            onRefreshCategories={loadCategories}
          />

          {/* Payment Method Breakdown */}
          {paymentMethodsBreakdown.length > 0 ? (
            <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CreditCard size={18} color={theme.colors.primary} />
                  <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
                    Payment Method Breakdown
                  </Text>
                </View>
                <Text variant="caption" muted style={{ fontSize: 11 }}>
                  {paymentMethodsBreakdown.length} methods used
                </Text>
              </View>

              <View style={{ gap: 12 }}>
                {paymentMethodsBreakdown.map((pm) => (
                  <View key={pm.method} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                          {pm.method === 'Cash' ? '💵' : pm.method === 'Card' ? '💳' : pm.method === 'UPI' ? '📱' : '🪙'} {pm.method}
                        </Text>
                        <Text variant="caption" muted style={{ fontSize: 11 }}>
                          ({pm.count} {pm.count === 1 ? 'tx' : 'txs'})
                        </Text>
                      </View>
                      <Text
                        variant="caption"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.72}
                        style={{ flexShrink: 1, textAlign: 'right', fontWeight: '800', color: theme.colors.primary }}
                      >
                        {formatMoney(pm.total, preferredCurrency)} ({pm.pct}%)
                      </Text>
                    </View>

                    {/* Progress Bar */}
                    <View style={{ height: 5, borderRadius: 2.5, overflow: 'hidden', backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                      <View
                        style={{
                          width: `${pm.pct}%`,
                          height: '100%',
                          backgroundColor: theme.colors.primary,
                          borderRadius: 2.5,
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
        </View>
      )}

      {/* ═══════════════════════════════════════════════
          SECTION 3: BEHAVIORAL HABITS & FORECAST
         ═══════════════════════════════════════════════ */}
      {showHabits && (
        <View style={{ gap: theme.spacing.md }}>
          {activeTab === 'all' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <Activity size={16} color={theme.colors.primary} />
              <Text variant="caption" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: theme.colors.primary }}>
                Behavioral Patterns & Pacing Forecast
              </Text>
            </View>
          )}

          {/* Day-of-Week Rhythm & Time-of-Day Chrono Patterns with Week-by-Week Navigation */}
          <FinancialInsights
            expenses={expenses.items}
            targetCurrency={preferredCurrency}
          />

          {/* Budget Burn Velocity & Pacing Forecast */}
          <BudgetAnalyticsCard
            expenses={filteredItems}
            targetCurrency={preferredCurrency}
          />
        </View>
      )}

      {/* ── CATEGORY BUDGET CONFIGURATION FORM MODAL ── */}
      <CategoryBudgetFormModal
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        onSaved={loadCategories}
      />

      {/* ── KPI METRICS CALCULATION EXPLAINER MODAL ── */}
      <Modal
        visible={Boolean(kpiModalMetric)}
        transparent
        animationType="fade"
        onRequestClose={() => setKpiModalMetric(null)}
      >
        <Pressable
          onPress={() => setKpiModalMetric(null)}
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
              maxWidth: 420,
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
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 16, paddingBottom: 2 }}
            >
            {/* Modal Header & Body: Total Spent */}
            {kpiModalMetric === 'total_spent' && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.isDark ? 'rgba(15, 159, 142, 0.15)' : '#DCE9E3',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Wallet size={20} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                        Total Spending
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                        Cumulative Outflow in Selected Period
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setKpiModalMetric(null)}
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

                <View style={{ gap: 10 }}>
                  <Text muted style={{ fontSize: 13, lineHeight: 18 }}>
                    Total Spending is the aggregate sum of all valid expenses recorded in the currently selected period, converted into your preferred currency ({preferredCurrency}).
                  </Text>

                  <View style={{ padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
                    <Text style={{ fontWeight: '800', fontSize: 12, color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      How it is calculated
                    </Text>
                    <Text variant="caption" style={{ fontSize: 12.5, color: theme.colors.text, lineHeight: 17 }}>
                      Sum of all (Transaction Amount × Live Exchange Rate) for the active timeframe filter ({filteredItems.length} transactions = {formatMoney(totalSpend, preferredCurrency)}).
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Modal Header & Body: Daily Velocity */}
            {kpiModalMetric === 'daily_velocity' && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.isDark ? 'rgba(15, 159, 142, 0.15)' : '#DCE9E3',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Gauge size={20} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                        Daily Velocity
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                        Average Daily Lifestyle Burn Rate
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setKpiModalMetric(null)}
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

                <View style={{ gap: 10 }}>
                  <Text muted style={{ fontSize: 13, lineHeight: 18 }}>
                    Daily Velocity measures how much money leaves your wallet per calendar day on average. It represents your active burn-rate rhythm.
                  </Text>

                  <View style={{ padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
                    <Text style={{ fontWeight: '800', fontSize: 12, color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      How it is calculated
                    </Text>
                    <Text variant="caption" style={{ fontSize: 12.5, color: theme.colors.text, lineHeight: 17 }}>
                      Total Spend in Period ÷ Elapsed Days = {formatMoney(dailyVelocity, preferredCurrency)} / day.
                    </Text>
                  </View>

                  <View style={{ padding: 10, borderRadius: 10, backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(56, 189, 248, 0.08)' }}>
                    <Text variant="caption" style={{ color: '#0284C7', fontSize: 12, lineHeight: 16 }}>
                      💡 <Text style={{ fontWeight: '700' }}>Projected Month Total:</Text> At {formatMoney(dailyVelocity, preferredCurrency)}/day, your 30-day outflow projects to ~{formatMoney(dailyVelocity * 30, preferredCurrency)}.
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Modal Header & Body: Peak Expense */}
            {kpiModalMetric === 'peak_expense' && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Zap size={20} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                        Peak Expense
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                        Highest Single Transaction
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setKpiModalMetric(null)}
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

                <View style={{ gap: 10 }}>
                  <Text muted style={{ fontSize: 13, lineHeight: 18 }}>
                    Peak Expense spotlights the single largest individual purchase recorded in this period to help you quickly identify heavy outlier outflows.
                  </Text>

                  <View style={{ padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
                    <Text style={{ fontWeight: '800', fontSize: 12, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Highest Single Outflow
                    </Text>
                    <Text variant="caption" style={{ fontSize: 12.5, color: theme.colors.text, lineHeight: 17 }}>
                      {peakItem ? `${formatMoney(peakItem.amount, preferredCurrency)} (${peakItem.expense.description || peakItem.expense.categories?.name || 'Expense'})` : 'No transactions logged in this timeframe.'}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Modal Header & Body: Average Ticket */}
            {kpiModalMetric === 'average_ticket' && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.15)' : '#E0F2FE',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Sparkles size={20} color="#38BDF8" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                        Average Ticket
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                        Average Size Per Transaction
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setKpiModalMetric(null)}
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

                <View style={{ gap: 10 }}>
                  <Text muted style={{ fontSize: 13, lineHeight: 18 }}>
                    Average Ticket is the average amount spent each time you make a purchase (every time you pay via Cash, Card, or UPI).
                  </Text>

                  <View style={{ padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
                    <Text style={{ fontWeight: '800', fontSize: 12, color: '#38BDF8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      How it is calculated
                    </Text>
                    <Text variant="caption" style={{ fontSize: 12.5, color: theme.colors.text, lineHeight: 17 }}>
                      Total Spend ({formatMoney(totalSpend, preferredCurrency)}) ÷ Number of Transactions ({filteredItems.length}) = {formatMoney(averageTicket, preferredCurrency)} / purchase.
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Dismiss Button */}
            <Pressable
              onPress={() => setKpiModalMetric(null)}
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
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
