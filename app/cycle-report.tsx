import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useRateResolver } from '@/hooks/useRateResolver';
import { useTheme } from '@/hooks/useTheme';
import { CategoryBreakdown } from '@/components/expense/Charts';
import { StockTrendChart } from '@/components/expense/StockTrendChart';
import { fetchUserSettingsHistory } from '@/services/settingsHistory';
import type { Expense, UserSettingsPeriod } from '@/types';
import { ExpenseDetailModal } from '@/components/expense/ExpenseDetailModal';
import { formatMoney, getSafeMonthDate, sumExpenses } from '@/utils/format';

const PAGE_SIZE = 6;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const parseISODate = (iso: string) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * Cycle report — opened by tapping a Month-by-Month card on the Budget &
 * Reports screen (params from/to, inclusive both ends). One financial cycle
 * at a glance: summary hero, the main-page stock trend graph, the main-page
 * category breakdown, and the cycle's transactions paginated 6 per page. Web mirror:
 * app/(dashboard)/profit-loss/cycle/page.tsx.
 */
export default function CycleReportScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const theme = useTheme();
  const params = useLocalSearchParams<{ from?: string | string[]; to?: string | string[] }>();
  const from = typeof params.from === 'string' ? params.from : '';
  const to = typeof params.to === 'string' ? params.to : '';
  const valid = ISO.test(from) && ISO.test(to) && from <= to;

  const expenses = useExpenses(profile?.id, { fetchAll: true });
  const currency = profile?.preferred_currency ?? 'NPR';
  const { resolver: rateResolver } = useRateResolver(expenses.items, currency);

  const itemsInRange = useMemo(
    () => (valid ? expenses.items.filter((e) => e.date >= from && e.date <= to) : []),
    [expenses.items, from, to, valid],
  );
  const totalIncome = useMemo(
    () => (rateResolver ? sumExpenses(itemsInRange, currency, rateResolver, 'income') : 0),
    [itemsInRange, currency, rateResolver],
  );
  const totalExpense = useMemo(
    () => (rateResolver ? sumExpenses(itemsInRange, currency, rateResolver, 'expense') : 0),
    [itemsInRange, currency, rateResolver],
  );
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0;

  // Budget IN FORCE for this cycle (newest settings-trail row effective
  // on/before the cycle end), converted at the end date — never today's
  // figure retro-projected onto a past cycle.
  const rawBudget = profile?.monthly_budget ?? 0;
  const budgetCurrency = (profile?.budget_currency || profile?.preferred_currency || 'NPR').toUpperCase();
  const [history, setHistory] = useState<UserSettingsPeriod[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.id) return;
      try {
        const hist = await fetchUserSettingsHistory(profile.id);
        if (!cancelled) setHistory(hist);
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);
  const budget = useMemo(() => {
    if (!valid) return null;
    // history arrives effective_from-asc: last row on/before `to` is in force.
    let inForce: UserSettingsPeriod | undefined;
    for (const p of history) {
      if (p.effective_from <= to) inForce = p;
    }
    const amount = inForce ? inForce.monthly_budget : rawBudget;
    if (amount == null || amount <= 0) return null;
    const cur = (inForce?.budget_currency || budgetCurrency).toUpperCase();
    if (!rateResolver || cur === currency) return Math.round(amount);
    return Math.round(rateResolver.convert(amount, cur, currency, to));
  }, [history, rawBudget, budgetCurrency, currency, rateResolver, to, valid]);

  const sortedDesc = useMemo(() => [...itemsInRange].sort((a, b) => b.date.localeCompare(a.date)), [itemsInRange]);
  const totalPages = Math.max(1, Math.ceil(sortedDesc.length / PAGE_SIZE));
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [from, to]);
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sortedDesc.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sortedDesc, safePage],
  );
  const [selectedTx, setSelectedTx] = useState<Expense | null>(null);
  const dayGroups = useMemo(() => {
    const groups: { date: string; rows: typeof pageRows }[] = [];
    for (const r of pageRows) {
      const last = groups[groups.length - 1];
      if (last && last.date === r.date) last.rows.push(r);
      else groups.push({ date: r.date, rows: [r] });
    }
    return groups;
  }, [pageRows]);

  const rangeLabel = useMemo(() => {
    if (!valid) return '';
    return `${format(parseISODate(from), 'd MMM')} – ${format(parseISODate(to), 'd MMM yyyy')}`;
  }, [from, to, valid]);

  // ── Cycle stepper: prev/next financial-cycle windows. Same anchor + clamp
  // rules as the Month-by-Month builder; Next stops at the current cycle. ──
  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const cycleEndDay = profile?.cycle_end_day ?? null;
  const cycleEndFor = (anchor: Date): Date => {
    if (cycleEndDay !== null && cycleEndDay >= 1 && cycleEndDay <= 31) {
      return cycleEndDay < cycleStartDay
        ? getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() + 1, cycleEndDay)
        : getSafeMonthDate(anchor.getFullYear(), anchor.getMonth(), cycleEndDay);
    }
    const nextStart = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() + 1, cycleStartDay);
    return new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
  };
  const shiftedCycle = (deltaMonths: number) => {
    const anchor = parseISODate(from);
    const a = getSafeMonthDate(anchor.getFullYear(), anchor.getMonth() + deltaMonths, cycleStartDay);
    return { from: format(a, 'yyyy-MM-dd'), to: format(cycleEndFor(a), 'yyyy-MM-dd') };
  };
  const prevCycle = shiftedCycle(-1);
  const nextCycle = shiftedCycle(1);
  const nextDisabled = nextCycle.from > format(new Date(), 'yyyy-MM-dd');
  const goCycle = (c: { from: string; to: string }) => {
    router.setParams({ from: c.from, to: c.to });
  };

  if (!valid) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
        <EmptyState icon={Scale} title={t('pl_cycle_report_title') || 'Cycle report'} message={t('pl_cycle_empty_tx') || 'No transactions in this cycle'} />
      </View>
    );
  }

  const money = (n: number) => formatMoney(n, currency, isPrivacyMode);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 12 }}
    >
      {/* ── HEADER ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          style={{
            width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
          }}
        >
          <ChevronLeft size={18} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <RNText style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: theme.colors.textMuted }}>
            {t('pl_month_by_month') || 'Month by Month'}
          </RNText>
          <RNText style={{ fontSize: 22, fontWeight: '800', color: theme.colors.text }}>
            {t('pl_cycle_report_title') || 'Cycle report'}
          </RNText>
        </View>
      </View>

      {/* ── SUMMARY HERO ── */}
      <View style={{ borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 12 }}>
        {/* Cycle stepper — jump between cycles */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Pressable
            onPress={() => goCycle(prevCycle)}
            accessibilityLabel="Previous cycle"
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <ChevronLeft size={17} color={theme.colors.text} />
          </Pressable>
          <RNText style={{ fontSize: 14, fontWeight: '800', color: theme.colors.text, flexShrink: 1, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
            {rangeLabel}
          </RNText>
          <Pressable
            onPress={() => goCycle(nextCycle)}
            disabled={nextDisabled}
            accessibilityLabel="Next cycle"
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated,
              opacity: nextDisabled ? 0.35 : pressed ? 0.7 : 1,
            })}
          >
            <ChevronRight size={17} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: savingsRate >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}>
            <RNText style={{ fontSize: 11, fontWeight: '800', color: savingsRate >= 0 ? theme.colors.income : theme.colors.danger }}>
              Savings rate: {savingsRate}%
            </RNText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <RNText style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: theme.colors.textMuted }}>Net</RNText>
          <RNText style={{ fontSize: 28, fontWeight: '900', color: net >= 0 ? theme.colors.income : theme.colors.danger }} numberOfLines={1} adjustsFontSizeToFit>
            {net >= 0 ? '+' : '−'}{money(Math.abs(net))}
          </RNText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={13} color={theme.colors.income} />
              <RNText style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted }}>Income</RNText>
            </View>
            <RNText style={{ marginTop: 4, fontSize: 15, fontWeight: '800', color: theme.colors.income }}>
              {money(totalIncome)}
            </RNText>
          </View>
          <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TrendingDown size={13} color={theme.colors.danger} />
              <RNText style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted }}>Expense</RNText>
            </View>
            <RNText style={{ marginTop: 4, fontSize: 15, fontWeight: '800', color: theme.colors.danger }}>
              {money(totalExpense)}
            </RNText>
          </View>
        </View>
        {budget !== null && budget > 0 && (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Wallet size={13} color={theme.colors.primary} />
                <RNText style={{ fontSize: 11.5, fontWeight: '600', color: theme.colors.textMuted }}>
                  Budget
                </RNText>
              </View>
              <RNText style={{ fontSize: 11.5, fontWeight: '700', color: totalExpense > budget ? theme.colors.danger : theme.colors.text }}>
                {money(totalExpense)} / {money(budget)} ({Math.min(Math.round((totalExpense / budget) * 100), 999)}%)
              </RNText>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceElevated, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.min((totalExpense / budget) * 100, 100)}%`,
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor: totalExpense > budget ? theme.colors.danger : theme.colors.primary,
                }}
              />
            </View>
          </View>
        )}
      </View>

      {/* ── STOCK TREND GRAPH — exact main-page chart ── */}
      <StockTrendChart
        expenses={expenses.items}
        targetCurrency={currency}
        cycleStartDay={profile?.cycle_start_day ?? 1}
        cycleEndDay={profile?.cycle_end_day ?? null}
        resolver={rateResolver}
      />

      {/* ── CATEGORY MIX — exact main-page interactive breakdown (read-only) ── */}
      <CategoryBreakdown
        expenses={itemsInRange}
        targetCurrency={currency}
        resolver={rateResolver}
        hideEdit
      />

      {/* ── TRANSACTION REGISTER ── */}
      <View style={{ borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <RNText style={{ fontSize: 14, fontWeight: '800', color: theme.colors.text }}>
            {t('pl_cycle_transactions') || 'Transactions'}
          </RNText>
          <RNText style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted }}>
            Page {safePage} / {totalPages} · {sortedDesc.length}
          </RNText>
        </View>
        {sortedDesc.length === 0 ? (
          <EmptyState icon={Scale} title={t('pl_cycle_report_title') || 'Cycle report'} message={t('pl_cycle_empty_tx') || 'No transactions in this cycle'} />
        ) : (
          <View style={{ gap: 14 }}>
            {dayGroups.map((g) => {
              const dayNet = g.rows.reduce(
                (s, r) =>
                  s +
                  ((r.type || 'expense') === 'income' ? 1 : -1) *
                    (rateResolver ? rateResolver.convert(Number(r.amount) || 0, r.currency || 'NPR', currency, r.date) : 0),
                0,
              );
              return (
                <View key={g.date} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: 6 }}>
                    <RNText style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: theme.colors.textMuted }}>
                      {format(parseISODate(g.date), 'EEE, d MMM')}
                    </RNText>
                    <RNText style={{ fontSize: 11.5, fontWeight: '800', color: dayNet >= 0 ? theme.colors.income : theme.colors.danger }}>
                      {dayNet >= 0 ? '+' : '−'}{money(Math.abs(dayNet))}
                    </RNText>
                  </View>
                  {g.rows.map((r) => {
                    const isIn = (r.type || 'expense') === 'income';
                    const amount = rateResolver
                      ? rateResolver.convert(Number(r.amount) || 0, r.currency || 'NPR', currency, r.date)
                      : 0;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setSelectedTx(r)}
                        accessibilityRole="button"
                        accessibilityLabel={r.description || r.categories?.name || 'Transaction'}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <View
                          style={{
                            width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: theme.colors.surfaceElevated,
                          }}
                        >
                          <CategoryIcon name={r.categories?.icon} size={17} color={r.categories?.color || theme.colors.textMuted} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <RNText style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }} numberOfLines={1}>
                            {r.description || r.categories?.name || 'Other'}
                          </RNText>
                          <RNText style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textMuted }} numberOfLines={1}>
                            {r.categories?.name ?? 'Other'}{r.payment_method ? ` · ${r.payment_method}` : ''}
                          </RNText>
                        </View>
                        <RNText style={{ fontSize: 13, fontWeight: '800', color: isIn ? theme.colors.income : theme.colors.danger }}>
                          {isIn ? '+' : '−'}{money(amount)}
                        </RNText>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
            {totalPages > 1 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 }}>
                <Pressable
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  accessibilityLabel="Previous page"
                  style={({ pressed }) => ({
                    width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated,
                    opacity: safePage === 1 ? 0.35 : pressed ? 0.7 : 1,
                  })}
                >
                  <ChevronLeft size={16} color={theme.colors.text} />
                </Pressable>
                <RNText style={{ fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted }}>
                  Page {safePage} / {totalPages}
                </RNText>
                <Pressable
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  accessibilityLabel="Next page"
                  style={({ pressed }) => ({
                    width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated,
                    opacity: safePage >= totalPages ? 0.35 : pressed ? 0.7 : 1,
                  })}
                >
                  <ChevronRight size={16} color={theme.colors.text} />
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
      {/* ── EXPENSE DETAIL — read-only, no edit action ── */}
      <ExpenseDetailModal
        expense={selectedTx}
        visible={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        hideEdit
      />
    </ScrollView>
  );
}
