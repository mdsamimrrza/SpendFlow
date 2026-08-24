import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { ArrowLeft, ImagePlus, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { CalendarModal } from '@/components/ui/CalendarModal';
import { Card } from '@/components/ui/Card';
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

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

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
      handleBack();
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
        {/* 1. TOP HEADER & BACK BUTTON */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={handleBack} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={20} color={theme.colors.text} />
            <Text variant="label" style={{ fontWeight: '600' }}>Back</Text>
          </Pressable>
          <Text variant="h3">{expenseId ? 'Edit Expense' : 'New Expense'}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* 2. HERO AMOUNT CARD (LEFT-ALIGNED CLEAN HERO DISPLAY) */}
        <Card style={{ gap: theme.spacing.xs, padding: theme.spacing.lg, alignItems: 'flex-start' }}>
          <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}>
            Amount ({form.currency})
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: theme.spacing.xs, width: '100%' }}>
            <Text variant="h1" style={{ fontSize: 32, lineHeight: 40, fontWeight: '700', color: theme.colors.primary }}>
              {form.currency}
            </Text>
            <TextInput
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              value={form.amount ? String(form.amount) : ''}
              onChangeText={(amount) => setForm((current) => ({ ...current, amount: Number(amount) }))}
              style={{
                flex: 1,
                fontSize: 36,
                lineHeight: 44,
                fontWeight: '700',
                color: theme.colors.text,
                padding: 0,
                margin: 0,
                textAlign: 'left',
              }}
            />
          </View>
        </Card>

        {/* 3. TRANSACTION DETAILS CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <Text variant="h3">Transaction Details</Text>

          <Select
            label="Category"
            value={form.category_id}
            options={categoryOptions}
            onChange={(category_id) => setForm((current) => ({ ...current, category_id }))}
          />

          <Select
            label="Currency"
            value={form.currency}
            options={CURRENCIES.map((currency) => ({ label: currency, value: currency }))}
            onChange={(currency) => setForm((current) => ({ ...current, currency }))}
          />

          {/* Payment Method Pill Selector */}
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" muted style={{ fontWeight: '600' }}>
              Payment Method
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              {PAYMENT_METHODS.map((method) => {
                const active = form.payment_method === method;
                return (
                  <Pressable
                    key={method}
                    onPress={() => setForm((current) => ({ ...current, payment_method: method as PaymentMethod }))}
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
                    <Text
                      variant="caption"
                      style={{
                        color: active ? (theme.isDark ? '#06201D' : '#FFFFFF') : theme.colors.text,
                        fontWeight: active ? '700' : '500',
                      }}
                    >
                      {method}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>

        {/* 4. DATE & TIME CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <Text variant="h3">Date & Time</Text>
          <Pressable onPress={() => setCalendarOpen(true)}>
            <Input
              label="Date"
              value={form.date}
              editable={false}
              pointerEvents="none"
              placeholder="YYYY-MM-DD"
            />
          </Pressable>

          <TimeInput
            label="Time"
            value={form.time}
            onChangeTime={(time) => setForm((current) => ({ ...current, time }))}
            onOpenModal={() => setTimePickerOpen(true)}
          />
        </Card>

        {/* 5. DESCRIPTION & NOTES CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <Text variant="h3">Description & Notes</Text>
          <Input
            label="Description (Optional)"
            placeholder="e.g. Lunch with team, Groceries"
            value={form.description ?? ''}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
          />
          <Input
            label="Notes (Optional)"
            placeholder="Add extra details..."
            multiline
            numberOfLines={3}
            value={form.notes ?? ''}
            onChangeText={(notes) => setForm((current) => ({ ...current, notes }))}
          />
        </Card>

        {/* 6. RECEIPT ATTACHMENT CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <Text variant="h3">Receipt Photo</Text>
          <Button
            title={form.receipt_image_url ? 'Change Receipt Photo' : 'Attach Receipt Photo'}
            variant="secondary"
            icon={ImagePlus}
            onPress={chooseReceipt}
          />

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
        </Card>

        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        {/* 7. ACTION BUTTONS */}
        <View style={{ gap: theme.spacing.md }}>
          <Button title={expenseId ? 'Save Changes' : 'Add Expense'} loading={saving} onPress={submit} />

          {expenseId ? (
            <Button
              title="Delete Expense"
              variant="destructive"
              icon={Trash2}
              onPress={() =>
                Alert.alert('Delete expense?', 'This expense will be soft deleted.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => softDeleteExpense(expenseId).then(() => handleBack()) },
                ])
              }
            />
          ) : null}
        </View>

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
    </KeyboardAvoidingView>
  );
}
