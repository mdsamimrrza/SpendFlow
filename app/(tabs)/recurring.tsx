import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { CalendarClock, Trash2 } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { CURRENCIES, PAYMENT_METHODS } from '@/constants/app';
import { listCategories } from '@/services/categories';
import { createRecurringRule, deleteRecurringRule, listRecurringRules } from '@/services/recurring';
import { Category, PaymentMethod, RecurringFrequency, RecurringRule } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { isoDate } from '@/utils/format';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

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
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState(isoDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!profile?.id) return;
    const [nextRules, nextCategories] = await Promise.all([listRecurringRules(profile.id), listCategories(profile.id)]);
    setRules(nextRules);
    setCategories(nextCategories);
    setCategoryId((current) => current || nextCategories[0]?.id || '');
  }

  useEffect(() => {
    load().catch((error) => Alert.alert('Could not load recurring rules', error.message));
  }, [profile?.id]);

  const categoryOptions = useMemo(() => categories.map((category) => ({ label: `${category.icon} ${category.name}`, value: category.id })), [categories]);

  async function addRule() {
    const numericAmount = Number(amount);
    if (!profile?.id || !numericAmount || !categoryId || !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
      Alert.alert('Check the form', 'Enter an amount, category, and date in YYYY-MM-DD format.');
      return;
    }
    setSaving(true);
    try {
      await createRecurringRule(profile.id, { amount: numericAmount, category_id: categoryId, currency: profile.preferred_currency, description: description || null, payment_method: paymentMethod, frequency, next_due_date: nextDueDate });
      setAmount('');
      setDescription('');
      await load();
    } catch (error) {
      Alert.alert('Could not save rule', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 100 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h1">Recurring</Text>
        <ThemeToggle />
      </View>
      <Card style={{ gap: theme.spacing.md }}>
        <Text variant="h3">Add recurring expense</Text>
        <Input label="Amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <Select label="Category" value={categoryId} options={categoryOptions} onChange={setCategoryId} />
        <Select label="Frequency" value={frequency} options={frequencies} onChange={setFrequency} />
        <Input label="Next due date" value={nextDueDate} onChangeText={setNextDueDate} />
        <Select<PaymentMethod> label="Payment" value={paymentMethod} options={PAYMENT_METHODS.map((method) => ({ label: method, value: method }))} onChange={setPaymentMethod} />
        <Input label="Description" value={description} onChangeText={setDescription} />
        <Button title="Add Rule" icon={CalendarClock} loading={saving} onPress={addRule} />
      </Card>
      <Text variant="h2">Your rules</Text>
      {rules.map((rule) => (
        <Card key={rule.id} style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Text style={{ flex: 1 }} variant="h3">{rule.categories?.icon} {rule.description || rule.categories?.name || 'Expense'}</Text>
            <Button title="" variant="ghost" icon={Trash2} accessibilityLabel="Delete recurring rule" onPress={() => Alert.alert('Delete rule?', 'Future expenses will no longer be generated.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteRecurringRule(rule.id).then(load) }])} />
          </View>
          <Text muted>{rule.currency} {rule.amount} · {rule.frequency} · next {rule.next_due_date}</Text>
        </Card>
      ))}
      {!rules.length ? <Text muted>No recurring rules yet.</Text> : null}
    </ScrollView>
  );
}