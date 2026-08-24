import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { CalendarClock, Plus, Repeat, Sparkles, Trash2 } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { CalendarModal } from '@/components/ui/CalendarModal';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PAYMENT_METHODS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { createRecurringRule, deleteRecurringRule, listRecurringRules } from '@/services/recurring';
import { notifyRecurringBillDue } from '@/services/notifications';

import { Category, PaymentMethod, RecurringFrequency, RecurringRule } from '@/types';
import { formatMoney, isoDate } from '@/utils/format';

export default function RecurringScreen() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const frequencies: { label: string; value: RecurringFrequency }[] = [
    { label: t('recurring_freq_daily'), value: 'daily' },
    { label: t('recurring_freq_weekly'), value: 'weekly' },
    { label: t('recurring_freq_monthly'), value: 'monthly' },
  ];

  // Form State
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState(isoDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

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

  useEffect(() => {
    load().catch((error) => Alert.alert(t('common_error'), error.message));
  }, [profile?.id]);

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ label: `${category.icon} ${category.name}`, value: category.id })),
    [categories],
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  // Calculate total monthly commitment
  const monthlyTotal = useMemo(() => {
    return rules.reduce((acc, rule) => {
      const amt = Number(rule.amount) || 0;
      if (rule.frequency === 'daily') return acc + amt * 30;
      if (rule.frequency === 'weekly') return acc + amt * 4.33;
      return acc + amt;
    }, 0);
  }, [rules]);

  async function addRule() {
    if (!profile?.id || !amount || Number(amount) <= 0 || !categoryId) {
      Alert.alert(t('common_error'), t('expense_amount_placeholder'));
      return;
    }

    setSaving(true);
    try {
      await createRecurringRule(profile.id, {
        category_id: categoryId,
        amount: Number(amount),
        currency: preferredCurrency,
        description: description.trim() || undefined,
        frequency,
        next_due_date: nextDueDate,
        payment_method: paymentMethod,
      });

      // Reset Form & Close
      setAmount('');
      setDescription('');
      setShowAddForm(false);
      await load();

      // Trigger Smart Bill Reminder
      try {
        const catName = categories.find((c) => c.id === categoryId)?.name || 'Recurring Bill';
        void notifyRecurringBillDue(description || catName, Number(amount), preferredCurrency);
      } catch {
        // Notification check
      }
    } catch (error) {
      Alert.alert(t('common_error'), error instanceof Error ? error.message : t('common_error'));
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(presetDesc: string, presetAmt: string, presetFreq: RecurringFrequency) {
    setDescription(presetDesc);
    setAmount(presetAmt);
    setFrequency(presetFreq);
    setShowAddForm(true);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. APP BAR HEADER */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="h1">{t('recurring_title')}</Text>
            <Text variant="caption" muted>
              {rules.length} {t('recurring_active_rules')}
            </Text>
          </View>
          <ThemeToggle />
        </View>

        {/* 2. MONTHLY COMMITMENT HERO CARD */}
        <Card style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Repeat size={18} color={theme.colors.primary} />
              <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}>
                {t('recurring_monthly_commitments')}
              </Text>
            </View>
            <View style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.isDark ? '#06201D' : '#FFFFFF' }}>
                {rules.length} {t('recurring_active_rules')}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="h1" style={{ fontSize: 34, lineHeight: 40, fontWeight: '800' }}>
              {formatMoney(monthlyTotal, preferredCurrency)}
            </Text>
            <Text variant="caption" muted style={{ fontWeight: '600' }}>{t('recurring_per_month')}</Text>
          </View>

          {/* Quick Action Button: Toggle Add Form */}
          <Button
            title={showAddForm ? t('common_cancel') : `+ ${t('recurring_add_new')}`}
            variant={showAddForm ? 'secondary' : 'primary'}
            onPress={() => setShowAddForm(!showAddForm)}
          />
        </Card>

        {/* 3. COLLAPSIBLE ADD RECURRING RULE FORM */}
        {showAddForm && (
          <Card style={{ padding: theme.spacing.lg, gap: theme.spacing.md, borderWidth: 1.5, borderColor: theme.colors.primary }}>
            <Text variant="h2">{t('recurring_add_new')}</Text>

            {/* Currency + Amount Input */}
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" muted style={{ fontWeight: '600' }}>{t('recurring_amount')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <View style={{ backgroundColor: theme.colors.surfaceElevated, height: 48, paddingHorizontal: 14, borderRadius: theme.radius.md, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text variant="label" style={{ fontWeight: '700' }}>{preferredCurrency}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    placeholder="0.00"
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    autoFocus
                  />
                </View>
              </View>
            </View>

            <Input
              label={t('recurring_description')}
              placeholder="e.g. House Rent, Netflix, Wi-Fi"
              value={description}
              onChangeText={setDescription}
            />

            <Select label={t('recurring_category')} value={categoryId} options={categoryOptions} onChange={setCategoryId} />

            {/* Frequency Pill Selector */}
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" muted style={{ fontWeight: '600' }}>{t('recurring_frequency')}</Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                {frequencies.map((item) => {
                  const active = frequency === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setFrequency(item.value)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: theme.radius.md,
                        backgroundColor: active ? theme.colors.primary : theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Text style={{ color: active ? (theme.isDark ? '#06201D' : '#FFFFFF') : theme.colors.text, fontWeight: active ? '700' : '500', fontSize: 13 }}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Next Due Date Picker */}
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" muted style={{ fontWeight: '600' }}>{t('recurring_next_due')}</Text>
              <Pressable onPress={() => setCalendarOpen(true)}>
                <Input
                  value={nextDueDate}
                  editable={false}
                  pointerEvents="none"
                  placeholder="YYYY-MM-DD"
                />
              </Pressable>
            </View>

            {/* Payment Method Pills */}
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" muted style={{ fontWeight: '600' }}>{t('expense_payment_method')}</Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                {PAYMENT_METHODS.map((method) => {
                  const active = paymentMethod === method;
                  return (
                    <Pressable
                      key={method}
                      onPress={() => setPaymentMethod(method as PaymentMethod)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                        borderRadius: theme.radius.md,
                        backgroundColor: active ? theme.colors.primary : theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Text style={{ color: active ? (theme.isDark ? '#06201D' : '#FFFFFF') : theme.colors.text, fontWeight: active ? '700' : '500', fontSize: 12 }}>
                        {method}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Button title={t('recurring_save')} icon={CalendarClock} loading={saving} onPress={addRule} />
          </Card>
        )}

        {/* 4. ACTIVE RULES LIST */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="h2">{t('recurring_active_rules')} ({rules.length})</Text>

          {rules.length === 0 ? (
            <Card style={{ gap: theme.spacing.md, padding: theme.spacing.xl, alignItems: 'center' }}>
              <Sparkles size={36} color={theme.colors.primary} />
              <Text variant="h3" style={{ textAlign: 'center' }}>{t('recurring_no_rules_title')}</Text>
              <Text muted style={{ textAlign: 'center', fontSize: 13, lineHeight: 18 }}>
                {t('recurring_no_rules_message')}
              </Text>

              {/* Preset Suggestion Chips */}
              <View style={{ gap: theme.spacing.xs, width: '100%', marginTop: theme.spacing.xs }}>
                <Text variant="caption" muted style={{ textAlign: 'center', fontWeight: '600' }}>{t('recurring_quick_add')}:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  <Pressable onPress={() => applyPreset('🏠 House Rent', '25000', 'monthly')} style={{ backgroundColor: theme.colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text variant="caption" style={{ fontWeight: '600' }}>🏠 House Rent</Text>
                  </Pressable>
                  <Pressable onPress={() => applyPreset('📶 Wi-Fi Bill', '1200', 'monthly')} style={{ backgroundColor: theme.colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text variant="caption" style={{ fontWeight: '600' }}>📶 Wi-Fi Bill</Text>
                  </Pressable>
                  <Pressable onPress={() => applyPreset('🍿 Netflix Subscription', '800', 'monthly')} style={{ backgroundColor: theme.colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text variant="caption" style={{ fontWeight: '600' }}>🍿 Netflix</Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          ) : (
            rules.map((rule) => (
              <Card key={rule.id} style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ fontSize: 20 }}>{rule.categories?.icon || '💳'}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="h3" numberOfLines={1}>
                        {rule.description || rule.categories?.name || 'Recurring Expense'}
                      </Text>
                      <Text variant="caption" muted numberOfLines={1}>
                        {rule.categories?.name} · {rule.payment_method}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text variant="h3" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                      {formatMoney(Number(rule.amount), rule.currency || preferredCurrency)}
                    </Text>
                    <View style={{ backgroundColor: theme.colors.surfaceElevated, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border }}>
                      <Text variant="caption" style={{ textTransform: 'uppercase', fontSize: 10, fontWeight: '700', color: theme.colors.textMuted }}>
                        {rule.frequency}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Footer Sub-row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.xs, marginTop: theme.spacing.xs }}>
                  <Text variant="caption" muted>
                    {t('recurring_next_due')}: <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>{rule.next_due_date}</Text>
                  </Text>

                  <Button
                    title={t('common_delete')}
                    variant="ghost"
                    icon={Trash2}
                    style={{ height: 32, paddingHorizontal: 8 }}
                    onPress={() =>
                      Alert.alert(t('common_delete'), t('settings_delete_confirm'), [
                        { text: t('common_cancel'), style: 'cancel' },
                        { text: t('common_delete'), style: 'destructive', onPress: () => deleteRecurringRule(rule.id).then(load) },
                      ])
                    }
                  />
                </View>
              </Card>
            ))
          )}
        </View>

        {/* Date Picker Modal */}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}