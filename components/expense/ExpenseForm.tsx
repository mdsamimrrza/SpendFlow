import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Calendar as CalendarIcon, Clock, ImagePlus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { CalendarModal } from '@/components/ui/CalendarModal';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { TimeInput } from '@/components/ui/TimeInput';
import { TimePickerModal } from '@/components/ui/TimePickerModal';
import { CURRENCIES, PAYMENT_METHODS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { getExpense, softDeleteExpense } from '@/services/expenses';
import { uploadReceipt } from '@/services/receipts';
import { Category, ExpenseInput, PaymentMethod } from '@/types';
import { currentFormattedTime, formatTimeForInput, isoDate, parseTimeInput } from '@/utils/format';

const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

const schema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  category_id: z.string().min(1, 'Choose a category.'),
  currency: z.string().min(3),
  description: z.string().optional(),
  date: z.string().min(10, 'Use YYYY-MM-DD.'),
  time: z
    .string()
    .optional()
    .refine(
      (val) => !val || timeRegex.test(val.trim()),
      { message: 'Time must be in format like 9:30 PM (or pick from the clock).' },
    ),
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);


  const [form, setForm] = useState<ExpenseInput>({
    amount: 0,
    category_id: '',
    currency: profile?.preferred_currency ?? 'NPR',
    description: '',
    date: isoDate(),
    time: currentFormattedTime(),
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

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ label: `${category.icon} ${category.name}`, value: category.id })),
    [categories],
  );

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

  async function pickImage(fromCamera = false) {
    setError(null);
    try {
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Camera permission is required to take a receipt photo.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted && permission.status !== 'granted') {
          setError('Photo library access is required to attach a receipt.');
          return;
        }
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            base64: true,
          });

      if (!result.canceled && result.assets[0] && profile?.id) {
        setSaving(true);
        try {
          const asset = result.assets[0];
          const url = await uploadReceipt(
            profile.id,
            asset.uri,
            asset.fileName,
            asset.mimeType,
            asset.base64,
          );
          setForm((current) => ({ ...current, receipt_image_url: url }));
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not upload receipt.');
        } finally {
          setSaving(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open image picker.');
    }
  }

  function chooseReceipt() {
    Alert.alert('Attach Receipt', 'Choose a receipt image source:', [
      { text: 'Cancel', style: 'cancel' },
      { text: '📷 Take Photo', onPress: () => pickImage(true) },
      { text: '🖼️ Choose from Gallery', onPress: () => pickImage(false) },
    ]);
  }


  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 80 }}
    >
      <Text variant="h1">{expenseId ? 'Edit Expense' : 'Add Expense'}</Text>
      <Input
        label="Amount"
        keyboardType="decimal-pad"
        value={form.amount ? String(form.amount) : ''}
        onChangeText={(amount) => setForm((current) => ({ ...current, amount: Number(amount) }))}
      />
      <Select label="Category" value={form.category_id} options={categoryOptions} onChange={(category_id) => setForm((current) => ({ ...current, category_id }))} />
      <Select label="Currency" value={form.currency} options={CURRENCIES.map((currency) => ({ label: currency, value: currency }))} onChange={(currency) => setForm((current) => ({ ...current, currency }))} />

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        {/* Date Selector */}
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => setCalendarOpen(true)}>
            <Input
              label="Date"
              value={form.date}
              editable={false}
              pointerEvents="none"
              placeholder="YYYY-MM-DD"
            />
          </Pressable>
        </View>

        {/* Time Selector */}
        <View style={{ flex: 1 }}>
          <TimeInput
            label="Time"
            value={form.time}
            onChangeTime={(time) => setForm((current) => ({ ...current, time }))}
            onOpenModal={() => setTimePickerOpen(true)}
          />
        </View>
      </View>


      <Select<PaymentMethod> label="Payment" value={form.payment_method} options={PAYMENT_METHODS.map((method) => ({ label: method, value: method }))} onChange={(payment_method) => setForm((current) => ({ ...current, payment_method }))} />
      <Input label="Description" value={form.description ?? ''} onChangeText={(description) => setForm((current) => ({ ...current, description }))} />
      <Input label="Notes" multiline value={form.notes ?? ''} onChangeText={(notes) => setForm((current) => ({ ...current, notes }))} />
      <Button title={form.receipt_image_url ? 'Change Receipt' : 'Attach Receipt'} variant="secondary" icon={ImagePlus} onPress={chooseReceipt} />

      {form.receipt_image_url ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View full screen receipt"
          onPress={() => setImageViewerOpen(true)}
          style={{
            position: 'relative',
            borderRadius: theme.radius.md,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Image
            source={{ uri: form.receipt_image_url }}
            style={{ width: '100%', height: 200, backgroundColor: theme.colors.surfaceElevated }}
            resizeMode="cover"
          />
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
              🔍 Tap for Full Screen
            </Text>
          </View>
        </Pressable>
      ) : null}

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

      {/* Date Picker Modal */}
      <CalendarModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onApply={(range) => {
          if (range.startDate) {
            setForm((current) => ({ ...current, date: range.startDate! }));
          }
        }}
        initialRange={{ startDate: form.date, endDate: form.date }}
      />

      {/* Time Picker Modal */}
      <TimePickerModal
        visible={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        onSelect={(selectedTime) => {
          setForm((current) => ({ ...current, time: selectedTime }));
        }}
        initialTime={form.time}
      />

      {/* Full Screen Image Viewer Modal */}
      <ImageViewerModal
        visible={imageViewerOpen}
        imageUrl={form.receipt_image_url ?? null}
        onClose={() => setImageViewerOpen(false)}
        onRemove={() => setForm((c) => ({ ...c, receipt_image_url: null }))}
      />
    </ScrollView>
  );
}



