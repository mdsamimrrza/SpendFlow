import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CalendarClock,
  Check,
  CheckCircle2,
  Edit2,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { CalendarModal } from '@/components/ui/CalendarModal';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/ui/PressableScale';
import { Select } from '@/components/ui/Select';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { showToast } from '@/components/ui/Toast';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PAYMENT_METHODS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { notifyExpensesChanged } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import {
  createRecurringRule,
  deleteRecurringRule,
  listRecurringRules,
  listRuleOccurrences,
  markOccurrencePaid,
  nextDueDate as advanceDueDate,
  RuleOccurrence,
  skipCurrentOccurrence,
  subscribeRecurringRulesChanged,
  undoLatestOccurrencePayment,
  updateRecurringRule,
} from '@/services/recurring';
import { notifyRecurringBillDue } from '@/services/notifications';
import { Category, PaymentMethod, RecurringFrequency, RecurringMode, RecurringRule } from '@/types';
import { formatMoney, isoDate } from '@/utils/format';

export default function RecurringScreen() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const theme = useTheme();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Booked installments for every rule — powers the paid state, DUE badges,
  // and the timeline strips (one query, newest slot first).
  const [occurrences, setOccurrences] = useState<RuleOccurrence[]>([]);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);

  const frequencies: { label: string; value: RecurringFrequency }[] = [
    { label: t('recurring_freq_daily') || 'Daily', value: 'daily' },
    { label: t('recurring_freq_weekly') || 'Weekly', value: 'weekly' },
    { label: t('recurring_freq_monthly') || 'Monthly', value: 'monthly' },
    { label: t('recurring_freq_every_n_days') || 'Every N days', value: 'custom' },
  ];

  // Modal Form State
  const [selectedRule, setSelectedRule] = useState<RecurringRule | null>(null);
  // Designed delete confirmation (the plain system Alert looked foreign here)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [intervalDays, setIntervalDays] = useState('28');
  const [ruleMode, setRuleMode] = useState<RecurringMode>('pay_on_due');
  const [nextDueDate, setNextDueDate] = useState(isoDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  async function load(): Promise<RecurringRule[]> {
    if (!profile?.id) return [];
    // Cache-paint first (instant), then swap in the authoritative server list.
    const [nextRules, nextCategories] = await Promise.all([
      listRecurringRules(profile.id, (cached) => setRules(cached)),
      listCategories(profile.id, (cached) => setCategories(cached)),
    ]);
    setRules(nextRules);
    setCategories(nextCategories);
    setCategoryId((current) => current || nextCategories[0]?.id || '');
    // Booked installments drive paid states / DUE badges / timelines.
    try {
      setOccurrences(await listRuleOccurrences(profile.id, nextRules.map((r) => r.id)));
    } catch {
      // Paid-state decoration is optional; the rules list above is authoritative.
    }
    return nextRules;
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load().catch((error) => Alert.alert(t('common_error'), error.message));
  }, [profile?.id]);

  // A plan restored from the Bin (or purged there) must repaint this tab even
  // though it never unmounts — same signal pattern as the expenses listeners.
  useEffect(
    () =>
      subscribeRecurringRulesChanged(() => {
        load().catch(() => undefined);
      }),
    [profile?.id],
  );

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ label: `${category.icon} ${category.name}`, value: category.id })),
    [categories],
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  // Total monthly commitment for active rules
  const monthlyTotal = useMemo(() => {
    return rules
      .filter((r) => r.is_active)
      .reduce((acc, rule) => {
        const amt = Number(rule.amount) || 0;
        if (rule.frequency === 'daily') return acc + amt * 30;
        if (rule.frequency === 'weekly') return acc + amt * 4.33;
        if (rule.frequency === 'custom') return acc + (amt * 30) / Math.max(1, rule.interval_days ?? 30);
        return acc + amt;
      }, 0);
  }, [rules]);

  function openCreateModal() {
    setSelectedRule(null);
    setEditingRuleId(null);
    setAmount('');
    setDescription('');
    setFrequency('monthly');
    setIntervalDays('28');
    setRuleMode('pay_on_due');
    setNextDueDate(isoDate());
    setPaymentMethod('Cash');
    setCategoryId(categories[0]?.id || '');
    setShowFormModal(true);
  }

  function openEditModal(rule: RecurringRule) {
    setSelectedRule(null);
    setEditingRuleId(rule.id);
    setAmount(String(rule.amount));
    setDescription(rule.description || '');
    setCategoryId(rule.category_id);
    setFrequency(rule.frequency);
    setIntervalDays(String(rule.interval_days ?? 28));
    setRuleMode(rule.mode ?? 'pay_on_due');
    setNextDueDate(rule.next_due_date);
    setPaymentMethod((rule.payment_method as PaymentMethod) || 'Cash');
    setShowFormModal(true);
  }

  function closeFormModal() {
    setShowFormModal(false);
    setEditingRuleId(null);
    setAmount('');
    setDescription('');
  }

  function handleDeleteRule(ruleId: string) {
    setDeleteTargetId(ruleId);
  }

  async function confirmDeleteRule() {
    if (!deleteTargetId) return;
    setDeletingRule(true);
    try {
      await deleteRecurringRule(deleteTargetId, profile?.id);
      setDeleteTargetId(null);
      setSelectedRule(null);
      closeFormModal();
      await load();
      showToast({ type: 'success', message: t('bin_moved_toast') });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to delete subscription');
    } finally {
      setDeletingRule(false);
    }
  }

  async function handleSaveRule() {
    if (!profile?.id || !amount || Number(amount) <= 0 || !categoryId) {
      Alert.alert(t('common_error'), t('expense_amount_placeholder') || 'Please enter a valid amount');
      return;
    }
    const interval = Number(intervalDays);
    if (frequency === 'custom' && (!Number.isInteger(interval) || interval < 1 || interval > 365)) {
      Alert.alert(t('common_error'), t('recurring_interval_invalid') || 'Custom cycle needs a repeat length of 1–365 days.');
      return;
    }

    setSaving(true);
    try {
      if (editingRuleId) {
        // UPDATE EXISTING RECURRING RULE
        // If the cycle itself changed, re-derive the schedule from the CURRENT
        // due slot with the new cadence — the chain stays anchored to the plan,
        // never to "today".
        const existing = rules.find((r) => r.id === editingRuleId);
        const cycleChanged =
          !!existing &&
          (existing.frequency !== frequency ||
            (existing.interval_days ?? null) !== (frequency === 'custom' ? interval : null));
        const resolvedNextDue =
          cycleChanged && existing
            ? advanceDueDate(existing.next_due_date, frequency, frequency === 'custom' ? interval : null)
            : nextDueDate;
        await updateRecurringRule(editingRuleId, {
          category_id: categoryId,
          amount: Number(amount),
          currency: preferredCurrency,
          description: description.trim() || null,
          frequency,
          interval_days: frequency === 'custom' ? interval : null,
          mode: ruleMode,
          next_due_date: resolvedNextDue,
          payment_method: paymentMethod,
        }, profile.id);
      } else {
        // CREATE NEW RECURRING RULE
        await createRecurringRule(profile.id, {
          category_id: categoryId,
          amount: Number(amount),
          currency: preferredCurrency,
          description: description.trim() || undefined,
          frequency,
          interval_days: frequency === 'custom' ? interval : null,
          mode: ruleMode,
          next_due_date: nextDueDate,
          payment_method: paymentMethod,
        });

        // Trigger Smart Bill Reminder
        try {
          const catName = categories.find((c) => c.id === categoryId)?.name || 'Recurring Bill';
          // Signature is (description, amount, dueDate, currency) — the slot date
          // was previously missing and the currency landed in the dueDate argument,
          // printing "due on INR" and formatting the amount as NPR.
          void notifyRecurringBillDue(description || catName, Number(amount), nextDueDate, preferredCurrency);
        } catch {
          // Notification check
        }
      }

      closeFormModal();
      await load();
    } catch (error) {
      Alert.alert(t('common_error'), error instanceof Error ? error.message : t('common_error'));
    } finally {
      setSaving(false);
    }
  }

  // ── Payment actions (Mark Paid / Skip / Undo) ─────────────────────────────
  // All three go through the shared service writes so phone, web and the
  // login-time generator can never double-book a slot (unique slot index).

  async function runRuleAction(ruleId: string, action: 'paid' | 'skip' | 'undo') {
    if (!profile?.id) return;
    setBusyRuleId(ruleId);
    try {
      if (action === 'paid') {
        const { lateDays } = await markOccurrencePaid(profile.id, ruleId);
        notifyExpensesChanged();
        showToast({
          message:
            lateDays > 0
              ? `${t('recurring_marked_paid') || 'Payment recorded'} · ${t('recurring_late_days') || 'late'} ${lateDays}d`
              : t('recurring_marked_paid') || 'Payment recorded',
          type: 'success',
        });
      } else if (action === 'skip') {
        await skipCurrentOccurrence(profile.id, ruleId);
        showToast({ message: t('recurring_cycle_skipped') || 'This cycle was skipped', type: 'info' });
      } else {
        const undone = await undoLatestOccurrencePayment(profile.id, ruleId);
        if (!undone) {
          showToast({ message: t('recurring_undo_not_recent') || 'Only the most recent payment can be undone', type: 'info' });
        } else {
          notifyExpensesChanged();
          showToast({ message: t('recurring_payment_undone') || 'Payment removed — slot is due again', type: 'success' });
        }
      }
      const nextRules = await load();
      // Keep the open detail sheet in sync with the freshly loaded rule.
      setSelectedRule((prev) => (prev ? nextRules.find((r) => r.id === ruleId) ?? null : null));
    } catch (error) {
      Alert.alert(t('common_error'), error instanceof Error ? error.message : t('common_error'));
    } finally {
      setBusyRuleId(null);
    }
  }

  // ── Paid-state derivation ──────────────────────────────────────────────────

  /** Newest booked slot for a rule, if any. */
  function latestOccurrenceFor(rule: RecurringRule): RuleOccurrence | undefined {
    return occurrences.find((o) => o.recurring_rule_id === rule.id);
  }

  /** True when the CURRENT slot is unpaid and already reached/past due. */
  function ruleIsDue(rule: RecurringRule): boolean {
    if (!rule.is_active) return false;
    if (rule.next_due_date > isoDate()) return false;
    const latest = latestOccurrenceFor(rule);
    return !latest || latest.recurring_due_date !== rule.next_due_date;
  }

  function paidLabelFor(rule: RecurringRule): string | null {
    const latest = latestOccurrenceFor(rule);
    if (!latest?.recurring_due_date) return null;
    if (latest.recurring_due_date >= rule.next_due_date) return null; // current slot unpaid
    const late = differenceInCalendarDays(parseISO(latest.date), parseISO(latest.recurring_due_date));
    const paid = format(parseISO(latest.date), 'MMM d');
    return late > 0
      ? `✓ ${t('recurring_paid_short') || 'Paid'} ${paid} · ${t('recurring_late_days') || 'late'} ${late}d`
      : `✓ ${t('recurring_paid_short') || 'Paid'} ${paid} · ${t('recurring_on_time') || 'on time'}`;
  }

  async function toggleRuleActive(rule: RecurringRule) {
    try {
      await updateRecurringRule(rule.id, { is_active: !rule.is_active }, profile?.id);
      await load();
    } catch (error) {
      Alert.alert('Error', 'Failed to update recurring status');
    }
  }

  function applyPreset(presetDesc: string, presetAmt: string, presetFreq: RecurringFrequency) {
    setEditingRuleId(null);
    setDescription(presetDesc);
    setAmount(presetAmt);
    setFrequency(presetFreq);
    setShowFormModal(true);
  }

  // Quick Date Presets
  function setQuickDate(type: 'today' | 'tomorrow' | 'first_next_month' | 'fifteenth') {
    const today = new Date();
    if (type === 'today') {
      setNextDueDate(isoDate());
    } else if (type === 'tomorrow') {
      setNextDueDate(format(addDays(today, 1), 'yyyy-MM-dd'));
    } else if (type === 'first_next_month') {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      setNextDueDate(format(nextMonth, 'yyyy-MM-dd'));
    } else if (type === 'fifteenth') {
      const targetMonth = today.getDate() >= 15 ? today.getMonth() + 1 : today.getMonth();
      const targetYear = targetMonth > 11 ? today.getFullYear() + 1 : today.getFullYear();
      const normalizedMonth = targetMonth % 12;
      const fifteenth = new Date(targetYear, normalizedMonth, 15);
      setNextDueDate(format(fifteenth, 'yyyy-MM-dd'));
    }
  }

  const activeRules = rules.filter((r) => r.is_active);
  const activeCount = activeRules.length;
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'User';

  function formatRecurringSubtitle(rule: RecurringRule) {
    const freqLabel =
      rule.frequency === 'daily' ? 'Daily'
        : rule.frequency === 'weekly' ? 'Weekly'
          : rule.frequency === 'custom' ? `Every ${rule.interval_days ?? 30}d`
            : 'Monthly';
    if (!rule.is_active) {
      return `${freqLabel} · paused`;
    }
    const paid = paidLabelFor(rule);
    try {
      const due = parseISO(rule.next_due_date);
      const dateFormatted = format(due, 'MMM d');
      return paid
        ? `${freqLabel} · ${paid} · next ${dateFormatted}`
        : `${freqLabel} · next ${dateFormatted}`;
    } catch {
      return `${freqLabel} · next ${rule.next_due_date}`;
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 130 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* ── 1. APP BAR HEADER ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <View style={{ gap: 2 }}>
            <Text
              variant="caption"
              muted
              style={{
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 1.1,
                fontSize: 11,
              }}
            >
              {activeCount} {activeCount === 1 ? 'ACTIVE SUBSCRIPTION' : 'ACTIVE SUBSCRIPTIONS'}
            </Text>
            <Text
              variant="h1"
              style={{
                fontWeight: '800',
                fontSize: 32,
                letterSpacing: -0.5,
                color: theme.colors.text,
              }}
            >
              Recurring
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemeToggle />
            <Avatar uri={profile?.avatar_url} name={displayName} size={38} />
          </View>
        </View>

        {/* ── 2. MONTHLY RECURRING HERO CARD ── */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 18,
            borderRadius: 22,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            position: 'relative',
            justifyContent: 'center',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: theme.isDark ? 0.2 : 0.04,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          {/* Privacy Eye Button in Top Right */}
          <View style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
            <PrivacyEyeButton />
          </View>

          {/* Texts tightly stacked */}
          <View style={{ gap: 4, paddingRight: 48 }}>
            <Text
              variant="caption"
              style={{
                color: theme.colors.primary,
                textTransform: 'uppercase',
                letterSpacing: 0.9,
                fontWeight: '800',
                fontSize: 11,
              }}
            >
              MONTHLY RECURRING
            </Text>

            <Text
              variant="h1"
              style={{
                fontSize: 30,
                lineHeight: 36,
                fontWeight: '800',
                color: theme.colors.text,
                fontVariant: ['tabular-nums'],
                letterSpacing: -0.5,
              }}
            >
              {formatMoney(monthlyTotal, preferredCurrency)}
            </Text>

            <Text variant="caption" muted style={{ fontSize: 12.5, fontWeight: '500' }}>
              Across {activeCount} active {activeCount === 1 ? 'subscription' : 'subscriptions'}
            </Text>
          </View>
        </View>

        {/* ── 3. UNIFIED GROUPED SUBSCRIPTIONS CARD ── */}
        {rules.length === 0 ? (
          <Card style={{ gap: theme.spacing.md, padding: theme.spacing.xl, alignItems: 'center', borderRadius: 22 }}>
            <Sparkles size={36} color={theme.colors.primary} />
            <Text variant="h3" style={{ textAlign: 'center' }}>
              {t('recurring_no_rules_title') || 'No recurring bills setup'}
            </Text>
            <Text muted style={{ textAlign: 'center', fontSize: 13, lineHeight: 18 }}>
              {t('recurring_no_rules_message') || 'Automate repeat payments like rent, subscriptions, and utilities so you never miss a due date.'}
            </Text>

            {/* Preset Suggestion Chips */}
            <View style={{ gap: theme.spacing.xs, width: '100%', marginTop: theme.spacing.xs }}>
              <Text variant="caption" muted style={{ textAlign: 'center', fontWeight: '700' }}>
                {t('recurring_quick_add') || 'Quick Add Templates'}:
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <PressableScale
                  onPress={() => applyPreset('🏠 House Rent', '25000', 'monthly')}
                  style={{ backgroundColor: theme.colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>🏠 House Rent</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => applyPreset('📶 Wi-Fi Bill', '1200', 'monthly')}
                  style={{ backgroundColor: theme.colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>📶 Wi-Fi Bill</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => applyPreset('🍿 Netflix Subscription', '800', 'monthly')}
                  style={{ backgroundColor: theme.colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>🍿 Netflix</Text>
                </PressableScale>
              </View>
            </View>
          </Card>
        ) : (
          <View
            style={{
              borderRadius: 22,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: theme.isDark ? 0.2 : 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            {rules.map((rule, idx) => {
              const isLast = idx === rules.length - 1;
              const subtitle = formatRecurringSubtitle(rule);
              const isDue = ruleIsDue(rule);

              return (
                <React.Fragment key={rule.id}>
                  <PressableScale
                    activeScale={0.98}
                    onPress={() => setSelectedRule(rule)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      backgroundColor: 'transparent',
                      opacity: rule.is_active ? 1 : 0.65,
                    }}
                  >
                    {/* Left: Category Icon & Title/Subtitle */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 21,
                          backgroundColor: theme.isDark ? 'rgba(15, 92, 77, 0.2)' : '#DCE9E3',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>{rule.categories?.icon || '💳'}</Text>
                      </View>

                      <View style={{ gap: 2, flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 15,
                            fontWeight: '700',
                            color: theme.colors.text,
                            letterSpacing: -0.2,
                          }}
                        >
                          {rule.description || rule.categories?.name || 'Subscription'}
                        </Text>
                        <Text
                          numberOfLines={1}
                          variant="caption"
                          muted
                          style={{
                            fontSize: 12,
                            color: theme.colors.textMuted,
                          }}
                        >
                          {subtitle}
                        </Text>
                      </View>
                    </View>

                    {/* Right: Amount & Dashed Status Pill — flexShrink:0 so the
                        row can never squeeze this column below the badge's
                        natural width (was truncating "DUE" to "du"). */}
                    <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        style={{
                          fontSize: 15,
                          fontWeight: '800',
                          color: theme.colors.text,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {formatMoney(Number(rule.amount), rule.currency || preferredCurrency)}
                      </Text>

                      {/* DUE badge wins over the routine ACTIVE pill */}
                      {isDue ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: theme.radius.full,
                            flexShrink: 0,
                            backgroundColor: theme.isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)',
                            borderWidth: 1.5,
                            borderColor: theme.isDark ? '#EF4444' : '#FCA5A5',
                          }}
                        >
                          <AlertCircle size={9} color={theme.isDark ? '#F87171' : '#DC2626'} style={{ flexShrink: 0 }} />
                          <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '900', color: theme.isDark ? '#F87171' : '#DC2626', letterSpacing: 0.5 }}>
                            {t('recurring_due_badge') || 'DUE'}
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: theme.radius.full,
                            borderWidth: 1.5,
                            borderColor: rule.is_active ? theme.colors.primary : theme.colors.textMuted,
                            borderStyle: 'dashed',
                            backgroundColor: 'transparent',
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: rule.is_active ? theme.colors.primary : theme.colors.textMuted,
                              letterSpacing: 0.5,
                            }}
                          >
                            {rule.is_active ? 'ACTIVE' : 'PAUSED'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </PressableScale>

                  {!isLast && (
                    <View
                      style={{
                        height: 1,
                        marginHorizontal: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                        borderStyle: 'dashed',
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── 4. SUBSCRIPTION DETAILS CARD MODAL ── */}
      <Modal
        visible={!!selectedRule}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRule(null)}
      >
        <Pressable
          onPress={() => setSelectedRule(null)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              backgroundColor: theme.colors.surface,
              borderRadius: 24,
              padding: 20,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: theme.isDark ? 0.4 : 0.15,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            {/* Header: Icon + Title + Close Button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: theme.isDark ? 'rgba(15, 92, 77, 0.25)' : '#DCE9E3',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{selectedRule?.categories?.icon || '💳'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3" numberOfLines={1} style={{ fontWeight: '800', fontSize: 18 }}>
                    {selectedRule?.description || selectedRule?.categories?.name || 'Subscription'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 12 }}>
                    {selectedRule?.categories?.name || 'Recurring'}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setSelectedRule(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={theme.colors.text} />
              </Pressable>
            </View>

            {/* Amount Banner */}
            <View
              style={{
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 16,
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                gap: 4,
              }}
            >
              <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
                Recurring Amount
              </Text>
              <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.text, fontVariant: ['tabular-nums'] }}>
                {selectedRule ? formatMoney(Number(selectedRule.amount), selectedRule.currency || preferredCurrency) : ''}
              </Text>
            </View>

            {/* ── PAYMENT STATE: due card / paid proof / timeline / actions ── */}
            {(() => {
              const rule = selectedRule;
              if (!rule) return null;
              const ruleOccurrences = occurrences
                .filter((o) => o.recurring_rule_id === rule.id)
                .slice(0, 4);
              const due = ruleIsDue(rule);
              const busy = busyRuleId === rule.id;
              const latest = latestOccurrenceFor(rule);
              // Undo is offered only while the chain sits exactly one cycle
              // past the newest booking — older history stays booked.
              const latestSlot = latest?.recurring_due_date ?? null;
              const canUndo =
                !!latestSlot &&
                advanceDueDate(latestSlot, rule.frequency, rule.interval_days) === rule.next_due_date;
              const overdueDays = due
                ? Math.max(0, differenceInCalendarDays(parseISO(isoDate()), parseISO(rule.next_due_date)))
                : 0;
              const futureSlots = [0, 1].map((i) => {
                let d = rule.next_due_date;
                for (let k = 0; k <= i; k++) d = advanceDueDate(d, rule.frequency, rule.interval_days);
                return d;
              });

              return (
                <View style={{ gap: 10 }}>
                  {/* Status banner */}
                  {due ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        padding: 12,
                        borderRadius: 14,
                        backgroundColor: theme.isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.08)',
                        borderWidth: 1,
                        borderColor: theme.isDark ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.3)',
                      }}
                    >
                      <AlertCircle size={20} color={theme.isDark ? '#F87171' : '#DC2626'} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: theme.isDark ? '#F87171' : '#DC2626' }}>
                          {overdueDays > 0
                            ? `${t('recurring_overdue') || 'Overdue'} ${overdueDays}d — ${t('recurring_payment_due') || 'payment due'}`
                            : t('recurring_payment_due') || 'Payment due'}
                        </Text>
                        <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                          {`${formatMoney(Number(rule.amount), rule.currency || preferredCurrency)} · ${t('recurring_slot_due') || 'slot due'} ${rule.next_due_date}`}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    (() => {
                      const paid = paidLabelFor(rule);
                      if (!paid) return null;
                      return (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            padding: 12,
                            borderRadius: 14,
                            backgroundColor: theme.isDark ? 'rgba(52,211,153,0.12)' : 'rgba(5,150,105,0.07)',
                            borderWidth: 1,
                            borderColor: theme.isDark ? 'rgba(52,211,153,0.3)' : 'rgba(5,150,105,0.25)',
                          }}
                        >
                          <CheckCircle2 size={18} color={theme.colors.income} />
                          <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.income }}>{paid}</Text>
                          {canUndo ? (
                            <Pressable
                              onPress={() => void runRuleAction(rule.id, 'undo')}
                              disabled={busy}
                              hitSlop={6}
                              style={{
                                marginLeft: 'auto',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 8,
                                backgroundColor: theme.colors.surfaceElevated,
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                                opacity: busy ? 0.5 : 1,
                              }}
                            >
                              <RotateCcw size={11} color={theme.colors.textMuted} />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted }}>
                                {t('recurring_not_paid_undo') || 'Not paid — undo'}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })()
                  )}

                  {/* Payment timeline strip: booked slots, current slot, 2 upcoming */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {ruleOccurrences.map((o) => {
                      const slot = o.recurring_due_date ?? o.date;
                      const late = differenceInCalendarDays(parseISO(o.date), parseISO(slot));
                      return (
                        <View
                          key={o.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: theme.radius.full,
                            backgroundColor: theme.isDark ? 'rgba(52,211,153,0.12)' : 'rgba(5,150,105,0.08)',
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                          }}
                        >
                          <Check size={10} color={theme.colors.income} strokeWidth={3} />
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.text }}>
                            {format(parseISO(o.date), 'MMM d')}
                            {late > 0 ? ` (+${late})` : ''}
                          </Text>
                        </View>
                      );
                    })}
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: theme.radius.full,
                        backgroundColor: due
                          ? (theme.isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.1)')
                          : theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: due ? (theme.isDark ? '#EF4444' : '#FCA5A5') : theme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10.5,
                          fontWeight: '700',
                          color: due ? (theme.isDark ? '#F87171' : '#DC2626') : theme.colors.textMuted,
                        }}
                      >
                        ○ {rule.next_due_date} {due ? (t('recurring_pending_badge') || 'PENDING') : (t('recurring_next_badge') || 'NEXT')}
                      </Text>
                    </View>
                    {futureSlots.map((d) => (
                      <View
                        key={d}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: theme.radius.full,
                          backgroundColor: 'transparent',
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.colors.textMuted }}>
                          {d}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Payment actions for the open slot */}
                  {due && rule.is_active ? (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable
                        onPress={() => void runRuleAction(rule.id, 'paid')}
                        disabled={busy}
                        style={{
                          flex: 1.4,
                          height: 46,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          borderRadius: 14,
                          backgroundColor: busy ? theme.colors.textMuted : theme.colors.income,
                          opacity: busy ? 0.7 : 1,
                        }}
                      >
                        <CheckCircle2 size={17} color="#FFFFFF" />
                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#FFFFFF' }}>
                          {t('recurring_mark_paid') || 'Mark Paid'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void runRuleAction(rule.id, 'skip')}
                        disabled={busy}
                        style={{
                          flex: 1,
                          height: 46,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 14,
                          backgroundColor: theme.colors.surfaceElevated,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.textMuted }}>
                          {t('recurring_skip_cycle') || 'Skip this cycle'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })()}

            {/* Details Tiles */}
            <View style={{ gap: 10 }}>
              {/* Status Row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text variant="caption" muted style={{ fontSize: 13, fontWeight: '600' }}>
                  Status
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: theme.radius.full,
                      borderWidth: 1.5,
                      borderColor: selectedRule?.is_active ? theme.colors.primary : theme.colors.textMuted,
                      borderStyle: 'dashed',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: selectedRule?.is_active ? theme.colors.primary : theme.colors.textMuted }}>
                      {selectedRule?.is_active ? 'ACTIVE' : 'PAUSED'}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      if (selectedRule) {
                        void toggleRuleActive(selectedRule);
                        setSelectedRule((prev) => (prev ? { ...prev, is_active: !prev.is_active } : null));
                      }
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    {selectedRule?.is_active ? <Pause size={11} color={theme.colors.textMuted} /> : <Play size={11} color={theme.colors.primary} />}
                    <Text style={{ fontSize: 11, fontWeight: '700', color: selectedRule?.is_active ? theme.colors.textMuted : theme.colors.primary }}>
                      {selectedRule?.is_active ? 'Pause' : 'Resume'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />

              {/* Billing Frequency */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text variant="caption" muted style={{ fontSize: 13, fontWeight: '600' }}>
                  Billing Frequency
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text, textTransform: 'capitalize' }}>
                  {selectedRule?.frequency || 'Monthly'}
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />

              {/* Next Due Date */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text variant="caption" muted style={{ fontSize: 13, fontWeight: '600' }}>
                  Next Due Date
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                  {selectedRule?.next_due_date || '-'}
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />

              {/* Payment Method */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text variant="caption" muted style={{ fontSize: 13, fontWeight: '600' }}>
                  Payment Channel
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                  {selectedRule?.payment_method || 'Cash'}
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />

              {/* Billing Mode */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text variant="caption" muted style={{ fontSize: 13, fontWeight: '600' }}>
                  {t('recurring_billing_mode') || 'Billing Mode'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                  {(selectedRule?.mode ?? 'pay_on_due') === 'auto_charge'
                    ? (t('recurring_mode_auto') || 'Auto-debit (posted on due date)')
                    : (t('recurring_mode_reminder') || 'Mark paid when due')}
                </Text>
              </View>
            </View>

            {/* Bottom Actions: Close & Edit */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Pressable
                onPress={() => setSelectedRule(null)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>Close</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const ruleToEdit = selectedRule;
                  setSelectedRule(null);
                  if (ruleToEdit) openEditModal(ruleToEdit);
                }}
                style={{
                  flex: 1.3,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.primary,
                }}
              >
                <Edit2 size={15} color="#FFFFFF" />
                <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Edit</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 5. RECURRING BILL FORM MODAL (CREATE / EDIT) ── */}
      <Modal
        visible={showFormModal}
        transparent
        animationType="slide"
        onRequestClose={closeFormModal}
      >
        <KeyboardAvoidingView
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'flex-end',
          }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={{
              maxHeight: '92%',
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            {/* Modal Top Grab Header */}
            <View
              style={{
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceElevated,
              }}
            >
              {/* Grab handle pill */}
              <View
                style={{
                  width: 38,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                  alignSelf: 'center',
                  marginBottom: 10,
                }}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CalendarClock size={20} color={theme.colors.primary} />
                  </View>
                  <View>
                    <Text variant="h3" style={{ fontWeight: '800', fontSize: 17 }}>
                      {editingRuleId ? '✏️ Edit Recurring Bill' : `+ ${t('recurring_add_new') || 'Add Recurring Bill'}`}
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      {editingRuleId ? 'Modify subscription details and schedule' : 'Automate repeat payments and schedule reminders'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {editingRuleId ? (
                    <Pressable
                      onPress={() => handleDeleteRule(editingRuleId)}
                      hitSlop={8}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={16} color={theme.colors.danger} />
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={closeFormModal}
                    hitSlop={8}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: theme.colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <X size={16} color={theme.colors.text} />
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Modal Body Scroll */}
            <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 40 }}>
              {/* Currency + Amount Hero Input Box */}
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" muted style={{ fontWeight: '700' }}>
                  {t('recurring_amount') || 'Amount'}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: theme.colors.surfaceElevated,
                    borderRadius: theme.radius.md,
                    borderWidth: 1.5,
                    borderColor: theme.colors.primary,
                    paddingHorizontal: 14,
                    height: 52,
                  }}
                >
                  <Text style={{ fontWeight: '900', color: theme.colors.primary, marginRight: 8, fontSize: 16 }}>
                    {preferredCurrency}
                  </Text>
                  <TextInput
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    style={{
                      flex: 1,
                      color: theme.colors.text,
                      fontSize: 20,
                      fontWeight: '800',
                      paddingVertical: 0,
                    }}
                    autoFocus={!editingRuleId}
                  />
                  {amount ? (
                    <Pressable onPress={() => setAmount('')} hitSlop={8}>
                      <X size={16} color={theme.colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Description Input */}
              <Input
                label={t('recurring_description') || 'Description'}
                placeholder="e.g. House Rent, Netflix, Wi-Fi, Gym"
                value={description}
                onChangeText={setDescription}
              />

              {/* Category Select */}
              <Select
                label={t('recurring_category') || 'Category'}
                value={categoryId}
                options={categoryOptions}
                onChange={setCategoryId}
              />

              {/* Frequency Selector */}
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" muted style={{ fontWeight: '700' }}>
                  {t('recurring_frequency') || 'Recurrence Frequency'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                  {frequencies.map((item) => {
                    const active = frequency === item.value;
                    return (
                      <PressableScale
                        key={item.value}
                        activeScale={0.92}
                        onPress={() => setFrequency(item.value)}
                        containerStyle={{ flex: 1 }}
                        style={{
                          width: '100%',
                          paddingVertical: 11,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: theme.radius.md,
                          backgroundColor: active ? theme.colors.primary : theme.colors.surfaceElevated,
                          borderWidth: 1.5,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: active ? '#FFFFFF' : theme.colors.text,
                            fontWeight: active ? '800' : '600',
                            fontSize: 13,
                          }}
                        >
                          {item.label}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>

              {/* Custom cycle length (Every N days) */}
              {frequency === 'custom' ? (
                <View style={{ gap: theme.spacing.xs }}>
                  <Text variant="caption" muted style={{ fontWeight: '700' }}>
                    {t('recurring_interval_days') || 'Repeat every (days)'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: theme.colors.surfaceElevated,
                        borderRadius: theme.radius.md,
                        borderWidth: 1.5,
                        borderColor: theme.colors.primary,
                        paddingHorizontal: 14,
                        height: 48,
                        width: 110,
                      }}
                    >
                      <TextInput
                        keyboardType="number-pad"
                        maxLength={3}
                        value={intervalDays}
                        onChangeText={(v) => setIntervalDays(v.replace(/[^0-9]/g, '').slice(0, 3))}
                        style={{ flex: 1, color: theme.colors.text, fontSize: 17, fontWeight: '800', paddingVertical: 0 }}
                      />
                    </View>
                    {[7, 14, 28, 30].map((preset) => (
                      <PressableScale
                        key={preset}
                        activeScale={0.92}
                        onPress={() => setIntervalDays(String(preset))}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: theme.radius.full,
                          backgroundColor: intervalDays === String(preset) ? theme.colors.primary : theme.colors.surfaceElevated,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '800',
                            color: intervalDays === String(preset) ? '#FFFFFF' : theme.colors.text,
                          }}
                        >
                          {preset}d
                        </Text>
                      </PressableScale>
                    ))}
                  </View>
                  <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                    {t('recurring_interval_hint') || 'Chain stays locked to the plan start — paying late never shifts the next due date.'}
                  </Text>
                </View>
              ) : null}

              {/* Billing mode: reminder card vs silent auto-post */}
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" muted style={{ fontWeight: '700' }}>
                  {t('recurring_billing_mode') || 'Billing Mode'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([
                    { key: 'pay_on_due' as RecurringMode, label: t('recurring_mode_reminder') || 'Mark paid when due', sub: t('recurring_mode_reminder_sub') || 'Shows a due card — books money only when you tap' },
                    { key: 'auto_charge' as RecurringMode, label: t('recurring_mode_auto') || 'Auto-debit', sub: t('recurring_mode_auto_sub') || 'Posted automatically on the due date (Netflix, mandates)' },
                  ]).map((m) => {
                    const active = ruleMode === m.key;
                    return (
                      <PressableScale
                        key={m.key}
                        activeScale={0.96}
                        onPress={() => setRuleMode(m.key)}
                        containerStyle={{ flex: 1 }}
                        style={{
                          width: '100%',
                          gap: 3,
                          padding: 12,
                          borderRadius: theme.radius.md,
                          backgroundColor: active
                            ? (theme.isDark ? 'rgba(99,102,241,0.18)' : 'rgba(79,70,229,0.08)')
                            : theme.colors.surfaceElevated,
                          borderWidth: 1.8,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '800', color: active ? theme.colors.primary : theme.colors.text }}>
                          {m.key === 'auto_charge' ? '⚡ ' : '🔔 '}{m.label}
                        </Text>
                        <Text style={{ fontSize: 10.5, fontWeight: '500', color: theme.colors.textMuted }}>
                          {m.sub}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>

              {/* Next Due Date Picker & Schedule Presets */}
              <View style={{ gap: 8 }}>
                <Text variant="caption" muted style={{ fontWeight: '700' }}>
                  {t('recurring_next_due') || 'Next Due / Billing Date'}
                </Text>

                {/* Main Interactive Date Field */}
                <Pressable
                  onPress={() => setCalendarOpen(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    paddingHorizontal: 14,
                    height: 50,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CalendarIcon size={18} color={theme.colors.primary} />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>
                      {nextDueDate}
                    </Text>
                  </View>
                  <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                    Choose Date 📅
                  </Text>
                </Pressable>

                {/* Quick Date Presets */}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <PressableScale
                    activeScale={0.92}
                    onPress={() => setQuickDate('today')}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: theme.radius.full,
                      backgroundColor: nextDueDate === isoDate() ? theme.colors.primary : theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: nextDueDate === isoDate() ? '#FFFFFF' : theme.colors.text }}>
                      Today
                    </Text>
                  </PressableScale>

                  <PressableScale
                    activeScale={0.92}
                    onPress={() => setQuickDate('tomorrow')}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                      Tomorrow
                    </Text>
                  </PressableScale>

                  <PressableScale
                    activeScale={0.92}
                    onPress={() => setQuickDate('first_next_month')}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                      1st Next Month
                    </Text>
                  </PressableScale>

                  <PressableScale
                    activeScale={0.92}
                    onPress={() => setQuickDate('fifteenth')}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                      15th of Month
                    </Text>
                  </PressableScale>
                </View>
              </View>

              {/* Payment Method Pills */}
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" muted style={{ fontWeight: '700' }}>
                  {t('expense_payment_method') || 'Payment Channel'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                  {PAYMENT_METHODS.map((method) => {
                    const active = paymentMethod === method;
                    return (
                      <PressableScale
                        key={method}
                        activeScale={0.92}
                        onPress={() => setPaymentMethod(method as PaymentMethod)}
                        containerStyle={{ flex: 1 }}
                        style={{
                          width: '100%',
                          paddingVertical: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: theme.radius.md,
                          backgroundColor: active ? theme.colors.primary : theme.colors.surfaceElevated,
                          borderWidth: 1.5,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: active ? '#FFFFFF' : theme.colors.text,
                            fontWeight: active ? '800' : '600',
                            fontSize: 12,
                          }}
                        >
                          {method}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>

              {/* Action Buttons: Side-by-Side for Existing Data, Full-Width for New */}
              {editingRuleId ? (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'center' }}>
                  {/* Delete Button */}
                  <PressableScale
                    activeScale={0.94}
                    onPress={() => handleDeleteRule(editingRuleId)}
                    containerStyle={{ flex: 1 }}
                    style={{
                      width: '100%',
                      height: 50,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2',
                      borderWidth: 1.5,
                      borderColor: theme.isDark ? '#EF4444' : '#FCA5A5',
                    }}
                  >
                    <Trash2 size={16} color={theme.isDark ? '#F87171' : '#DC2626'} />
                    <Text
                      style={{
                        fontWeight: '800',
                        color: theme.isDark ? '#F87171' : '#DC2626',
                        fontSize: 14,
                      }}
                    >
                      Delete
                    </Text>
                  </PressableScale>

                  {/* Save / Update Button */}
                  <View style={{ flex: 1.8 }}>
                    <Button
                      title="Save Changes"
                      loading={saving}
                      onPress={handleSaveRule}
                      style={{ height: 50 }}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  title={t('recurring_save') || 'Save Recurring Bill'}
                  loading={saving}
                  onPress={handleSaveRule}
                  style={{ height: 50, marginTop: 6 }}
                />
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Calendar Picker Modal */}
      <CalendarModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onApply={(range) => {
          if (range.startDate) {
            setNextDueDate(range.startDate);
          }
        }}
        initialRange={{ startDate: nextDueDate, endDate: nextDueDate }}
      />

      {/* Designed delete-confirmation (replaces the plain system Alert) */}
      <ConfirmDialog
        visible={deleteTargetId !== null}
        title={t('common_delete') || 'Delete Subscription'}
        message={t('bin_move_plan_message')}
        confirmLabel={t('common_delete') || 'Delete'}
        loading={deletingRule}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => void confirmDeleteRule()}
      />

      {/* ── Floating Action Button (+) ── */}
      <View style={{ position: 'absolute', bottom: 86, right: 20 }}>
        <PressableScale
          activeScale={0.88}
          onPress={openCreateModal}
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: theme.isDark ? 0.45 : 0.25,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          <Plus size={28} color="#FFFFFF" strokeWidth={2.8} />
        </PressableScale>
      </View>
    </View>
  );
}