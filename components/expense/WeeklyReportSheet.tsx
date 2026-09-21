import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowRight, CalendarRange, Download, X } from 'lucide-react-native';

/** Compact axis label: 12400 → "12.4k". */
function shortMoney(v: number): string {
  if (v >= 1000) return `${Number((v / 1000).toFixed(1))}k`;
  return `${Math.round(v)}`;
}

/** Medal tints for leaderboard ranks 1–3 (theme-aware). */
function medalPalette(isDark: boolean) {
  return [
    { bg: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7', fg: isDark ? '#FBBF24' : '#B45309' },
    { bg: isDark ? 'rgba(148, 163, 184, 0.22)' : '#E2E8F0', fg: isDark ? '#CBD5E1' : '#475569' },
    { bg: isDark ? 'rgba(217, 119, 6, 0.20)' : '#FFEDD5', fg: isDark ? '#FDBA74' : '#9A3412' },
  ];
}
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { BudgetPaceRow } from '@/components/expense/BudgetPaceRow';
import { showToast, ToastHost } from '@/components/ui/Toast';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { exportPdf } from '@/services/export';
import type { RateResolver } from '@/services/exchange';
import type { Expense } from '@/types';
import {
  filterExpensesByPeriod,
  formatMoney,
  getCycleMeta,
  groupByCategory,
  sumExpenses,
} from '@/utils/format';

interface WeeklyReportSheetProps {
  visible: boolean;
  onClose: () => void;
  expenses: Expense[];
  monthTotal: number;
  monthlyBudget: number;
  preferredCurrency: string;
  cycleStartDay: number;
  cycleEndDay: number | null;
  rateResolver: RateResolver | null;
}

/**
 * Full week report bottom sheet (test feature): day-wise spend bars,
 * all categories ranked, biggest transaction, budget pace — plus
 * Export PDF (reuses services/export) and View transactions.
 */
export function WeeklyReportSheet({
  visible,
  onClose,
  expenses,
  monthTotal,
  monthlyBudget,
  preferredCurrency,
  cycleStartDay,
  cycleEndDay,
  rateResolver,
}: WeeklyReportSheetProps) {
  const theme = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { profile } = useAuth();
  const [exporting, setExporting] = useState(false);
  const { isDark } = theme;

  const accent = isDark ? '#A5B4FC' : '#4F46E5';
  const accentSoft = isDark ? 'rgba(165, 180, 252, 0.16)' : 'rgba(79, 70, 229, 0.12)';
  const MEDALS = useMemo(() => medalPalette(isDark), [isDark]);

  const data = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dow === 0 ? 6 : dow - 1));
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';
    const todayIso = iso(new Date());
    const days: { key: string; dayNum: string; weekday: string; isToday: boolean; total: number }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const key = iso(d);
      const dayItems = expenses.filter((e) => e.type !== 'income' && e.date === key);
      let weekday = '';
      try {
        weekday = d.toLocaleDateString(locale, { weekday: 'short' });
      } catch {
        weekday = '';
      }
      days.push({
        key,
        dayNum: String(d.getDate()),
        weekday,
        isToday: key === todayIso,
        total: sumExpenses(dayItems, preferredCurrency, rateResolver, 'expense'),
      });
    }
    const mondayStr = iso(monday);
    const sundayStr = iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));

    const expenseOnly = expenses.filter((e) => e.type !== 'income');
    const weekItems = filterExpensesByPeriod(expenseOnly, 'week');
    const weekSpent = sumExpenses(weekItems, preferredCurrency, rateResolver, 'expense');
    const weekIncome = sumExpenses(
      expenses.filter((e) => e.type === 'income' && e.date >= mondayStr && e.date <= sundayStr),
      preferredCurrency,
      rateResolver,
      'income',
    );
    const groups = groupByCategory(weekItems, preferredCurrency, rateResolver, 'expense');
    const biggest = [...weekItems].sort((a, b) => Number(b.amount) - Number(a.amount))[0] ?? null;
    const weekAll = expenses.filter((e) => e.date >= mondayStr && e.date <= sundayStr);

    let pace: { expected: number; onTrack: boolean } | null = null;
    if (monthlyBudget > 0) {
      const meta = getCycleMeta(cycleStartDay, cycleEndDay);
      const elapsed = Math.max(meta.daysElapsed, 1);
      const expected = (monthlyBudget / meta.daysInCycle) * elapsed;
      pace = { expected, onTrack: monthTotal <= expected };
    }

    let rangeLabel = `${mondayStr} – ${sundayStr}`;
    try {
      const fmt = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
      rangeLabel = `${fmt(monday)} – ${fmt(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6))}`;
    } catch {
      // Fall back to ISO range.
    }
    return { days, weekSpent, weekIncome, saved: weekIncome - weekSpent, groups, biggest, weekAll, pace, rangeLabel };
  }, [expenses, preferredCurrency, rateResolver, monthlyBudget, monthTotal, cycleStartDay, cycleEndDay, language]);

  const maxDay = Math.max(1, ...data.days.map((d) => d.total));

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // Pass month-to-date so the PDF judges month actual vs full monthly
      // budget — identical to the Home hero card — instead of the week slice.
      await exportPdf(data.weekAll, profile ?? null, preferredCurrency, null, monthTotal);
      showToast({ message: t('report_done'), type: 'success' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : t('common_error'), type: 'error' });
    } finally {
      setExporting(false);
    }
  }, [exporting, data.weekAll, profile, preferredCurrency, t]);

  const handleTransactions = useCallback(() => {
    onClose();
    setTimeout(() => {
      router.push('/history');
    }, 240);
  }, [onClose, router]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('digest_later')} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          {/* Decorative art header */}
          <View pointerEvents="none" style={styles.art}>
            <LinearGradient colors={[accentSoft, 'transparent']} style={styles.wash} />
            <View style={[styles.blob, styles.blobLeft, { backgroundColor: accentSoft }]} />
            <View style={[styles.blob, styles.blobRight, { backgroundColor: accentSoft }]} />
          </View>

          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: accentSoft }]}>
              <CalendarRange size={17} color={accent} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h3" style={{ fontWeight: '800' }}>
                {t('report_title')}
              </Text>
              <Text variant="caption" muted style={{ fontWeight: '600' }}>
                {data.rangeLabel} • {formatMoney(data.weekSpent, preferredCurrency)} {t('digest_spent')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: theme.colors.surfaceElevated }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('digest_later')}
            >
              <X size={16} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {/* Summary tiles */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { label: t('digest_spent'), value: formatMoney(data.weekSpent, preferredCurrency), color: theme.colors.text },
                { label: t('report_income'), value: formatMoney(data.weekIncome, preferredCurrency), color: theme.colors.income },
                {
                  label: data.saved >= 0 ? t('digest_saved') : t('digest_over'),
                  value: formatMoney(Math.abs(data.saved), preferredCurrency),
                  color: data.saved >= 0 ? theme.colors.income : theme.colors.danger,
                },
              ].map((s) => (
                <View
                  key={s.label}
                  style={[
                    styles.tile,
                    { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                  ]}
                >
                  <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
                    {s.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{ fontSize: 13, fontWeight: '800', color: s.color, fontVariant: ['tabular-nums'] }}
                  >
                    {s.value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Day-wise bars */}
            <View style={{ gap: 8 }}>
              <Text variant="caption" muted style={styles.sectionTitle}>
                {t('report_daily')}
              </Text>
              <View
                style={[
                  styles.chartCard,
                  { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                ]}
              >
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {data.days.map((d) => {
                      const isMax = d.total === maxDay && d.total > 0;
                      const hasValue = d.total > 0;
                      // Heat tint: 0 spend → plain surface, heavier days → deeper primary.
                      const heat = hasValue ? d.total / maxDay : 0;
                      const gradientPeak = isMax && !d.isToday;
                      const solidInk = d.isToday || gradientPeak || heat > 0.6;
                      const ink = solidInk ? '#FFFFFF' : theme.colors.text;
                      const cellStyle = [
                        styles.dayCell,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: d.isToday
                            ? theme.colors.primary
                            : hasValue
                              ? theme.isDark
                                ? `rgba(129, 140, 248, ${0.1 + 0.5 * heat})`
                                : `rgba(15, 92, 77, ${0.08 + 0.5 * heat})`
                              : theme.colors.surface,
                        },
                      ];
                      const cellContent = (
                        <>
                          <Text
                            style={[
                              styles.dayWd,
                              { color: solidInk ? '#FFFFFF' : theme.colors.textMuted },
                            ]}
                            numberOfLines={1}
                          >
                            {d.weekday}
                          </Text>
                          <Text style={[styles.dayNum, { color: ink }]}>
                            {d.dayNum}
                          </Text>
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.6}
                            style={[
                              styles.dayAmt,
                              { color: solidInk ? '#FFFFFF' : hasValue ? theme.colors.text : theme.colors.faint },
                            ]}
                          >
                            {hasValue ? shortMoney(d.total) : '–'}
                          </Text>
                        </>
                      );
                      return gradientPeak ? (
                        <LinearGradient
                          key={d.key}
                          colors={[theme.colors.primary, theme.colors.primaryStrong]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.dayCell, { borderWidth: 0 }]}
                        >
                          {cellContent}
                        </LinearGradient>
                      ) : (
                        <View key={d.key} style={cellStyle}>
                          {cellContent}
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.legend}>
                    <Text style={[styles.legendText, { color: theme.colors.faint }]}>
                      {t('report_less')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      {[0.08, 0.2, 0.32, 0.44, 0.58].map((o) => (
                        <View
                          key={o}
                          style={[
                            styles.legendSwatch,
                            {
                              backgroundColor: theme.isDark
                                ? `rgba(129, 140, 248, ${o})`
                                : `rgba(15, 92, 77, ${o})`,
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[styles.legendText, { color: theme.colors.faint }]}>
                      {t('report_more')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* All categories */}
            {data.groups.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text variant="caption" muted style={styles.sectionTitle}>
                  {t('report_categories')}
                </Text>
                {data.groups.map((g, i) => {
                  const pct = data.weekSpent > 0 ? Math.round((g.total / data.weekSpent) * 100) : 0;
                  const medal = MEDALS[i] ?? MEDALS[2];
                  return (
                    <View
                      key={g.label}
                      style={[
                        styles.catCard,
                        { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                      ]}
                    >
                      <View style={[styles.medal, { backgroundColor: medal.bg }]}>
                        <Text style={[styles.medalText, { color: medal.fg }]}>{i + 1}</Text>
                      </View>
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 11,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.colors.surface,
                        }}
                      >
                        <CategoryIcon name={g.icon} size={16} color={g.color} />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                          <Text variant="body" style={{ flex: 1, fontWeight: '700' }} numberOfLines={1}>
                            {g.label}
                          </Text>
                          <Text variant="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                            {formatMoney(g.total, preferredCurrency)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={styles.miniBar}>
                            <View style={[styles.miniFill, { width: `${pct}%`, backgroundColor: g.color }]} />
                          </View>
                          <Text style={[styles.pctPill, { color: g.color }]}>
                            {pct}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Biggest expense */}
            {data.biggest && (
              <View style={{ gap: 8 }}>
                <Text variant="caption" muted style={styles.sectionTitle}>
                  {t('report_biggest')}
                </Text>
                <View
                  style={[
                    styles.biggestCard,
                    {
                      backgroundColor: theme.colors.surfaceElevated,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.surface,
                    }}
                  >
                    <CategoryIcon
                      name={data.biggest.categories?.icon ?? 'tag'}
                      size={18}
                      color={data.biggest.categories?.color ?? theme.colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" style={{ fontWeight: '800' }} numberOfLines={1}>
                      {data.biggest.description || data.biggest.categories?.name || '—'}
                    </Text>
                    <Text variant="caption" muted>
                      {data.biggest.date}
                    </Text>
                  </View>
                  <Text variant="body" style={{ fontWeight: '800', color: theme.colors.danger, fontVariant: ['tabular-nums'] }}>
                    {formatMoney(Number(data.biggest.amount) || 0, data.biggest.currency || preferredCurrency)}
                  </Text>
                </View>
              </View>
            )}

            {/* Budget pace */}
            {data.pace && (
              <BudgetPaceRow
                actual={monthTotal}
                expected={data.pace.expected}
                currency={preferredCurrency}
                onTrack={data.pace.onTrack}
                budgetCurrency={profile?.budget_currency ?? null}
              />
            )}

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 36 }}>
              <Pressable
                onPress={handleExport}
                disabled={exporting}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    backgroundColor: theme.colors.surfaceElevated,
                    borderColor: theme.colors.border,
                    opacity: pressed || exporting ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Download size={16} color={theme.colors.primary} />
                <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.primary }}>
                  {t('report_export')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleTransactions}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.primaryStrong]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={{ fontWeight: '800', fontSize: 14, color: '#FFFFFF' }}>
                    {t('report_view_txns')}
                  </Text>
                  <ArrowRight size={15} color="#FFFFFF" strokeWidth={2.5} />
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
      <ToastHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 20,
  },
  art: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  blob: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  blobLeft: {
    top: -52,
    left: -52,
  },
  blobRight: {
    top: -38,
    right: -60,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 11,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  chartCard: {
    borderWidth: 1,
    borderRadius: 13,
    padding: 9,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
    borderWidth: 1.5,
    borderRadius: 13,
    paddingVertical: 7,
    paddingHorizontal: 2,
  },
  dayWd: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  dayNum: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  dayAmt: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  legendText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  miniBar: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(127, 140, 160, 0.25)',
    overflow: 'hidden',
  },
  miniFill: {
    height: '100%',
    borderRadius: 3,
  },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    padding: 8,
  },
  medal: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pctPill: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  biggestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: 1.5,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.88,
  },
});

export default WeeklyReportSheet;
