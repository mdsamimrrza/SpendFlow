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
import { useLanguage } from '@/hooks/useLanguage';
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
  const { t } = useLanguage();
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

  const [rawAmount, setRawAmount] = useState('');

  useEffect(() => {
    if (!profile?.id) return;
    listCategories(profile.id).then((nextCategories) => {
      setCategories(nextCategories);
      if (!expenseId && nextCategories[0]) {
        setForm((current) => ({ ...current, category_id: nextCategories[0].id }));
      }
    });
  }, [expenseId, profile?.id]);

  useEffect(() => {
    if (!expenseId) return;
    getExpense(expenseId).then((expense) => {
      if (expense) {
        setForm({
          amount: Number(expense.amount),
          category_id: expense.category_id,
          currency: expense.currency,
          description: expense.description ?? '',
          date: expense.date,
          time: formatTimeForInput(expense.time),
          payment_method: expense.payment_method,
          notes: expense.notes ?? '',
          receipt_image_url: expense.receipt_image_url,
        });
        setRawAmount(String(expense.amount));
      }
    });
  }, [expenseId]);

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ label: `${category.icon} ${category.name}`, value: category.id })),
    [categories],
  );

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  function handleAmountChange(text: string) {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
    setRawAmount(sanitized);
    setForm((current) => ({ ...current, amount: sanitized ? Number(sanitized) : 0 }));
  }

  async function chooseReceipt() {
    Alert.alert(t('expense_attach_receipt'), '', [
      { text: t('expense_take_photo'), onPress: () => pickImage(true) },
      { text: t('expense_choose_photo'), onPress: () => pickImage(false) },
      { text: t('common_cancel'), style: 'cancel' },
    ]);
  }

  async function pickImage(fromCamera: boolean) {
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
          try {
            const url = await uploadReceipt(
              profile.id,
              asset.uri,
              asset.fileName,
              asset.mimeType,
              asset.base64,
            );
            setForm((current) => ({ ...current, receipt_image_url: url }));
          } catch {
            // Offline fallback: Store local device URI so receipt is attached seamlessly offline
            setForm((current) => ({ ...current, receipt_image_url: asset.uri }));
          }
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common_error'));
        } finally {
          setSaving(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common_error'));
    }
  }

  async function submit() {
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid expense form data.');
      return;
    }
    setSaving(true);
    try {
      const payloadToSave: ExpenseInput = {
        ...parsed.data,
        time: parseTimeInput(parsed.data.time),
      };

      await expenses.save(payloadToSave, expenseId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      handleBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common_error'));
    } finally {
      setSaving(false);
    }
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common_back')}
            onPress={handleBack}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <ArrowLeft size={20} color={theme.colors.text} />
          </Pressable>
          <Text variant="h2">{expenseId ? t('expense_edit_title') : t('expense_add_title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* 2. AMOUNT HERO INPUT CARD */}
        <Card style={{ padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}>
            {t('expense_amount')} ({form.currency})
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <TextInput
              value={rawAmount}
              onChangeText={handleAmountChange}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="numeric"
              autoFocus={!expenseId}
              style={{
                fontSize: 44,
                fontWeight: '800',
                color: theme.colors.primary,
                textAlign: 'center',
                minWidth: 140,
                paddingVertical: 4,
              }}
            />
          </View>
        </Card>

        {/* 3. CORE DETAILS CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <Select
            label={t('expense_category')}
            value={form.category_id}
            options={categoryOptions}
            onChange={(category_id) => setForm((current) => ({ ...current, category_id }))}
          />

          <Select
            label={t('settings_currency')}
            value={form.currency}
            options={CURRENCIES.map((currency) => ({ label: currency, value: currency }))}
            onChange={(currency) => setForm((current) => ({ ...current, currency }))}
          />

          {/* Payment Method Pill Selector */}
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" muted style={{ fontWeight: '600' }}>
              {t('expense_payment_method')}
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
          <Text variant="h3">{t('expense_date')} & {t('expense_time')}</Text>
          <Pressable onPress={() => setCalendarOpen(true)}>
            <Input
              label={t('expense_date')}
              value={form.date}
              editable={false}
              pointerEvents="none"
              placeholder="YYYY-MM-DD"
            />
          </Pressable>

          <TimeInput
            label={t('expense_time')}
            value={form.time}
            onChangeTime={(time) => setForm((current) => ({ ...current, time }))}
            onOpenModal={() => setTimePickerOpen(true)}
          />
        </Card>

        {/* 5. DESCRIPTION & NOTES CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <Text variant="h3">{t('expense_description')} & {t('expense_notes')}</Text>
          <Input
            label={`${t('expense_description')} (${t('expense_notes_placeholder').slice(0, 8)})`}
            placeholder={t('expense_description_placeholder')}
            value={form.description ?? ''}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
          />
          <Input
            label={t('expense_notes')}
            placeholder={t('expense_notes_placeholder')}
            multiline
            numberOfLines={3}
            value={form.notes ?? ''}
            onChangeText={(notes) => setForm((current) => ({ ...current, notes }))}
          />
        </Card>

        {/* 6. RECEIPT ATTACHMENT CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <Text variant="h3">{t('expense_receipt')}</Text>
          <Button
            title={form.receipt_image_url ? t('expense_attach_receipt') : t('expense_attach_receipt')}
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
          <Button title={expenseId ? t('expense_update') : t('expense_save')} loading={saving} onPress={submit} />

          {expenseId ? (
            <Button
              title={t('expense_delete')}
              variant="destructive"
              icon={Trash2}
              onPress={() =>
                Alert.alert(t('expense_delete'), t('expense_delete_confirm'), [
                  { text: t('common_cancel'), style: 'cancel' },
                  { text: t('common_delete'), style: 'destructive', onPress: () => softDeleteExpense(expenseId).then(() => handleBack()) },
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
