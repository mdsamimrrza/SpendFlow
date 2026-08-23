import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Image, Alert, ScrollView, View } from 'react-native';
import { ImagePlus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { CURRENCIES, PAYMENT_METHODS } from '@/constants/app';
import { listCategories } from '@/services/categories';
import { uploadReceipt } from '@/services/receipts';
import { getExpense, softDeleteExpense } from '@/services/expenses';
import { Category, ExpenseInput, PaymentMethod } from '@/types';
import { formatTimeForInput, isoDate, parseTimeInput } from '@/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';

const schema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  category_id: z.string().min(1, 'Choose a category.'),
  currency: z.string().min(3),
  description: z.string().optional(),
  date: z.string().min(10, 'Use YYYY-MM-DD.'),
  time: z.string().optional(),
  payment_method: z.enum(['Cash', 'Card', 'UPI', 'Other']),
  notes: z.string().optional(),
  receipt_image_url: z.string().nullable().optional(),
});

export function ExpenseForm({ expenseId }: { expenseId?: string }) {
  const { profile } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const expenses = useExpenses(profile?.id);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ExpenseInput>({
    amount: 0,
    category_id: '',
    currency: profile?.preferred_currency ?? 'NPR',
    description: '',
    date: isoDate(),
    time: '',
    payment_method: 'Cash',
    notes: '',
    receipt_image_url: null,
  });

  useEffect(() => {
    if (!profile?.id) return;
    listCategories(profile.id).then((rows) => {
      setCategories(rows);
      setForm((current) => ({ ...current, category_id: current.category_id || rows[0]?.id || '' }));
    });
  }, [profile?.id]);

  useEffect(() => {
    if (!expenseId) return;
    getExpense(expenseId).then((expense) =>
      setForm({
        amount: Number(expense.amount),
        category_id: expense.category_id,
        currency: expense.currency,
        description: expense.description,
        date: expense.date,
        time: formatTimeForInput(expense.time),
        payment_method: expense.payment_method,
        notes: expense.notes,
        receipt_image_url: expense.receipt_image_url,
      }),
    );
  }, [expenseId]);

  const categoryOptions = useMemo(() => categories.map((category) => ({ label: `${category.icon} ${category.name}`, value: category.id })), [categories]);

  async function submit() {
    setSaving(true);
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form.');
      setSaving(false);
      return;
    }
    try {
      await expenses.save({ ...parsed.data, time: parseTimeInput(parsed.data.time) }, expenseId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save expense.');
    } finally {
      setSaving(false);
    }
  }

  async function chooseReceipt() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is required to attach a receipt.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0] && profile?.id) {
      setSaving(true);
      try {
        const asset = result.assets[0];
        const url = await uploadReceipt(profile.id, asset.uri, asset.fileName, asset.mimeType);
        setForm((current) => ({ ...current, receipt_image_url: url }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not upload receipt.');
      } finally {
        setSaving(false);
      }
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 80 }}>
      <Text variant="h1">{expenseId ? 'Edit Expense' : 'Add Expense'}</Text>
      <Input label="Amount" keyboardType="decimal-pad" value={form.amount ? String(form.amount) : ''} onChangeText={(amount) => setForm((current) => ({ ...current, amount: Number(amount) }))} />
      <Select label="Category" value={form.category_id} options={categoryOptions} onChange={(category_id) => setForm((current) => ({ ...current, category_id }))} />
      <Select label="Currency" value={form.currency} options={CURRENCIES.map((currency) => ({ label: currency, value: currency }))} onChange={(currency) => setForm((current) => ({ ...current, currency }))} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input label="Date" value={form.date} onChangeText={(date) => setForm((current) => ({ ...current, date }))} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Time" placeholder="9:30 PM" autoCapitalize="characters" value={form.time ?? ''} onChangeText={(time) => setForm((current) => ({ ...current, time }))} />
        </View>
      </View>
      <Select<PaymentMethod> label="Payment" value={form.payment_method} options={PAYMENT_METHODS.map((method) => ({ label: method, value: method }))} onChange={(payment_method) => setForm((current) => ({ ...current, payment_method }))} />
      <Input label="Description" value={form.description ?? ''} onChangeText={(description) => setForm((current) => ({ ...current, description }))} />
      <Input label="Notes" multiline value={form.notes ?? ''} onChangeText={(notes) => setForm((current) => ({ ...current, notes }))} />
      <Button title={form.receipt_image_url ? 'Receipt attached' : 'Attach Receipt'} variant="secondary" icon={ImagePlus} onPress={chooseReceipt} />
      {form.receipt_image_url ? <Image source={{ uri: form.receipt_image_url }} style={{ width: '100%', height: 180, borderRadius: theme.radius.md }} resizeMode="cover" /> : null}
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Button title={expenseId ? 'Save Changes' : 'Add Expense'} loading={saving} onPress={submit} />
      {expenseId ? (
        <Button
          title="Delete Expense"
          variant="destructive"
          onPress={() =>
            Alert.alert('Delete expense?', 'This expense will be soft deleted.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => softDeleteExpense(expenseId).then(() => router.back()) },
            ])
          }
        />
      ) : null}
    </ScrollView>
  );
}
