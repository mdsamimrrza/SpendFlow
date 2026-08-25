import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  Sparkles,
  Tag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { CalendarModal } from '@/components/ui/CalendarModal';
import { Card } from '@/components/ui/Card';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/ui/PressableScale';
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
import { currentFormattedTime, formatMoney, formatTimeForInput, isoDate, parseTimeInput } from '@/utils/format';

const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

const schema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  category_id: z.string().min(1, 'Please select a category.'),
  currency: z.string().min(3),
  description: z.string().optional(),
  date: z.string().min(10, 'Use YYYY-MM-DD.'),
  time: z
    .string()
    .optional()
    .refine(
      (val) => !val || timeRegex.test(val.trim()),
      { message: 'Time must be in format like 9:30 PM.' },
    ),
  payment_method: z.enum(['Cash', 'Card', 'UPI', 'Other']),
  notes: z.string().optional(),
  receipt_image_url: z.string().nullable().optional(),
});

const QUICK_TAGS = ['Lunch', 'Coffee', 'Groceries', 'Fuel', 'Uber / Ride', 'Dinner', 'Medicine', 'Utilities'];

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
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);

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

  function handleAddQuickAmount(inc: number) {
    const current = rawAmount ? Number(rawAmount) : 0;
    const next = String(current + inc);
    setRawAmount(next);
    setForm((prev) => ({ ...prev, amount: Number(next) }));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
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

  const selectedCategory = categories.find((c) => c.id === form.category_id);

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
        {/* ── 1. APP BAR HEADER ── */}
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

          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text
              variant="caption"
              muted
              numberOfLines={1}
              style={{
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                fontSize: 10,
              }}
            >
              Transaction Entry
            </Text>
            <Text variant="h2" numberOfLines={1} style={{ fontWeight: '800', fontSize: 18 }}>
              {expenseId ? t('expense_edit_title') || 'Edit Expense' : t('expense_add_title') || 'Add Expense'}
            </Text>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* ── 2. HERO AMOUNT & CURRENCY DISPLAY CARD ── */}
        <Card
          style={{
            padding: theme.spacing.lg,
            gap: 12,
            backgroundColor: theme.isDark ? '#111827' : '#EEF2FF',
            borderWidth: 2,
            borderColor: theme.colors.primary,
          }}
        >
          {/* Currency Dropdown on Top-Right */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: theme.colors.primary, fontSize: 11 }}>
              Enter Total Amount
            </Text>

            <PressableScale
              onPress={() => setCurrencyModalOpen(true)}
              activeScale={0.93}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: theme.radius.full,
                backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)',
                borderWidth: 1.5,
                borderColor: theme.colors.primary,
              }}
            >
              <Text style={{ fontWeight: '800', color: theme.colors.primary, fontSize: 12 }}>
                {form.currency}
              </Text>
              <ChevronDown size={14} color={theme.colors.primary} />
            </PressableScale>
          </View>

          {/* Huge Numeric Display */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Text
              style={{
                fontSize: 32,
                fontWeight: '900',
                color: theme.colors.primary,
              }}
            >
              {form.currency}
            </Text>
            <TextInput
              placeholder="0.00"
              placeholderTextColor={theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}
              keyboardType="numeric"
              autoFocus={!expenseId}
              value={rawAmount}
              onChangeText={handleAmountChange}
              style={{
                fontSize: 38,
                fontWeight: '900',
                color: theme.colors.text,
                paddingVertical: 0,
                minWidth: 100,
                textAlign: 'center',
              }}
            />
            {rawAmount ? (
              <Pressable
                onPress={() => {
                  setRawAmount('');
                  setForm((prev) => ({ ...prev, amount: 0 }));
                }}
                hitSlop={8}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 4,
                }}
              >
                <X size={15} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Quick Increment Presets */}
          <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[100, 500, 1000, 5000].map((inc) => (
              <PressableScale
                key={inc}
                activeScale={0.92}
                onPress={() => handleAddQuickAmount(inc)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text variant="caption" style={{ fontWeight: '800', color: theme.colors.text }}>
                  +{formatMoney(inc, form.currency)}
                </Text>
              </PressableScale>
            ))}
          </View>
        </Card>

        {/* ── 3. CATEGORY SELECTOR (INTERACTIVE GRID CHIPS) ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Tag size={16} color={theme.colors.primary} />
              <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
                {t('expense_category') || 'Select Category'}
              </Text>
            </View>

            {selectedCategory ? (
              <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary }}>
                {selectedCategory.icon} {selectedCategory.name}
              </Text>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {categories.map((cat) => {
              const isSelected = form.category_id === cat.id;
              return (
                <PressableScale
                  key={cat.id}
                  activeScale={0.93}
                  onPress={() => {
                    setForm((prev) => ({ ...prev, category_id: cat.id }));
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: theme.radius.lg,
                    borderWidth: 2,
                    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: isSelected
                      ? (theme.isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)')
                      : theme.colors.surfaceElevated,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    minWidth: 80,
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: isSelected ? '800' : '600',
                      color: isSelected ? theme.colors.primary : theme.colors.text,
                    }}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </Card>

        {/* ── 4. DESCRIPTION & QUICK TAGS CARD ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <FileText size={16} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
              {t('expense_description') || 'Title / Note'}
            </Text>
          </View>

          <Input
            placeholder={t('expense_description_placeholder') || 'e.g. Starbucks Cafe, Grocery Mart'}
            value={form.description ?? ''}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
          />

          {/* Quick Tag Pills */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {QUICK_TAGS.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => {
                  setForm((prev) => ({ ...prev, description: tag }));
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text variant="caption" style={{ fontWeight: '600', color: theme.colors.text }}>
                  {tag}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* ── 5. DATE & TIME SYNCHRONIZER ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Calendar size={16} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
              {t('expense_date') || 'Date'} & {t('expense_time') || 'Time'}
            </Text>
          </View>

          {/* Date Picker Button */}
          <Pressable
            onPress={() => setCalendarOpen(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 12,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} color={theme.colors.primary} />
              <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.text }}>
                {form.date}
              </Text>
            </View>

            <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              Change Date 📅
            </Text>
          </Pressable>

          {/* Manual Time Typing + Clock Picker Toggle */}
          <TimeInput
            label={t('expense_time') || 'Time (Type or Tap ⏰)'}
            value={form.time}
            onChangeTime={(time) => setForm((current) => ({ ...current, time }))}
            onOpenModal={() => setTimePickerOpen(true)}
          />
        </Card>

        {/* ── 6. PAYMENT METHOD SELECTOR ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CreditCard size={16} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
              {t('expense_payment_method') || 'Payment Channel'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'Cash', icon: '💵', label: 'Cash' },
              { key: 'Card', icon: '💳', label: 'Card' },
              { key: 'UPI', icon: '📱', label: 'UPI / Online' },
              { key: 'Other', icon: '🪙', label: 'Other' },
            ].map((pm) => {
              const isActive = form.payment_method === pm.key;
              return (
                <Pressable
                  key={pm.key}
                  onPress={() => {
                    setForm((prev) => ({ ...prev, payment_method: pm.key as PaymentMethod }));
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: theme.radius.md,
                    borderWidth: 1.5,
                    borderColor: isActive ? theme.colors.primary : theme.colors.border,
                    backgroundColor: isActive
                      ? (theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)')
                      : theme.colors.surfaceElevated,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                  }}
                >
                  <Text style={{ fontSize: 16 }}>{pm.icon}</Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: isActive ? '800' : '600',
                      color: isActive ? theme.colors.primary : theme.colors.text,
                    }}
                    numberOfLines={1}
                  >
                    {pm.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* ── 7. RECEIPT & BILL ATTACHMENT STUDIO ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Camera size={16} color={theme.colors.primary} />
              <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
                {t('expense_receipt') || 'Bill / Receipt Attachment'}
              </Text>
            </View>

            {form.receipt_image_url ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.success,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>
                  Attached 🟢
                </Text>
              </View>
            ) : null}
          </View>

          {/* Action Buttons: Camera & Gallery */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => pickImage(true)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 12,
                borderRadius: theme.radius.md,
                backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)',
                borderWidth: 1,
                borderColor: theme.colors.primary,
              }}
            >
              <Camera size={16} color={theme.colors.primary} />
              <Text variant="caption" style={{ fontWeight: '800', color: theme.colors.primary }}>
                {t('expense_take_photo') || 'Snap Camera'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => pickImage(false)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 12,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <ImageIcon size={16} color={theme.colors.text} />
              <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>
                {t('expense_choose_photo') || 'Pick Photo'}
              </Text>
            </Pressable>
          </View>

          {/* Receipt Preview with Zoom and Delete */}
          {form.receipt_image_url ? (
            <View style={{ position: 'relative', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
              <Pressable onPress={() => setImageViewerOpen(true)}>
                <Image
                  source={{ uri: form.receipt_image_url }}
                  style={{ width: '100%', height: 180, backgroundColor: theme.colors.surfaceElevated }}
                  resizeMode="cover"
                />
              </Pressable>

              <View
                style={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: theme.radius.sm,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                  🔍 Tap for Full Screen
                </Text>
              </View>

              <Pressable
                onPress={() => setForm((prev) => ({ ...prev, receipt_image_url: null }))}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: 'rgba(239, 68, 68, 0.9)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}
        </Card>

        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: theme.radius.md,
              backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.3)',
            }}
          >
            <AlertCircle size={18} color={theme.colors.danger} />
            <Text style={{ color: theme.colors.danger, fontWeight: '700', fontSize: 13, flex: 1 }}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* ── 8. SUBMIT & DELETE CTA BUTTONS ── */}
        <View style={{ gap: 10, marginTop: 4 }}>
          <Button
            title={expenseId ? t('expense_update') || 'Update Expense' : t('expense_save') || 'Save Expense'}
            loading={saving}
            onPress={submit}
            style={{ height: 52 }}
          />

          {expenseId ? (
            <Button
              title={t('expense_delete') || 'Delete Expense'}
              variant="destructive"
              icon={Trash2}
              onPress={() =>
                Alert.alert(t('expense_delete') || 'Delete Expense', t('expense_delete_confirm') || 'Are you sure you want to delete this expense?', [
                  { text: t('common_cancel') || 'Cancel', style: 'cancel' },
                  { text: t('common_delete') || 'Delete', style: 'destructive', onPress: () => softDeleteExpense(expenseId).then(() => handleBack()) },
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
          onSelect={(selectedTime: string) => {
            setForm((current) => ({ ...current, time: selectedTime }));
          }}
          initialTime={form.time}
        />

        {/* Full-Screen Image Viewer Modal */}
        <ImageViewerModal
          visible={imageViewerOpen}
          onClose={() => setImageViewerOpen(false)}
          imageUrl={form.receipt_image_url || null}
        />

        {/* Currency Selection Dropdown Modal */}
        <Modal
          visible={currencyModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCurrencyModalOpen(false)}
        >
          <Pressable
            onPress={() => setCurrencyModalOpen(false)}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 340,
                backgroundColor: theme.colors.surface,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 18,
                gap: 12,
                elevation: 10,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: 10 }}>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800' }}>
                    Select Currency
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Set transaction denomination
                  </Text>
                </View>

                <Pressable
                  onPress={() => setCurrencyModalOpen(false)}
                  hitSlop={8}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: theme.colors.surfaceElevated,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={15} color={theme.colors.text} />
                </Pressable>
              </View>

              <View style={{ gap: 6 }}>
                {[
                  { code: 'NPR', flag: '🇳🇵', name: 'Nepalese Rupee', symbol: 'Rs' },
                  { code: 'INR', flag: '🇮🇳', name: 'Indian Rupee', symbol: '₹' },
                  { code: 'USD', flag: '🇺🇸', name: 'US Dollar', symbol: '$' },
                  { code: 'EUR', flag: '🇪🇺', name: 'Euro', symbol: '€' },
                  { code: 'GBP', flag: '🇬🇧', name: 'British Pound', symbol: '£' },
                ].map((cur) => {
                  const isSelected = form.currency === cur.code;
                  return (
                    <Pressable
                      key={cur.code}
                      onPress={() => {
                        setForm((prev) => ({ ...prev, currency: cur.code }));
                        setCurrencyModalOpen(false);
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: theme.radius.md,
                        backgroundColor: isSelected
                          ? (theme.isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)')
                          : theme.colors.surfaceElevated,
                        borderWidth: 1.5,
                        borderColor: isSelected ? theme.colors.primary : 'transparent',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 20 }}>{cur.flag}</Text>
                        <View>
                          <Text style={{ fontWeight: '800', fontSize: 13, color: isSelected ? theme.colors.primary : theme.colors.text }}>
                            {cur.code} ({cur.symbol})
                          </Text>
                          <Text variant="caption" muted style={{ fontSize: 11 }}>
                            {cur.name}
                          </Text>
                        </View>
                      </View>

                      {isSelected ? (
                        <Check size={16} color={theme.colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
