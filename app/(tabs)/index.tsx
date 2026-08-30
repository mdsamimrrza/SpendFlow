import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { ArrowRight, Plus, ReceiptText } from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { BudgetLimitHeroCard } from '@/components/expense/BudgetLimitHeroCard';
import { CategoryBreakdown } from '@/components/expense/Charts';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExpenseItem } from '@/components/expense/ExpenseItem';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProfileQuickCard } from '@/components/ui/ProfileQuickCard';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { StockTrendChart } from '@/components/expense/StockTrendChart';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { currentMonthRange, isoDate, sumExpenses } from '@/utils/format';
import { CURRENCY_DETAILS } from '@/constants/app';

export default function HomeScreen() {
  const { profile, session, refreshProfile } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const theme = useTheme();
  const router = useRouter();
  const { rates } = useExchangeRates();
  const month = currentMonthRange();
  const expenses = useExpenses(profile?.id ?? session?.user?.id, {
    fromDate: month.previousFrom,
    toDate: month.to,
    fetchAll: true,
  });
  const [profileCardOpen, setProfileCardOpen] = useState(false);

  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;
  const refreshExpensesRef = useRef(expenses.refresh);
  refreshExpensesRef.current = expenses.refresh;

  useFocusEffect(
    useCallback(() => {
      void refreshProfileRef.current?.();
      void refreshExpensesRef.current?.();
    }, []),
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const currentMonthItems = expenses.items.filter((expense) => expense.date >= month.from && expense.date <= month.to);
  const monthTotal = sumExpenses(
    currentMonthItems,
    preferredCurrency,
    rates,
    'expense',
  );
  const monthIncome = sumExpenses(
    currentMonthItems,
    preferredCurrency,
    rates,
    'income',
  );

  const prevMonthItems = expenses.items.filter((expense) => expense.date >= month.previousFrom && expense.date <= month.previousTo);
  const prevMonthTotal = sumExpenses(
    prevMonthItems,
    preferredCurrency,
    rates,
    'expense',
  );
  const prevMonthIncome = sumExpenses(
    prevMonthItems,
    preferredCurrency,
    rates,
    'income',
  );

  const todayIso = isoDate(new Date());
  const todayTotal = sumExpenses(
    expenses.items.filter((expense) => expense.date === todayIso),
    preferredCurrency,
    rates,
  );

  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;

  // Time-aware greeting
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? t('home_greeting_morning') : currentHour < 17 ? t('home_greeting_afternoon') : t('home_greeting_evening');

  const formattedDate = new Date().toLocaleDateString(language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const fullMonthName = new Date().toLocaleDateString(language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });

  const latestExpenses = expenses.items.slice(0, 3);
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'User';

  // Very subtle micro-floating animation (slight 3px vertical & 1.5px horizontal drift)
  const floatY = useRef(new Animated.Value(0)).current;
  const floatX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const yAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -3,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const xAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatX, {
          toValue: 1.5,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatX, {
          toValue: -1.5,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    yAnim.start();
    xAnim.start();

    return () => {
      yAnim.stop();
      xAnim.stop();
    };
  }, [floatY, floatX]);

  if (expenses.loading && expenses.items.length === 0) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.lg, backgroundColor: theme.colors.background }}>
        <Skeleton height={60} />
        <Skeleton height={180} />
        <Skeleton height={220} />
        <Skeleton height={160} />
        <Skeleton height={240} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Offline Sync Banner — tap to retry sync, long-press to clear the queue */}
      <FlatList
        data={latestExpenses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={expenses.refreshing}
            onRefresh={() => {
              void refreshProfile();
              void expenses.refresh(true);
            }}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.lg }}>
            {/* 1. TOP APP BAR */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
                  {greeting}, {displayName} 👋
                </Text>
                <Text variant="h2" style={{ fontWeight: '800', letterSpacing: -0.3 }}>
                  SpendFlow {(CURRENCY_DETAILS as Record<string, { flag: string; label: string }>)[preferredCurrency]?.flag ?? ''}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <ThemeToggle />

                {/* Profile Avatar */}
                <PressableScale
                  onPress={() => setProfileCardOpen(true)}
                  activeScale={0.88}
                  style={{ position: 'relative' }}
                >
                  <Avatar uri={profile?.avatar_url} name={displayName} size={42} />
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: theme.colors.success,
                      borderWidth: 2,
                      borderColor: theme.colors.surface,
                    }}
                  />
                </PressableScale>
              </View>
            </View>

            {/* 2. BUDGET & REMAINING LIMIT HERO GAUGE */}
            <BudgetLimitHeroCard
              monthTotal={monthTotal}
              monthlyBudget={monthlyBudget}
              preferredCurrency={preferredCurrency}
              formattedDate={formattedDate}
              fullMonthName={fullMonthName}
              todayTotal={todayTotal}
              prevMonthTotal={prevMonthTotal}
              monthIncome={monthIncome}
              prevMonthIncome={prevMonthIncome}
            />

            {/* 3. STOCK-STYLE FINANCIAL TREND WAVE GRAPH (1D / 7D / 4W / 6M / 1Y) */}
            <StockTrendChart
              expenses={expenses.items}
              targetCurrency={preferredCurrency}
            />

            {/* 4. INTERACTIVE CATEGORY BREAKDOWN */}
            <CategoryBreakdown
              expenses={expenses.items}
              targetCurrency={preferredCurrency}
            />

            {/* 5. RECENT ACTIVITY HEADER */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Text variant="h3" style={{ fontWeight: '800' }}>{t('home_recent_activity') || 'Recent Activity'}</Text>
              <Link href="/history" asChild>
                <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                    {t('home_view_all') || 'View all'} ({expenses.items.length})
                  </Text>
                  <ArrowRight size={14} color={theme.colors.primary} />
                </Pressable>
              </Link>
            </View>
          </View>
        }
        renderItem={({ item }) => <ExpenseItem expense={item} />}
        ListFooterComponent={
          expenses.items.length > 3 ? (
            <Link href="/history" asChild>
              <Pressable
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  marginTop: 4,
                }}
              >
                <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary }}>
                  View All {expenses.items.length} Transactions in History
                </Text>
                <ArrowRight size={14} color={theme.colors.primary} />
              </Pressable>
            </Link>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon={ReceiptText}
            title={t('home_no_expenses_title')}
            message={t('home_no_expenses_message')}
            actionLabel={t('home_add_expense')}
            onAction={() => router.push('/expense/add')}
          />
        }
      />

      {/* Profile quick drawer modal */}
      <ProfileQuickCard visible={profileCardOpen} onClose={() => setProfileCardOpen(false)} />

      {/* Floating + Add Expense Button with subtle micro-drift */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 86,
          right: 20,
          transform: [{ translateY: floatY }, { translateX: floatX }],
        }}
      >
        <Link href="/expense/add" asChild>
          <PressableScale
            activeScale={0.85}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: theme.colors.primary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <Plus size={28} color="#FFFFFF" strokeWidth={2.5} />
          </PressableScale>
        </Link>
      </Animated.View>
    </View>
  );
}
