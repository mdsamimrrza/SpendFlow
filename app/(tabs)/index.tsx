import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, ArrowUpRight, CheckCircle2, Plus, ReceiptText, Settings, Wallet } from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { CategoryBreakdown, TrendBars } from '@/components/expense/Charts';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExpenseItem } from '@/components/expense/ExpenseItem';
import { ProfileQuickCard } from '@/components/ui/ProfileQuickCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { useSync } from '@/hooks/useSync';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { Category } from '@/types';
import { currentMonthRange, formatBudgetPercent, formatMoney, isoDate, sumExpenses } from '@/utils/format';

export default function HomeScreen() {
  const { profile, session, refreshProfile } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  const { rates } = useExchangeRates();
  const expenses = useExpenses(profile?.id ?? session?.user?.id);
  const sync = useSync(profile?.id);
  const [, setCategories] = useState<Category[]>([]);
  const [profileCardOpen, setProfileCardOpen] = useState(false);
  const month = currentMonthRange();

  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;
  const refreshExpensesRef = useRef(expenses.refresh);
  refreshExpensesRef.current = expenses.refresh;
  const refreshSyncRef = useRef(sync.refreshCount);
  refreshSyncRef.current = sync.refreshCount;

  useFocusEffect(
    useCallback(() => {
      void refreshProfileRef.current?.();
      void refreshExpensesRef.current?.();
      void refreshSyncRef.current?.();
      if (profile?.id) listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
    }, [profile?.id]),
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const todayTotal = sumExpenses(
    expenses.items.filter((expense) => expense.date === isoDate()),
    preferredCurrency,
    rates,
  );
  const monthTotal = sumExpenses(
    expenses.items.filter((expense) => expense.date >= month.from && expense.date <= month.to),
    preferredCurrency,
    rates,
  );

  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;
  const isBudgetSet = monthlyBudget > 0;
  const remaining = isBudgetSet ? monthlyBudget - monthTotal : 0;
  const ratio = isBudgetSet ? Math.min(monthTotal / monthlyBudget, 1) : 0;
  const isOverBudget = isBudgetSet && monthTotal > monthlyBudget;

  const progressColor = isOverBudget ? theme.colors.danger : ratio >= 0.8 ? '#F59E0B' : theme.colors.success;

  // Time-aware greeting
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? t('home_greeting_morning') : currentHour < 17 ? t('home_greeting_afternoon') : t('home_greeting_evening');

  const formattedDate = new Date().toLocaleDateString(language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const latestExpenses = expenses.items.slice(0, 5);
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'User';

  if (expenses.loading && expenses.items.length === 0) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.lg, backgroundColor: theme.colors.background }}>
        <Skeleton height={60} />
        <Skeleton height={200} />
        <Skeleton height={180} />
        <Skeleton height={150} />
        <Skeleton height={240} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Offline Sync Banner */}
      {sync.pendingCount ? (
        <View style={{ backgroundColor: theme.colors.warning, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md }}>
          <Text variant="caption" style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '600' }}>
            ⚡ {sync.pendingCount} {t('home_offline_sync')}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={latestExpenses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={expenses.refreshing}
            onRefresh={() => {
              void refreshProfile();
              void expenses.refresh();
              void sync.processQueue();
            }}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.lg }}>
            {/* 1. TOP APP BAR HEADER WITH GREETING & PROFILE */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <Text variant="caption" muted style={{ fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {greeting}, {displayName} 👋
                </Text>
                <Text variant="h2" style={{ fontWeight: '800' }}>SpendFlow</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                {/* Language Switch Pill */}
                <Pressable
                  onPress={() => setLanguage(language === 'en' ? 'hi' : language === 'hi' ? 'ne' : 'en')}
                  style={{
                    backgroundColor: theme.colors.surfaceElevated,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: theme.radius.full,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>
                    {language === 'en' ? '🇮🇳 HI' : language === 'hi' ? '🇳🇵 NE' : '🇺🇸 EN'}
                  </Text>
                </Pressable>

                <ThemeToggle />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('settings_profile')}
                  onPress={() => setProfileCardOpen(true)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    position: 'relative',
                    opacity: pressed ? 0.75 : 1,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  })}
                >
                  <Avatar uri={profile?.avatar_url} name={displayName} size={38} />
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: theme.colors.success,
                      borderWidth: 1.5,
                      borderColor: theme.colors.surface,
                    }}
                  />
                </Pressable>
              </View>
            </View>

            {/* 2. TOTAL MONTHLY SPEND HERO CARD */}
            <Card
              style={{
                gap: theme.spacing.md,
                padding: theme.spacing.lg,
                backgroundColor: theme.isDark ? '#141E33' : '#EEF2FF',
                borderColor: theme.colors.primary,
                borderWidth: 1.5,
              }}
            >
              {/* Card Header: Total Monthly Spend Label & Settings Link */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Wallet size={18} color={theme.colors.primary} />
                  <Text variant="caption" style={{ color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}>
                    {t('home_total_spent_month')}
                  </Text>
                </View>
                <Link href="/settings" asChild>
                  <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Settings size={14} color={theme.colors.textMuted} />
                    <Text variant="caption" muted>
                      {t('home_settings')}
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {/* Main Spend Amount */}
              <View>
                <Text variant="h1" style={{ fontSize: 36, lineHeight: 42, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {formatMoney(monthTotal, preferredCurrency)}
                </Text>
                <Text variant="caption" muted style={{ marginTop: 2 }}>
                  {formattedDate} • {preferredCurrency}
                </Text>
              </View>

              {/* Budget Health Bar */}
              {isBudgetSet ? (
                <View style={{ gap: theme.spacing.xs, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {isOverBudget ? <AlertCircle size={14} color={theme.colors.danger} /> : <CheckCircle2 size={14} color={progressColor} />}
                      <Text variant="caption" style={{ color: progressColor, fontWeight: '700' }}>
                        {isOverBudget
                          ? `${t('home_exceeded_by')} ${formatMoney(Math.abs(remaining), preferredCurrency)}`
                          : `${formatMoney(remaining, preferredCurrency)} ${t('home_remaining')}`}
                      </Text>
                    </View>
                    <Text variant="caption" muted>
                      {t('home_target')}: {formatMoney(monthlyBudget, preferredCurrency)} ({formatBudgetPercent(monthTotal, monthlyBudget)})
                    </Text>
                  </View>

                  {/* Progress Bar */}
                  <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.colors.border }}>
                    <View
                      style={{
                        width: `${Math.min(ratio * 100, 100)}%`,
                        height: '100%',
                        backgroundColor: progressColor,
                        borderRadius: 3,
                      }}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm }}>
                  <Text variant="caption" muted>
                    {t('home_no_budget_set')}
                  </Text>
                  <Pressable onPress={() => router.push('/settings')} hitSlop={6}>
                    <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                      {t('home_set_budget')}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Quick Metrics Sub-Row */}
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingTop: theme.spacing.xs }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" muted numberOfLines={1}>
                    {t('home_spent_today')}
                  </Text>
                  <Text variant="label" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {formatMoney(todayTotal, preferredCurrency)}
                  </Text>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" muted numberOfLines={1}>
                    {t('home_target_limit')}
                  </Text>
                  <Text variant="label" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {isBudgetSet ? formatMoney(monthlyBudget, preferredCurrency) : t('home_not_set')}
                  </Text>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" muted numberOfLines={1}>
                    {t('home_budget_status')}
                  </Text>
                  <Text variant="label" style={{ fontWeight: '700', color: isBudgetSet ? progressColor : theme.colors.textMuted }}>
                    {isBudgetSet ? (isOverBudget ? t('home_over_limit') : `${formatBudgetPercent(monthTotal, monthlyBudget)} ${t('home_used')}`) : t('home_unset')}
                  </Text>
                </View>
              </View>
            </Card>

            {/* 3. CIRCULAR CATEGORY BREAKDOWN GRAPH */}
            <CategoryBreakdown expenses={expenses.items} targetCurrency={preferredCurrency} />

            {/* 5. SPENDING TREND BAR GRAPH CHART */}
            <TrendBars expenses={expenses.items} targetCurrency={preferredCurrency} />

            {/* 6. RECENT ACTIVITY HEADER */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.xs }}>
              <Text variant="h3">{t('home_recent_activity')}</Text>
              {expenses.items.length > 5 ? (
                <Link href="/history" asChild>
                  <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text variant="label" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                      {t('home_view_all')} ({expenses.items.length})
                    </Text>
                    <ArrowUpRight size={14} color={theme.colors.primary} />
                  </Pressable>
                </Link>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => <ExpenseItem expense={item} onDelete={(expense) => expenses.remove(expense.id)} />}
        ListEmptyComponent={<EmptyState icon={ReceiptText} title={t('home_no_expenses_title')} message={t('home_no_expenses_message')} />}
        ListFooterComponent={
          expenses.items.length > 5 ? (
            <Link href="/history" asChild>
              <Pressable
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  marginTop: theme.spacing.xs,
                }}
              >
                <Text variant="label" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                  {t('home_view_all_transactions')}
                </Text>
              </Pressable>
            </Link>
          ) : null
        }
      />

      {/* Floating Action Button (FAB) */}
      <Link href="/expense/add" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home_add_expense')}
          style={{
            position: 'absolute',
            right: theme.spacing.xl,
            bottom: theme.spacing['3xl'],
            width: 56,
            height: 56,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 6,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 6,
          }}
        >
          <Plus size={26} color="#FFFFFF" />
        </Pressable>
      </Link>

      <ProfileQuickCard visible={profileCardOpen} onClose={() => setProfileCardOpen(false)} />
    </View>
  );
}
