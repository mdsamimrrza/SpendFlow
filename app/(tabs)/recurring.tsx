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
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { createRecurringRule, deleteRecurringRule, listRecurringRules } from '@/services/recurring';
import { notifyRecurringBillDue } from '@/services/notifications';

import { Category, PaymentMethod, RecurringFrequency, RecurringRule } from '@/types';
import { formatMoney, isoDate } from '@/utils/format';

const frequencies: { label: string; value: RecurringFrequency }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
];

export default function RecurringScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

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
    load().catch((error) => Alert.alert('Could not load recurring rules', error.message));
  }, [profile?.id]);

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ label: `${category.icon} ${category.name}`, value: category.id })),
    [categories],
  );

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  // Calculate monthly total commitments
  const totalMonthlyCommitment = useMemo(() => {
    return rules.reduce((sum, rule) => {
      const val = Number(rule.amount) || 0;
      if (rule.frequency === 'daily') return sum + val * 30;
      if (rule.frequency === 'weekly') return sum + val * 4;
      return sum + val; // monthly
    }, 0);
  }, [rules]);

  async function addRule() {
    const numericAmount = Number(amount);
    if (!profile?.id || !numericAmount || numericAmount <= 0 || !categoryId) {
      Alert.alert('Check the form', 'Please enter a valid positive amount and select a category.');
      return;
    }
    setSaving(true);
    try {
      await createRecurringRule(profile.id, {
        amount: numericAmount,
        category_id: categoryId,
        currency: preferredCurrency,
        description: description.trim() || null,
        payment_method: paymentMethod,
        frequency,
        next_due_date: nextDueDate,
      });

      // Trigger automatic recurring bill notification
      const cat = categories.find((c) => c.id === categoryId);
      void notifyRecurringBillDue(
        description.trim() || cat?.name || 'Recurring Bill',
        numericAmount,
        nextDueDate,
        preferredCurrency,
      );

      setAmount('');
      setDescription('');
      setShowAddForm(false);
      await load();

    } catch (error) {
      Alert.alert('Could not save rule', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(name: string, defaultAmount: string, defaultFreq: RecurringFrequency) {
    setDescription(name);
    setAmount(defaultAmount);
    setFrequency(defaultFreq);
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
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* 1. TOP HEADER & APP BAR */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="h1">Recurring Bills</Text>
            <Text variant="caption" muted>Automate your subscriptions & fixed bills</Text>
          </View>
          <ThemeToggle />
        </View>

        {/* 2. SUMMARY HERO CARD */}
        <Card style={{ padding: theme.spacing.lg, gap: theme.spacing.md, backgroundColor: theme.isDark ? '#14262A' : '#EAF7F5', borderColor: theme.colors.primary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Repeat size={20} color={theme.colors.primary} />
              <Text variant="caption" style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: theme.colors.primary }}>
                Monthly Commitment
              </Text>
            </View>
            <View style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: theme.isDark ? '#06201D' : '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                {rules.length} {rules.length === 1 ? 'Active Rule' : 'Active Rules'}
              </Text>
            </View>
          </View>

          <Text variant="h1" style={{ fontSize: 34, lineHeight: 42, color: theme.colors.primary, fontWeight: '800' }}>
            {formatMoney(totalMonthlyCommitment, preferredCurrency)}
          </Text>

          <Text variant="caption" muted style={{ marginTop: -4 }}>
            Estimated total fixed expenses auto-renewing each month.
          </Text>
        </Card>

        {/* 3. ADD RECURRING RULE BUTTON / TOGGLE FORM */}
        {!showAddForm ? (
          <Button
            title="Create Recurring Rule"
            icon={Plus}
            onPress={() => setShowAddForm(true)}
          />
        ) : (
          <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="h3">New Recurring Rule</Text>
              <Pressable onPress={() => setShowAddForm(false)} hitSlop={8}>
                <Text variant="caption" style={{ color: theme.colors.danger, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>

            {/* Amount Hero Input */}
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" muted style={{ fontWeight: '600' }}>Amount ({preferredCurrency})</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, height: 50 }}>
                <Text variant="h3" style={{ color: theme.colors.primary }}>{preferredCurrency}</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textMuted}
                  value={amount}
                  onChangeText={(val) => setAmount(val.replace(/[^0-9.]/g, ''))}
                  style={{ flex: 1, fontSize: 20, fontWeight: '700', color: theme.colors.text }}
                />
              </View>
            </View>

            <Input
              label="Description / Label"
              placeholder="e.g. House Rent, Netflix, Wi-Fi"
              value={description}
              onChangeText={setDescription}
            />

            <Select label="Category" value={categoryId} options={categoryOptions} onChange={setCategoryId} />

            {/* Frequency Pill Selector */}
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" muted style={{ fontWeight: '600' }}>Frequency</Text>
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
              <Text variant="caption" muted style={{ fontWeight: '600' }}>First / Next Due Date</Text>
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
              <Text variant="caption" muted style={{ fontWeight: '600' }}>Payment Method</Text>
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

            <Button title="Save Recurring Rule" icon={CalendarClock} loading={saving} onPress={addRule} />
          </Card>
        )}

        {/* 4. ACTIVE RULES LIST */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="h2">Active Commitments ({rules.length})</Text>

          {rules.length === 0 ? (
            <Card style={{ gap: theme.spacing.md, padding: theme.spacing.xl, alignItems: 'center' }}>
              <Sparkles size={36} color={theme.colors.primary} />
              <Text variant="h3" style={{ textAlign: 'center' }}>No Recurring Rules Yet</Text>
              <Text muted style={{ textAlign: 'center', fontSize: 13, lineHeight: 18 }}>
                Add your fixed monthly bills like Rent, Subscriptions, or Utilities to track commitments automatically.
              </Text>

              {/* Preset Suggestion Chips */}
              <View style={{ gap: theme.spacing.xs, width: '100%', marginTop: theme.spacing.xs }}>
                <Text variant="caption" muted style={{ textAlign: 'center', fontWeight: '600' }}>Quick Preset Suggestions:</Text>
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
                    Next Due: <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>{rule.next_due_date}</Text>
                  </Text>

                  <Button
                    title="Delete"
                    variant="ghost"
                    icon={Trash2}
                    style={{ height: 32, paddingHorizontal: 8 }}
                    onPress={() =>
                      Alert.alert('Delete Rule?', 'Future recurring expenses will no longer be generated for this commitment.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteRecurringRule(rule.id).then(load) },
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