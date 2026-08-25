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
  Calendar as CalendarIcon,
  CalendarClock,
  Edit2,
  Pause,
  Play,
  Repeat,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { CalendarModal } from '@/components/ui/CalendarModal';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/ui/PressableScale';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PAYMENT_METHODS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import {
  createRecurringRule,
  deleteRecurringRule,
  listRecurringRules,
  updateRecurringRule,
} from '@/services/recurring';
import { notifyRecurringBillDue } from '@/services/notifications';
import { Category, PaymentMethod, RecurringFrequency, RecurringRule } from '@/types';
import { formatMoney, isoDate } from '@/utils/format';

export default function RecurringScreen() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const frequencies: { label: string; value: RecurringFrequency }[] = [
    { label: t('recurring_freq_daily') || 'Daily', value: 'daily' },
    { label: t('recurring_freq_weekly') || 'Weekly', value: 'weekly' },
    { label: t('recurring_freq_monthly') || 'Monthly', value: 'monthly' },
  ];

  // Modal Form State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState(isoDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  async function load() {
    if (!profile?.id) return;
    const [nextRules, nextCategories] = await Promise.all([
      listRecurringRules(profile.id),
      listCategories(profile.id),
    ]);
    setRules(nextRules);
    setCategories(nextCategories);
    setCategoryId((current) => current || nextCategories[0]?.id || '');
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
        return acc + amt;
      }, 0);
  }, [rules]);

  function openCreateModal() {
    setEditingRuleId(null);
    setAmount('');
    setDescription('');
    setFrequency('monthly');
    setNextDueDate(isoDate());
    setPaymentMethod('Cash');
    setCategoryId(categories[0]?.id || '');
    setShowFormModal(true);
  }

  function openEditModal(rule: RecurringRule) {
    setEditingRuleId(rule.id);
    setAmount(String(rule.amount));
    setDescription(rule.description || '');
    setCategoryId(rule.category_id);
    setFrequency(rule.frequency);
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

  async function handleSaveRule() {
    if (!profile?.id || !amount || Number(amount) <= 0 || !categoryId) {
      Alert.alert(t('common_error'), t('expense_amount_placeholder') || 'Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      if (editingRuleId) {
        // UPDATE EXISTING RECURRING RULE
        await updateRecurringRule(editingRuleId, {
          category_id: categoryId,
          amount: Number(amount),
          currency: preferredCurrency,
          description: description.trim() || null,
          frequency,
          next_due_date: nextDueDate,
          payment_method: paymentMethod,
        });
      } else {
        // CREATE NEW RECURRING RULE
        await createRecurringRule(profile.id, {
          category_id: categoryId,
          amount: Number(amount),
          currency: preferredCurrency,
          description: description.trim() || undefined,
          frequency,
          next_due_date: nextDueDate,
          payment_method: paymentMethod,
        });

        // Trigger Smart Bill Reminder
        try {
          const catName = categories.find((c) => c.id === categoryId)?.name || 'Recurring Bill';
          void notifyRecurringBillDue(description || catName, Number(amount), preferredCurrency);
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

  async function toggleRuleActive(rule: RecurringRule) {
    try {
      await updateRecurringRule(rule.id, { is_active: !rule.is_active });
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

  function getDueStatusBadge(dueDateStr: string, isActive: boolean) {
    if (!isActive) {
      return { label: 'Paused', color: theme.colors.textMuted, bg: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = parseISO(dueDateStr);
    target.setHours(0, 0, 0, 0);
    const diffDays = differenceInCalendarDays(target, today);

    if (diffDays < 0) {
      return { label: `Overdue by ${Math.abs(diffDays)}d`, color: theme.colors.danger, bg: theme.isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today 🔔', color: theme.colors.warning, bg: theme.isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.1)' };
    }
    if (diffDays === 1) {
      return { label: 'Due Tomorrow', color: theme.colors.primary, bg: theme.isDark ? 'rgba(99,102,241,0.18)' : 'rgba(79,70,229,0.1)' };
    }
    return { label: `In ${diffDays} days`, color: theme.colors.textMuted, bg: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' };
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
              Subscriptions & Bills
            </Text>
            <Text variant="h1" style={{ fontWeight: '800', letterSpacing: -0.3 }}>
              {t('recurring_title') || 'Recurring Bills'}
            </Text>
          </View>
          <ThemeToggle />
        </View>

        {/* ── 2. MONTHLY COMMITMENT HERO CARD ── */}
        <Card style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Repeat size={18} color={theme.colors.primary} />
              <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}>
                {t('recurring_monthly_commitments') || 'Monthly Commitments'}
              </Text>
            </View>
            <View style={{ backgroundColor: theme.isDark ? 'rgba(99,102,241,0.2)' : 'rgba(79,70,229,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.primary }}>
                {rules.filter((r) => r.is_active).length} Active
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="h1" style={{ fontSize: 34, lineHeight: 40, fontWeight: '900', color: theme.colors.primary }}>
              {formatMoney(monthlyTotal, preferredCurrency)}
            </Text>
            <Text variant="caption" muted style={{ fontWeight: '700', fontSize: 13 }}>
              {t('recurring_per_month') || '/ month'}
            </Text>
          </View>

          {/* Quick Action Button: Opens Modal Popup */}
          <Button
            title={`+ ${t('recurring_add_new') || 'Add Recurring Bill'}`}
            variant="primary"
            onPress={openCreateModal}
          />
        </Card>

        {/* ── 3. CONFIGURED RECURRING BILLS LIST ── */}
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="h2" style={{ fontWeight: '800', fontSize: 17 }}>
              {t('recurring_active_rules') || 'Configured Recurring Bills'} ({rules.length})
            </Text>
          </View>

          {rules.length === 0 ? (
            <Card style={{ gap: theme.spacing.md, padding: theme.spacing.xl, alignItems: 'center' }}>
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
            rules.map((rule) => {
              const status = getDueStatusBadge(rule.next_due_date, rule.is_active);
              const isBeingEdited = editingRuleId === rule.id;

              return (
                <PressableScale
                  key={rule.id}
                  activeScale={0.98}
                  onPress={() => openEditModal(rule)}
                  style={{
                    padding: theme.spacing.lg,
                    gap: theme.spacing.sm,
                    backgroundColor: isBeingEdited
                      ? (theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)')
                      : theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderWidth: 1.5,
                    borderColor: isBeingEdited ? theme.colors.primary : theme.colors.border,
                    opacity: rule.is_active ? 1 : 0.65,
                  }}
                >
                  {/* Top Row: Icon + Description & Amount */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}>
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 21,
                          backgroundColor: theme.colors.surfaceElevated,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>{rule.categories?.icon || '💳'}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="h3" numberOfLines={1} style={{ fontWeight: '800' }}>
                          {rule.description || rule.categories?.name || 'Recurring Expense'}
                        </Text>
                        <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 11 }}>
                          {rule.categories?.name} · {rule.payment_method}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text variant="h3" style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 16 }}>
                        {formatMoney(Number(rule.amount), rule.currency || preferredCurrency)}
                      </Text>
                      <View style={{ backgroundColor: status.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: status.color, textTransform: 'capitalize' }}>
                          {rule.frequency} · {status.label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Bottom Action Footer Row */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.border,
                      paddingTop: theme.spacing.xs,
                      marginTop: 2,
                    }}
                  >
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      Due: <Text style={{ fontWeight: '800', color: theme.colors.text }}>{rule.next_due_date}</Text>
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {/* Pause / Resume Button */}
                      <PressableScale
                        activeScale={0.88}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          void toggleRuleActive(rule);
                        }}
                        hitSlop={8}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: theme.radius.sm,
                          backgroundColor: theme.colors.surfaceElevated,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        {rule.is_active ? <Pause size={12} color={theme.colors.textMuted} /> : <Play size={12} color={theme.colors.success} />}
                        <Text variant="caption" style={{ fontSize: 11, fontWeight: '700', color: rule.is_active ? theme.colors.textMuted : theme.colors.success }}>
                          {rule.is_active ? 'Pause' : 'Resume'}
                        </Text>
                      </PressableScale>

                      {/* Edit Button */}
                      <PressableScale
                        activeScale={0.88}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          openEditModal(rule);
                        }}
                        hitSlop={8}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: theme.radius.sm,
                          backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)',
                          borderWidth: 1,
                          borderColor: theme.colors.primary,
                        }}
                      >
                        <Edit2 size={12} color={theme.colors.primary} />
                        <Text variant="caption" style={{ fontSize: 11, fontWeight: '800', color: theme.colors.primary }}>
                          Edit
                        </Text>
                      </PressableScale>

                      {/* Delete Button */}
                      <PressableScale
                        activeScale={0.88}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          Alert.alert(t('common_delete') || 'Delete', 'Are you sure you want to remove this recurring bill?', [
                            { text: t('common_cancel') || 'Cancel', style: 'cancel' },
                            {
                              text: t('common_delete') || 'Delete',
                              style: 'destructive',
                              onPress: () => deleteRecurringRule(rule.id).then(load),
                            },
                          ]);
                        }}
                        hitSlop={8}
                        style={{
                          padding: 6,
                          borderRadius: theme.radius.sm,
                          backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                        }}
                      >
                        <Trash2 size={13} color={theme.colors.danger} />
                      </PressableScale>
                    </View>
                  </View>
                </PressableScale>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── 4. RECURRING BILL MODAL SHEET POPUP (CONSISTENT DESIGN) ── */}
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

              {/* CTA Save Button */}
              <Button
                title={editingRuleId ? 'Update Recurring Bill' : (t('recurring_save') || 'Save Recurring Bill')}
                loading={saving}
                onPress={handleSaveRule}
                style={{ height: 50, marginTop: 6 }}
              />
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
    </View>
  );
}