import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ArrowRight, CalendarRange, Sparkles, Star, X } from 'lucide-react-native';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Text } from '@/components/ui/Text';
import { BudgetPaceRow } from '@/components/expense/BudgetPaceRow';
import { WeeklyReportSheet } from '@/components/expense/WeeklyReportSheet';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import type { RateResolver } from '@/services/exchange';
import type { Expense } from '@/types';
import {
  filterExpensesByPeriod,
  formatMoney,
  getCycleMeta,
  groupByCategory,
  sumExpenses,
} from '@/utils/format';

const STORAGE_KEY = '@spendflow_weekly_digest';

/** Set to true only for local popup testing (fires every refresh, any day). */
const TEST_SHOW_EVERY_REFRESH = false;

interface WeeklyDigestProps {
  expenses: Expense[];
  monthTotal: number;
  monthlyBudget: number;
  preferredCurrency: string;
  cycleStartDay: number;
  cycleEndDay: number | null;
  rateResolver: RateResolver | null;
  onClose?: () => void;
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

/** Medal tints for leaderboard ranks 1–3 (theme-aware). */
function medalPalette(isDark: boolean) {
  return [
    { bg: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7', fg: isDark ? '#FBBF24' : '#B45309' },
    { bg: isDark ? 'rgba(148, 163, 184, 0.22)' : '#E2E8F0', fg: isDark ? '#CBD5E1' : '#475569' },
    { bg: isDark ? 'rgba(217, 119, 6, 0.20)' : '#FFEDD5', fg: isDark ? '#FDBA74' : '#9A3412' },
  ];
}

/**
 * Weekly digest popup (test feature): auto-generated every Sunday as a
 * premium modal — this week's spent vs saved, top 3 categories, budget vs
 * actual — with a one-tap jump to the full Analytics report. Shown at most
 * once per Sunday per user; renders nothing on other days.
 *
 * No-scroll layout: a compact density kicks in on short screens
 * (height < 700) so the whole card fits without scrolling.
 */
export function WeeklyDigest({
  expenses,
  monthTotal,
  monthlyBudget,
  preferredCurrency,
  cycleStartDay,
  cycleEndDay,
  rateResolver,
  onClose,
}: WeeklyDigestProps) {
  const theme = useTheme();
  const { t, language } = useLanguage();
  const { profile, session } = useAuth();
  const userId = profile?.id ?? session?.user?.id ?? '';
  const storageKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;

  const [visible, setVisible] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Re-entrancy guard: data/profiler refreshes re-run this effect — never
  // re-pop while already visible or after dismissing within one mount.
  const activeRef = useRef(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const shownRef = useRef(false);

  // TESTING: with the flag on, the Sunday gate is bypassed so the popup
  // fires any day. Flag off → real Sunday-only behavior.
  const isSunday = useMemo(
    () => (TEST_SHOW_EVERY_REFRESH ? true : new Date().getDay() === 0),
    [],
  );
  const { height: winH } = useWindowDimensions();
  const compact = winH < 700;
  const { isDark } = theme;

  const accent = isDark ? '#A5B4FC' : '#4F46E5';
  const accentSoft = isDark ? 'rgba(165, 180, 252, 0.16)' : 'rgba(79, 70, 229, 0.12)';
  const halo: [string, string] = isDark ? ['#818CF8', '#4C1D95'] : ['#A5B4FC', '#6366F1'];
  const savedColor = isDark ? '#34D399' : '#047857';
  const MEDALS = useMemo(() => medalPalette(isDark), [isDark]);

  const haloSize = compact ? 62 : 80;
  const haloInner = haloSize - 12;

  const dateLabel = useMemo(() => {
    const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';
    try {
      return new Date().toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }, [language]);

  const data = useMemo(() => {
    if (!isSunday) return null;
    // Current Mon–Sun bounds (mirrors filterExpensesByPeriod 'week').
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dow === 0 ? 6 : dow - 1));
    const pad = (n: number) => String(n).padStart(2, '0');
    const mondayStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const sundayStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;

    const expenseOnly = expenses.filter((e) => e.type !== 'income');
    const weekItems = filterExpensesByPeriod(expenseOnly, 'week');
    const weekSpent = sumExpenses(weekItems, preferredCurrency, rateResolver, 'expense');
    const weekIncome = sumExpenses(
      expenses.filter((e) => e.type === 'income' && e.date >= mondayStr && e.date <= sundayStr),
      preferredCurrency,
      rateResolver,
      'income',
    );
    if (weekSpent <= 0 && weekIncome <= 0) return null;
    const saved = weekIncome - weekSpent;
    const groups = groupByCategory(weekItems, preferredCurrency, rateResolver, 'expense').slice(0, 3);

    let pace: { expected: number; onTrack: boolean } | null = null;
    if (monthlyBudget > 0) {
      const meta = getCycleMeta(cycleStartDay, cycleEndDay);
      const elapsed = Math.max(meta.daysElapsed, 1);
      const expected = (monthlyBudget / meta.daysInCycle) * elapsed;
      pace = { expected, onTrack: monthTotal <= expected };
    }
    return { weekSpent, saved, groups, pace };
  }, [isSunday, expenses, preferredCurrency, rateResolver, monthlyBudget, monthTotal, cycleStartDay, cycleEndDay]);

  const playEnter = useCallback(() => {
    opacity.setValue(0);
    scale.setValue(0.9);
    translateY.setValue(24);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 360, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [opacity, scale, translateY]);

  const persistShown = useCallback(async () => {
    if (TEST_SHOW_EVERY_REFRESH) return;
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify({ shownSunday: todayKey() }));
    } catch {
      // Non-critical UI state — safe to ignore.
    }
  }, [storageKey]);

  const close = useCallback(
    (persist: boolean) => {
      if (persist) void persistShown();
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.93, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        setVisible(false);
        activeRef.current = false;
        onClose?.();
      });
    },
    [onClose, opacity, persistShown, scale],
  );

  useEffect(() => {
    if (!isSunday || !data || activeRef.current) return;
    activeRef.current = true;
    // TESTING ONLY — bypasses the once-per-Sunday lock so the popup shows
    // on every refresh. The Fast Refresh state guard is bypassed too.
    if (!TEST_SHOW_EVERY_REFRESH) {
      if (shownRef.current) return;
      shownRef.current = true;
    }
    let cancelled = false;
    (async () => {
      if (!TEST_SHOW_EVERY_REFRESH) {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const stored = JSON.parse(raw) as { shownSunday?: string };
          if (stored.shownSunday === todayKey()) {
            activeRef.current = false;
            return;
          }
        }
      } catch {
        // Corrupt storage → treat as never shown.
      }
      }
      if (cancelled) return;
      setVisible(true);
      playEnter();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [isSunday, data, playEnter, storageKey]);

  const handleReport = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    close(true);
    // Open the full report sheet after the digest closes (avoids stacked modals).
    setTimeout(() => {
      setReportOpen(true);
    }, 260);
  }, [close]);

  if (!isSunday || !data) return null;
  const { weekSpent, saved, groups, pace } = data;
  const savedPositive = saved >= 0;

  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => close(true)}
    >
      <View style={[styles.overlay, compact && styles.overlayCompact]}>
        <Pressable style={styles.backdrop} onPress={() => close(true)} accessibilityLabel={t('digest_later')} />
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              opacity,
              transform: [{ translateY }, { scale }],
            },
          ]}
        >
          {/* Decorative art header */}
          <View pointerEvents="none" style={styles.art}>
            <LinearGradient colors={[accentSoft, 'transparent']} style={styles.wash} />
            <View style={[styles.blob, styles.blobLeft, { backgroundColor: accentSoft }]} />
            <View style={[styles.blob, styles.blobRight, { backgroundColor: accentSoft }]} />
          </View>

          <View style={[styles.content, compact && styles.contentCompact]}>
            <View style={styles.topRow}>
              <View style={[styles.datePill, { backgroundColor: accentSoft }]}>
                <CalendarRange size={12} color={accent} strokeWidth={2.5} />
                <Text style={[styles.datePillText, { color: accent }]}>{dateLabel}</Text>
              </View>
              <Pressable
                onPress={() => close(true)}
                style={[styles.closeButton, { backgroundColor: theme.colors.surfaceElevated }]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('digest_later')}
              >
                <X size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <View style={[styles.haloWrap, { width: haloSize + 62 }]}>
              <LinearGradient colors={halo} style={[styles.halo, { width: haloSize, height: haloSize, borderRadius: haloSize / 2 }]}>
                <View style={[styles.haloInner, { backgroundColor: theme.colors.surface, width: haloInner, height: haloInner, borderRadius: haloInner / 2 }]}>
                  <CalendarRange size={compact ? 26 : 32} color={accent} strokeWidth={2.2} />
                </View>
              </LinearGradient>
              <View
                style={[
                  styles.sparkleBadge,
                  styles.sparkleLeft,
                  { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                ]}
              >
                <Sparkles size={12} color={accent} />
              </View>
              <View
                style={[
                  styles.sparkleBadge,
                  styles.sparkleRight,
                  { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                ]}
              >
                <Star size={11} color={accent} />
              </View>
            </View>

            <Text style={[styles.eyebrow, { color: accent }]}>{t('digest_title')}</Text>
            <Text
              style={[styles.headline, compact && styles.headlineCompact, { color: theme.colors.text }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t('digest_this_week')}: {formatMoney(weekSpent, preferredCurrency)} {t('digest_spent')}
            </Text>
            <View style={[styles.savedPill, { backgroundColor: savedPositive ? (isDark ? 'rgba(52, 211, 153, 0.16)' : '#DCE9E3') : (isDark ? 'rgba(239, 68, 68, 0.16)' : '#F1DCD3') }]}>
              <Text
                style={{
                  fontSize: compact ? 14 : 15,
                  fontWeight: '800',
                  color: savedPositive ? savedColor : theme.colors.danger,
                  fontVariant: ['tabular-nums'],
                }}
              >
                → {formatMoney(Math.abs(saved), preferredCurrency)} {savedPositive ? t('digest_saved') : t('digest_over')}
              </Text>
            </View>
            <LinearGradient colors={halo} style={styles.rule} />

            {groups.length > 0 && (
              <View style={styles.section}>
                <Text variant="caption" muted style={styles.sectionTitle}>
                  {t('digest_top3')}
                </Text>
                {groups.map((g, i) => {
                  const pct = weekSpent > 0 ? Math.round((g.total / weekSpent) * 100) : 0;
                  const medal = MEDALS[i] ?? MEDALS[2];
                  return (
                    <View key={g.label} style={[styles.catCard, compact && styles.catCardCompact, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                      <View style={[styles.medal, { backgroundColor: medal.bg }]}>
                        <Text style={[styles.medalText, { color: medal.fg }]}>{i + 1}</Text>
                      </View>
                      <View style={[styles.catIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <CategoryIcon name={g.icon} size={17} color={g.color} />
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

            {pace && (
              <BudgetPaceRow
                actual={monthTotal}
                expected={pace.expected}
                currency={preferredCurrency}
                onTrack={pace.onTrack}
                budgetCurrency={profile?.budget_currency ?? null}
              />
            )}

            <Pressable
              onPress={handleReport}
              style={({ pressed }) => [styles.primaryButton, compact && styles.primaryButtonCompact, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.primaryStrong]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.primaryGradient, compact && styles.primaryGradientCompact]}
              >
                <Text style={[styles.primaryButtonText, compact && styles.primaryButtonTextCompact]}>{t('digest_view_report')}</Text>
                <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.5} />
              </LinearGradient>
            </Pressable>

            <Pressable onPress={() => close(true)} style={styles.laterButton} hitSlop={6} accessibilityRole="button">
              <Text style={[styles.laterButtonText, { color: theme.colors.textMuted }]}>
                {t('digest_later')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
    <WeeklyReportSheet
      visible={reportOpen}
      onClose={() => setReportOpen(false)}
      expenses={expenses}
      monthTotal={monthTotal}
      monthlyBudget={monthlyBudget}
      preferredCurrency={preferredCurrency}
      cycleStartDay={cycleStartDay}
      cycleEndDay={cycleEndDay}
      rateResolver={rateResolver}
    />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayCompact: {
    padding: 16,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.32,
    shadowRadius: 40,
    elevation: 20,
  },
  art: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 170,
  },
  blob: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  blobLeft: {
    top: -46,
    left: -46,
  },
  blobRight: {
    top: -32,
    right: -52,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 11,
    alignItems: 'center',
  },
  contentCompact: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 8,
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  haloInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleBadge: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleLeft: {
    left: 2,
    top: 6,
  },
  sparkleRight: {
    right: 2,
    bottom: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    includeFontPadding: false,
  },
  headlineCompact: {
    fontSize: 17,
    lineHeight: 23,
  },
  savedPill: {
    borderRadius: 9999,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  rule: {
    width: 48,
    height: 5,
    borderRadius: 3,
  },
  section: {
    width: '100%',
    gap: 7,
  },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 15,
    padding: 9,
  },
  catCardCompact: {
    padding: 7,
    gap: 8,
    borderRadius: 13,
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
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  primaryButton: {
    width: '100%',
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonCompact: {
    borderRadius: 13,
  },
  primaryGradient: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryGradientCompact: {
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.88,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
  primaryButtonTextCompact: {
    fontSize: 15,
  },
  laterButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  laterButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export default WeeklyDigest;
