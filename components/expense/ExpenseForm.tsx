import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Edit3,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import { z } from 'zod';
import { AccountManageModal } from '@/components/account/AccountManageModal';
import { Button } from '@/components/ui/Button';
import { CalendarModal } from '@/components/ui/CalendarModal';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CategoryManageModal } from '@/components/category/CategoryManageModal';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { CURRENCIES, PAYMENT_METHODS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { notifyExpensesChanged, useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { computeAccountBalances, listBankAccounts, seedDefaultAccounts } from '@/services/bankAccounts';
import { listCategories } from '@/services/categories';
import { getExpense, softDeleteExpense } from '@/services/expenses';
import { uploadReceipt } from '@/services/receipts';
import { BankAccount, Category, ExpenseInput, PaymentMethod, TransactionType } from '@/types';
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
  bank_account_id: z.string().nullable().optional(),
  notes: z.string().optional(),
  receipt_image_url: z.string().nullable().optional(),
  type: z.enum(['expense', 'income']).default('expense'),
});

const EXPENSE_QUICK_TAGS = ['Lunch', 'Coffee', 'Groceries', 'Fuel', 'Uber / Ride', 'Dinner', 'Medicine', 'Utilities'];
const INCOME_QUICK_TAGS = ['Salary', 'Freelance Project', 'Dividend', 'Rental Income', 'Bonus', 'Cashback', 'Client Payment'];

export function ExpenseForm({ expenseId }: { expenseId?: string }) {
  const { profile, session } = useAuth();
  const userId = profile?.id ?? session?.user?.id;
  const { t } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isCompactScreen = screenWidth < 380;
  const expenses = useExpenses(userId);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [paymentDropdownOpen, setPaymentDropdownOpen] = useState(false);
  const [insufficientBalance, setInsufficientBalance] = useState<{
    accountName: string;
    accountIcon?: string;
    accountColor?: string;
    available: number;
    required: number;
    shortfall: number;
    currency: string;
  } | null>(null);

  const [form, setForm] = useState<ExpenseInput>({
    amount: 0,
    category_id: '',
    currency: profile?.preferred_currency ?? 'NPR',
    description: '',
    date: isoDate(),
    time: currentFormattedTime(),
    payment_method: 'Cash',
    bank_account_id: null,
    notes: '',
    receipt_image_url: null,
    type: 'expense',
  });

  const [rawAmount, setRawAmount] = useState('');
  const currencyManuallySelected = useRef(false);

  // Derive live balances for each account from initial_balance + all loaded transactions.
  // Used both for the balance guard in submit() and for display on account chips.
  const accountLiveBalances = useMemo(
    () => computeAccountBalances(accounts, expenses.items),
    [accounts, expenses.items],
  );

  // Account picker rows ordered by live balance: highest first, lowest last.
  const accountsByBalanceDesc = useMemo(
    () =>
      [...accounts].sort((a, b) => {
        const bal = (id: string) =>
          accountLiveBalances.find((x) => x.id === id)?.live_balance ?? 0;
        return bal(b.id) - bal(a.id);
      }),
    [accounts, accountLiveBalances],
  );

  // Profile hydration can finish after this screen mounts while offline. Apply the
  // cached preferred currency once, but never overwrite a currency the user picked.
  useEffect(() => {
    if (!expenseId && profile?.preferred_currency && !currencyManuallySelected.current) {
      setForm((current) => ({ ...current, currency: profile.preferred_currency }));
    }
  }, [expenseId, profile?.preferred_currency]);

  const loadCategories = async () => {
    if (!userId) return [];
    const nextCategories = await listCategories(userId);
    setCategories(nextCategories);
    return nextCategories;
  };

  const loadAccounts = async (autoSelectNewest = false) => {
    if (!userId) return [];
    let nextAccounts = await listBankAccounts(userId);
    if (nextAccounts.length === 0) {
      nextAccounts = await seedDefaultAccounts(userId, profile?.preferred_currency || 'NPR');
    }
    setAccounts(nextAccounts);
    if (autoSelectNewest && nextAccounts.length > 0) {
      const newest = nextAccounts[nextAccounts.length - 1];
      if (newest) {
        setForm((prev) => ({ ...prev, bank_account_id: newest.id }));
      }
    } else if (!form.bank_account_id && nextAccounts.length > 0) {
      const def = nextAccounts.find((a) => a.is_default) || nextAccounts[0];
      setForm((prev) => ({ ...prev, bank_account_id: def.id }));
    }
    return nextAccounts;
  };

  useEffect(() => {
    if (!userId) return;
    loadCategories().then((nextCategories) => {
      if (nextCategories && !expenseId && nextCategories[0]) {
        const firstCat = nextCategories.find((c) => (form.type === 'income' ? c.type === 'income' : c.type !== 'income')) ?? nextCategories[0];
        setForm((current) => ({ ...current, category_id: firstCat.id }));
      }
    });

    loadAccounts().then((nextAccounts) => {
      if (nextAccounts && !expenseId && nextAccounts.length > 0 && !form.bank_account_id) {
        const def = nextAccounts.find((a) => a.is_default) || nextAccounts[0];
        setForm((prev) => ({ ...prev, bank_account_id: def.id }));
      }
    });
  }, [expenseId, userId]);

  useEffect(() => {
    if (!expenseId) return;
    getExpense(expenseId)
      .then((expense) => {
        setForm({
          amount: Number(expense.amount),
          category_id: expense.category_id,
          currency: expense.currency,
          description: expense.description ?? '',
          date: expense.date,
          time: formatTimeForInput(expense.time),
          payment_method: expense.payment_method,
          bank_account_id: expense.bank_account_id ?? null,
          notes: expense.notes ?? '',
          receipt_image_url: expense.receipt_image_url,
          type: expense.type || 'expense',
        });
        setRawAmount(String(expense.amount));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this expense.'));
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

  // ── 12-hour numeric time entry helpers ──
  // Initialize from the current time already stored in form.time so the boxes
  // are pre-filled when the form opens in add-mode.
  const initTimeMatch = (form.time || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const [minuteRaw, setMinuteRaw] = useState(() => initTimeMatch ? initTimeMatch[2] : '');
  const [hourRaw, setHourRaw]     = useState(() => initTimeMatch ? initTimeMatch[1] : '');
  const hourInputRef = useRef<TextInput | null>(null);
  const minuteInputRef = useRef<TextInput | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const accountCardY = useRef<number>(0);
  const timeMatch = (form.time || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const timePeriod = (timeMatch ? timeMatch[3].toUpperCase() : 'PM') as 'AM' | 'PM';

  function updateTimeParts(hour?: string, minute?: string, period?: 'AM' | 'PM') {
    setForm((current) => {
      const m = (current.time || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      const h = hour ?? (m ? m[1] : '12');
      const min = minute ?? (m ? m[2] : '00');
      const p = (period ?? (m ? (m[3].toUpperCase() as 'AM' | 'PM') : 'PM'));
      return { ...current, time: `${h}:${min} ${p}` };
    });
  }

  function focusMinuteAndSelect() {
    minuteInputRef.current?.focus();
    const len = minuteRaw.length;
    requestAnimationFrame(() => minuteInputRef.current?.setSelection?.(0, len));
  }

  function handleHourInput(text: string) {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setHourRaw(digits);
    if (!digits) return; // emptied by backspace — stays empty, no auto-refill
    const val = parseInt(digits, 10);
    if (val === 0) { setHourRaw('1'); updateTimeParts('1'); return; }

    // 24-hour input → convert to 12-hour automatically
    // e.g. 13 → 1 PM, 17 → 5 PM, 23 → 11 PM, 12 → 12 PM, 0 → 12 AM
    if (val >= 13 && val <= 23) {
      const h12 = String(val - 12);
      setHourRaw(h12);
      updateTimeParts(h12, undefined, 'PM');
      focusMinuteAndSelect();
      return;
    }
    if (val === 24) {
      setHourRaw('12');
      updateTimeParts('12', undefined, 'AM');
      focusMinuteAndSelect();
      return;
    }

    if (val > 12) {
      // Shouldn't be reachable after above guards, but keep as safe fallback:
      // retain first digit and move on
      setHourRaw(digits.slice(0, 1));
      updateTimeParts(digits.slice(0, 1));
      focusMinuteAndSelect();
      return;
    }
    updateTimeParts(digits);
    // Hour complete (two digits, or single digit 2-9) — auto-advance
    if (digits.length === 2 || val > 1) focusMinuteAndSelect();
  }

  function handleMinuteInput(text: string) {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setMinuteRaw(digits);
    if (!digits) return; // emptied by backspace — stays empty
    const val = parseInt(digits, 10);
    updateTimeParts(undefined, String(Math.min(val, 59)).padStart(2, '0'));
  }

  function handleMinuteBackspace() {
    // Backspace on an empty minute field — jump back to the hour field
    if (!minuteRaw) {
      hourInputRef.current?.focus();
      const len = hourRaw.length;
      requestAnimationFrame(() => hourInputRef.current?.setSelection?.(0, len));
    }
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

    const txType = form.type ?? 'expense';
    const amount = Number(parsed.data.amount);
    const selectedAccountId = parsed.data.bank_account_id ?? null;

    // ── Insufficient-balance guard (expenses only) ──────────────────────────
    // Income always adds money — no cap needed.
    // Skip check for Cash payment with no linked account.
    if (txType === 'expense' && selectedAccountId) {
      const accountWithBalance = accountLiveBalances.find((a) => a.id === selectedAccountId);
      if (accountWithBalance) {
        let availableBalance = accountWithBalance.live_balance;

        // In edit mode the original expense is already baked into the live balance
        // (it has already been deducted). Add it back so we're comparing against
        // the balance as if this transaction hadn't been recorded yet.
        if (expenseId) {
          const original = expenses.items.find((e) => e.id === expenseId);
          if (original && original.bank_account_id === selectedAccountId && original.type === 'expense') {
            availableBalance += Number(original.amount);
          }
        }

        if (amount > availableBalance) {
          const shortfall = amount - availableBalance;
          setInsufficientBalance({
            accountName: accountWithBalance.name,
            accountIcon: accountWithBalance.icon,
            accountColor: accountWithBalance.color,
            available: availableBalance,
            required: amount,
            shortfall,
            currency: accountWithBalance.currency,
          });
          return;
        }
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    setSaving(true);
    try {
      const payloadToSave: ExpenseInput = {
        ...parsed.data,
        type: txType,
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
  const txType = form.type ?? 'expense';
  const isIncome = txType === 'income';
  const isAnyDropdownOpen = categoryDropdownOpen || accountDropdownOpen || paymentDropdownOpen;

  const closeAllDropdowns = () => {
    if (categoryDropdownOpen) setCategoryDropdownOpen(false);
    if (accountDropdownOpen) setAccountDropdownOpen(false);
    if (paymentDropdownOpen) setPaymentDropdownOpen(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={closeAllDropdowns}
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
              {expenseId
                ? (form.type === 'income' ? 'Edit Income' : 'Edit Expense')
                : (form.type === 'income' ? 'Add Income' : 'Add Expense')}
            </Text>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* ── TRANSACTION TYPE TOGGLE (EXPENSE VS INCOME) ── */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.surfaceElevated,
            padding: 4,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            height: 50,
            alignItems: 'center',
            width: '100%',
          }}
        >
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setForm((prev) => {
                const nextType: TransactionType = 'expense';
                const firstExpenseCat = categories.find((c) => c.type !== 'income');
                return {
                  ...prev,
                  type: nextType,
                  category_id: firstExpenseCat ? firstExpenseCat.id : prev.category_id,
                };
              });
            }}
            style={({ pressed }) => ({
              flex: 1,
              height: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 10,
              backgroundColor:
                (form.type ?? 'expense') === 'expense'
                  ? (theme.isDark ? '#EF4444' : '#DC2626')
                  : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <ArrowDownRight
              size={18}
              color={(form.type ?? 'expense') === 'expense' ? '#FFFFFF' : theme.colors.textMuted}
              strokeWidth={2.5}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: 14.5,
                lineHeight: 18,
                includeFontPadding: false,
                color: (form.type ?? 'expense') === 'expense' ? '#FFFFFF' : theme.colors.textMuted,
              }}
            >
              Expense
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setForm((prev) => {
                const nextType: TransactionType = 'income';
                const firstIncomeCat = categories.find((c) => c.type === 'income');
                return {
                  ...prev,
                  type: nextType,
                  category_id: firstIncomeCat ? firstIncomeCat.id : prev.category_id,
                };
              });
            }}
            style={({ pressed }) => ({
              flex: 1,
              height: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 10,
              backgroundColor:
                (form.type ?? 'expense') === 'income' ? '#10B981' : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <ArrowUpRight
              size={18}
              color={(form.type ?? 'expense') === 'income' ? '#FFFFFF' : theme.colors.textMuted}
              strokeWidth={2.5}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: 14.5,
                lineHeight: 18,
                includeFontPadding: false,
                color: (form.type ?? 'expense') === 'income' ? '#FFFFFF' : theme.colors.textMuted,
              }}
            >
              Income
            </Text>
          </Pressable>
        </View>

        {/* ── 2. HERO AMOUNT & CURRENCY DISPLAY CARD ── */}
        <Card
          style={{
            padding: theme.spacing.lg,
            gap: 12,
            backgroundColor: theme.isDark ? '#111827' : theme.colors.cardHighlight,
            borderWidth: 2,
            borderColor: (form.type ?? 'expense') === 'income' ? '#10B981' : theme.colors.primary,
          }}
        >
          {/* Currency Dropdown on Top-Right */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text
              variant="caption"
              style={{
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: (form.type ?? 'expense') === 'income' ? '#10B981' : theme.colors.primary,
                fontSize: 11,
              }}
            >
              {(form.type ?? 'expense') === 'income' ? 'Enter Income Amount' : 'Enter Expense Amount'}
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
                backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.25)' : theme.colors.primaryLight,
                borderWidth: 1.5,
                borderColor: (form.type ?? 'expense') === 'income' ? '#10B981' : theme.colors.primary,
              }}
            >
              <Text
                style={{
                  fontWeight: '800',
                  color: (form.type ?? 'expense') === 'income' ? '#10B981' : theme.colors.primary,
                  fontSize: 12,
                }}
              >
                {form.currency}
              </Text>
              <ChevronDown
                size={14}
                color={(form.type ?? 'expense') === 'income' ? '#10B981' : theme.colors.primary}
              />
            </PressableScale>
          </View>

          {/* Huge Numeric Display */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 }}>
            <Text
              style={{
                fontSize: 32,
                lineHeight: 42,
                fontWeight: '900',
                color: (form.type ?? 'expense') === 'income' ? '#10B981' : theme.colors.primary,
                includeFontPadding: false,
              }}
            >
              {(form.type ?? 'expense') === 'income' ? '+' : ''}
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
                lineHeight: 46,
                paddingTop: 4,
                fontWeight: '900',
                color: theme.colors.text,
                paddingVertical: 0,
                minWidth: 100,
                textAlign: 'center',
                includeFontPadding: false,
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

        {/* ── 3. CATEGORY SELECTOR (IN-PLACE DROPDOWN DESIGN) ── */}
        <Card style={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Tag size={16} color={theme.colors.primary} />
              <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
                {(form.type ?? 'expense') === 'income' ? 'Income Category' : (t('expense_category') || 'Select Category')}
              </Text>
            </View>

            {selectedCategory ? (
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEditingCategory(selectedCategory);
                  setCategoryModalOpen(true);
                }}
                hitSlop={8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <CategoryIcon name={selectedCategory.icon} size={13} color={theme.colors.primary} />
                <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary }}>
                  Edit Category
                </Text>
                <Edit3 size={11} color={theme.colors.primary} />
              </Pressable>
            ) : null}
          </View>

          {/* Dropdown Trigger Box */}
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCategoryDropdownOpen((prev) => !prev);
              setAccountDropdownOpen(false);
              setPaymentDropdownOpen(false);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 12,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1.5,
              borderColor: categoryDropdownOpen ? theme.colors.primary : theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              {selectedCategory ? (
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${theme.colors.primary}18`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: `${theme.colors.primary}30`,
                  }}
                >
                  <CategoryIcon name={selectedCategory.icon} size={18} color={theme.colors.primary} />
                </View>
              ) : (
                <Tag size={18} color={theme.colors.textMuted} />
              )}
              <View style={{ gap: 2, flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.text }} numberOfLines={1}>
                  {selectedCategory?.name ?? 'Choose Category...'}
                </Text>
                <Text variant="caption" muted style={{ fontSize: 11 }}>
                  {selectedCategory
                    ? ((form.type ?? 'expense') === 'income' ? 'Income Stream' : 'Expense Category')
                    : 'Tap to pick category from list'}
                </Text>
              </View>
            </View>

            <ChevronDown
              size={18}
              color={theme.colors.textMuted}
              style={{ transform: [{ rotate: categoryDropdownOpen ? '180deg' : '0deg' }] }}
            />
          </Pressable>

          {/* Dropdown Expanded Options List */}
          {categoryDropdownOpen && (
            <View
              style={{
                gap: 4,
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                borderWidth: 1.2,
                borderColor: theme.colors.border,
                padding: 6,
                marginTop: 2,
              }}
            >
              <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                {categories
                  .filter((c) => ((form.type ?? 'expense') === 'income' ? c.type === 'income' : c.type !== 'income'))
                  .map((cat) => {
                    const isSelected = form.category_id === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          setForm((prev) => ({ ...prev, category_id: cat.id }));
                          setCategoryDropdownOpen(false);
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: theme.radius.sm,
                          backgroundColor: isSelected
                            ? (theme.isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(79, 70, 229, 0.08)')
                            : 'transparent',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <CategoryIcon name={cat.icon} size={18} color={isSelected ? theme.colors.primary : theme.colors.text} />
                          <Text
                            style={{
                              fontSize: 13.5,
                              fontWeight: isSelected ? '800' : '600',
                              color: isSelected ? theme.colors.primary : theme.colors.text,
                            }}
                            numberOfLines={1}
                          >
                            {cat.name}
                          </Text>
                        </View>
                        {isSelected && <Check size={16} color={theme.colors.primary} />}
                      </Pressable>
                    );
                  })}
              </ScrollView>

              <Pressable
                onPress={() => {
                  setCategoryDropdownOpen(false);
                  setEditingCategory(null);
                  setCategoryModalOpen(true);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.colors.surfaceElevated,
                  marginTop: 2,
                }}
              >
                <Plus size={15} color={theme.colors.primary} />
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.primary }}>
                  + Add New Category
                </Text>
              </Pressable>
            </View>
          )}
        </Card>

        {/* ── 3.5 BANK ACCOUNT & WALLET SELECTOR (IN-PLACE DROPDOWN DESIGN) ── */}
        <Card
          style={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
          onLayout={(e) => { accountCardY.current = e.nativeEvent.layout.y; }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Wallet size={16} color={theme.colors.primary} />
              <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
                Bank Account / Wallet
              </Text>
            </View>

            {accounts.find((a) => a.id === form.bank_account_id) ? (
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const sel = accounts.find((a) => a.id === form.bank_account_id);
                  if (sel) {
                    setEditingAccount(sel);
                    setAccountModalOpen(true);
                  }
                }}
                hitSlop={8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <CategoryIcon
                  name={accounts.find((a) => a.id === form.bank_account_id)?.icon}
                  size={13}
                  color={theme.colors.primary}
                />
                <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary }}>
                  Manage Account
                </Text>
                <Edit3 size={11} color={theme.colors.primary} />
              </Pressable>
            ) : null}
          </View>

          {/* Dropdown Trigger Box */}
          {(() => {
            const selectedAccount = accounts.find((a) => a.id === form.bank_account_id);
            const liveEntry = selectedAccount ? accountLiveBalances.find((a) => a.id === selectedAccount.id) : null;
            const liveBalance = liveEntry?.live_balance ?? Number(selectedAccount?.initial_balance ?? 0);
            return (
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAccountDropdownOpen((prev) => !prev);
                  setCategoryDropdownOpen(false);
                  setPaymentDropdownOpen(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1.5,
                  borderColor: accountDropdownOpen ? theme.colors.primary : theme.colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  {selectedAccount ? (
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: `${selectedAccount.color || theme.colors.primary}18`,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: `${selectedAccount.color || theme.colors.primary}30`,
                      }}
                    >
                      <CategoryIcon
                        name={selectedAccount.icon}
                        size={18}
                        color={selectedAccount.color || theme.colors.primary}
                      />
                    </View>
                  ) : (
                    <Wallet size={18} color={theme.colors.textMuted} />
                  )}
                  <View style={{ gap: 2, flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: theme.colors.text }}>
                      {selectedAccount?.name ?? 'Select Account / Wallet'}
                    </Text>
                    {selectedAccount ? (
                      <Text
                        variant="caption"
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: liveBalance >= 0 ? '#10B981' : theme.colors.danger,
                        }}
                      >
                        Available: {formatMoney(liveBalance, selectedAccount.currency)}
                      </Text>
                    ) : (
                      <Text variant="caption" muted style={{ fontSize: 11 }}>
                        Tap to choose bank account or cash wallet
                      </Text>
                    )}
                  </View>
                </View>

                <ChevronDown
                  size={18}
                  color={theme.colors.textMuted}
                  style={{ transform: [{ rotate: accountDropdownOpen ? '180deg' : '0deg' }] }}
                />
              </Pressable>
            );
          })()}

          {/* Dropdown Expanded Options List */}
          {accountDropdownOpen && (
            <View
              style={{
                gap: 4,
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                borderWidth: 1.2,
                borderColor: theme.colors.border,
                padding: 6,
                marginTop: 2,
              }}
            >
              <ScrollView nestedScrollEnabled style={{ maxHeight: 230 }}>
                {accountsByBalanceDesc.map((acc) => {
                  const isSelected = form.bank_account_id === acc.id;
                  const liveEntry = accountLiveBalances.find((a) => a.id === acc.id);
                  const liveBalance = liveEntry?.live_balance ?? Number(acc.initial_balance ?? 0);
                  return (
                    <Pressable
                      key={acc.id}
                      onPress={() => {
                        setForm((prev) => ({ ...prev, bank_account_id: acc.id }));
                        setAccountDropdownOpen(false);
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: theme.radius.sm,
                        backgroundColor: isSelected
                          ? (theme.isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(79, 70, 229, 0.08)')
                          : 'transparent',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <CategoryIcon name={acc.icon} size={18} color={acc.color || theme.colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13.5, fontWeight: isSelected ? '800' : '600', color: theme.colors.text }}>
                            {acc.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 10.5,
                              fontWeight: '700',
                              color: liveBalance >= 0 ? '#10B981' : theme.colors.danger,
                            }}
                          >
                            Live: {formatMoney(liveBalance, acc.currency)}
                          </Text>
                        </View>
                      </View>
                      {isSelected && <Check size={16} color={theme.colors.primary} />}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable
                onPress={() => {
                  setAccountDropdownOpen(false);
                  setEditingAccount(null);
                  setAccountModalOpen(true);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.colors.surfaceElevated,
                  marginTop: 2,
                }}
              >
                <Plus size={15} color={theme.colors.primary} />
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.primary }}>
                  + Add New Bank Account / Wallet
                </Text>
              </Pressable>
            </View>
          )}
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
            placeholder={
              (form.type ?? 'expense') === 'income'
                ? 'e.g. Monthly Salary, Freelance project...'
                : (t('expense_description_placeholder') || 'e.g. Starbucks Cafe, Grocery Mart')
            }
            value={form.description ?? ''}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
          />

          {/* Quick Tag Pills */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {((form.type ?? 'expense') === 'income' ? INCOME_QUICK_TAGS : EXPENSE_QUICK_TAGS).map((tag) => (
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

          {/* Date & Time side-by-side */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1.2, gap: 5 }}>
              <Text
                variant="caption"
                muted
                style={{ fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {t('expense_date') || 'Date'}
              </Text>
              <Pressable
                onPress={() => setCalendarOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  padding: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Calendar size={16} color={theme.colors.primary} />
                <Text style={{ fontWeight: '800', fontSize: 12.5, color: theme.colors.text }} numberOfLines={1}>
                  {form.date}
                </Text>
              </Pressable>
            </View>

            <View style={{ flex: 1.5, gap: 5 }}>
              <Text
                variant="caption"
                muted
                style={{ fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                Time
              </Text>
<View
  style={{
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    paddingHorizontal: isCompactScreen ? 4 : 8,
  }}
>
  {/* Clock */}
  <Clock
    size={15}
    color={theme.colors.primary}
    style={{
      marginRight: isCompactScreen ? 3 : 6,
      flexShrink: 0,
    }}
  />

  {/* Hour */}
  <TextInput
    ref={hourInputRef}
    value={hourRaw}
    onChangeText={handleHourInput}
    placeholder="HH"
    placeholderTextColor={theme.colors.faint}
    keyboardType="number-pad"
    maxLength={2}
    contextMenuHidden
    style={{
      width: isCompactScreen ? 27 : 32,
      flexShrink: 1,
      textAlign: 'center',
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
      includeFontPadding: false,
      paddingVertical: 0,
      paddingHorizontal: 0,
    }}
  />

  {/* : */}
  <Text
    style={{
      color: theme.colors.textMuted,
      fontWeight: '900',
      fontSize: 13,
      marginHorizontal: 1,
      flexShrink: 0,
    }}
  >
    :
  </Text>

  {/* Minute */}
  <TextInput
    ref={minuteInputRef}
    value={minuteRaw}
    onChangeText={handleMinuteInput}
    onKeyPress={({ nativeEvent }) => {
      if (nativeEvent.key === 'Backspace') {
        handleMinuteBackspace();
      }
    }}
    placeholder="MM"
    placeholderTextColor={theme.colors.faint}
    keyboardType="number-pad"
    maxLength={2}
    contextMenuHidden
    style={{
      width: isCompactScreen ? 27 : 32,
      flexShrink: 1,
      textAlign: 'center',
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
      includeFontPadding: false,
      paddingVertical: 0,
      paddingHorizontal: 0,
    }}
  />

  {/* AM / PM */}
  <Pressable
    onPress={() =>
      updateTimeParts(
        undefined,
        undefined,
        timePeriod === 'AM' ? 'PM' : 'AM'
      )
    }
    hitSlop={4}
    style={({ pressed }) => ({
      width: isCompactScreen ? 46 : 52,
      height: 36,

      alignItems: 'center',
      justifyContent: 'center',

      paddingHorizontal: 4,

      borderRadius: 8,

      marginLeft: isCompactScreen ? 3 : 6,
      marginRight: isCompactScreen ? 4 : 6,

      flexShrink: 1,

      backgroundColor:
        timePeriod === 'AM'
          ? theme.isDark
            ? 'rgba(99, 102, 241, 0.25)'
            : 'rgba(79, 70, 229, 0.12)'
          : theme.isDark
            ? 'rgba(52, 211, 153, 0.2)'
            : '#DCE9E3',

      borderWidth: 1,

      borderColor:
        timePeriod === 'AM'
          ? theme.colors.primary
          : '#059669',

      opacity: pressed ? 0.75 : 1,
    })}
  >
    <Text
      style={{
        fontSize: 10,
        fontWeight: '900',
        color:
          timePeriod === 'AM'
            ? theme.colors.primary
            : '#059669',
        includeFontPadding: false,
      }}
    >
      {timePeriod}
    </Text>
  </Pressable>

  {/* Divider between PM and NOW */}
  <View
    style={{
      width: 1,
      height: 24,
      backgroundColor: theme.colors.border,
      flexShrink: 0,
    }}
  />

  {/* NOW */}
  <Pressable
    onPress={() => {
      const now = currentFormattedTime();

      setForm((current) => ({
        ...current,
        time: now,
      }));

      const m = now.match(
        /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
      );

      if (m) {
        setHourRaw(m[1]);
        setMinuteRaw(m[2]);
      }

      void Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light
      ).catch(() => undefined);
    }}
    hitSlop={4}
    style={{
      height: '100%',
      minWidth: isCompactScreen ? 38 : 46,

      justifyContent: 'center',
      alignItems: 'center',

      paddingHorizontal: isCompactScreen ? 5 : 8,

      flexShrink: 0,
    }}
  >
    <Text
      style={{
        color: theme.colors.primary,
        fontWeight: '900',
        fontSize: isCompactScreen ? 9 : 10,
        includeFontPadding: false,
      }}
    >
      NOW
    </Text>
  </Pressable>
</View>
            </View>
          </View>
        </Card>

        {/* ── 6. PAYMENT METHOD — 2×2 card grid ── */}
        {txType === 'expense' && (
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CreditCard size={16} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
              {t('expense_payment_method') || 'Payment Channel'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { key: 'Cash',  icon: '💵', label: 'Cash',    },
              { key: 'Card',  icon: '💳', label: 'Card',    },
              { key: 'UPI',   icon: '📱', label: 'UPI',    },
              { key: 'Other', icon: '🪙', label: 'Other',  },
            ] as { key: PaymentMethod; icon: string; label: string; sub: string }[]).map((pm) => {
              const isSelected = form.payment_method === pm.key;
              return (
                <Pressable
                  key={pm.key}
                  onPress={() => {
                    setForm((prev) => ({ ...prev, payment_method: pm.key }));
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    paddingVertical: -4,
                    paddingHorizontal: 2,
                    paddingTop: 8,
                    borderRadius: theme.radius.md,
                    borderWidth: 1.8,
                    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: isSelected
                      ? (theme.isDark ? 'rgba(99,102,241,0.18)' : 'rgba(79,70,229,0.08)')
                      : theme.colors.surfaceElevated,
                    opacity: pressed ? 0.75 : 1,
                    position: 'relative',
                  })}
                >
                  <Text style={{ fontSize: 22 }}>{pm.icon}</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: isSelected ? theme.colors.primary : theme.colors.text }}>
                    {pm.label}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '500', color: theme.colors.textMuted }}>
                    {pm.sub}
                  </Text>
                  {isSelected && (
                    <View style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 16, height: 16, borderRadius: 8,
                      backgroundColor: theme.colors.primary,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={10} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Card>
        )}

        {/* ── 7. RECEIPT & BILL ATTACHMENT STUDIO (Expense only) ── */}
        {txType === 'expense' && (
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
        )}

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

        {/* ── 8. DELETE (Edit mode only — Save lives in the sticky bottom bar) ── */}
        {expenseId ? (
          <Button
            title={isIncome ? 'Delete Income Record' : (t('expense_delete') || 'Delete Expense')}
            variant="destructive"
            icon={Trash2}
            onPress={() => setDeleteConfirmOpen(true)}
            style={{ marginTop: 4 }}
          />
        ) : null}

        {/* ── INSUFFICIENT BALANCE MODAL ── */}
        <Modal
          visible={!!insufficientBalance}
          transparent
          animationType="slide"
          onRequestClose={() => setInsufficientBalance(null)}
        >
          <Pressable
            onPress={() => setInsufficientBalance(null)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingHorizontal: 24,
                paddingTop: 12,
                paddingBottom: 36,
                gap: 0,
              }}
            >
              {/* Drag handle */}
              <View style={{ alignItems: 'center', paddingBottom: 16 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
              </View>

              {/* Red warning icon circle */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: theme.isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)',
                    borderWidth: 1.5,
                    borderColor: theme.isDark ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.25)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertCircle size={34} color="#EF4444" />
                </View>
              </View>

              {/* Title */}
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '900',
                  color: theme.colors.text,
                  textAlign: 'center',
                  marginBottom: 6,
                }}
              >
                Insufficient Balance
              </Text>

              {/* Account name badge */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 20 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <CategoryIcon
                    name={insufficientBalance?.accountIcon}
                    size={14}
                    color={insufficientBalance?.accountColor || theme.colors.primary}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                    {insufficientBalance?.accountName}
                  </Text>
                </View>
              </View>

              {/* Three stat rows */}
              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  overflow: 'hidden',
                  marginBottom: 24,
                }}
              >
                {/* Required */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textMuted }}>
                    You're spending
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>
                    {insufficientBalance
                      ? formatMoney(insufficientBalance.required, insufficientBalance.currency)
                      : '—'}
                  </Text>
                </View>

                {/* Available */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textMuted }}>
                    Available balance
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#10B981' }}>
                    {insufficientBalance
                      ? formatMoney(insufficientBalance.available, insufficientBalance.currency)
                      : '—'}
                  </Text>
                </View>

                {/* Shortfall — highlighted */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    backgroundColor: theme.isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.06)',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>
                    Short by
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#EF4444' }}>
                    {insufficientBalance
                      ? formatMoney(insufficientBalance.shortfall, insufficientBalance.currency)
                      : '—'}
                  </Text>
                </View>
              </View>

              {/* CTA button — scroll to Bank Account / Wallet selector and dismiss */}
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={() => {
                    setInsufficientBalance(null);
                    setTimeout(() => {
                      scrollRef.current?.scrollTo({ y: accountCardY.current, animated: true });
                    }, 120);
                  }}
                  style={({ pressed }) => ({
                    height: 52,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.primary,
                    opacity: pressed ? 0.82 : 1,
                  })}
                >
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
                    Switch Account
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Date Picker Modal */}
        <CalendarModal
          visible={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          mode="single"
          onApply={(range) => {
            if (range.startDate) {
              setForm((current) => ({ ...current, date: range.startDate! }));
            }
          }}
          initialRange={{ startDate: form.date, endDate: form.date }}
        />

        {/* Date Picker Modal */}
        <ImageViewerModal
          visible={imageViewerOpen}
          onClose={() => setImageViewerOpen(false)}
          imageUrl={form.receipt_image_url || null}
        />

        {/* Inline Category Manage Modal */}
        <CategoryManageModal
          visible={categoryModalOpen}
          onClose={() => {
            setCategoryModalOpen(false);
            setEditingCategory(null);
          }}
          categoryToEdit={editingCategory}
          defaultType={form.type ?? 'expense'}
          onSuccess={(newCat) => {
            void loadCategories().then(() => {
              if (newCat) {
                setForm((prev) => ({ ...prev, category_id: newCat.id }));
              }
            });
          }}
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
                  { code: 'QAR', flag: '🇶🇦', name: 'Qatari Riyal', symbol: '﷼' },
                  { code: 'GBP', flag: '🇬🇧', name: 'British Pound', symbol: '£' },
                ].map((cur) => {
                  const isSelected = form.currency === cur.code;
                  return (
                    <Pressable
                      key={cur.code}
                      onPress={() => {
                        currencyManuallySelected.current = true;
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

        {/* Bank Account Management Modal (Add / Edit / Delete) */}
        <AccountManageModal
          visible={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
          onSaved={() => void loadAccounts(true)}
          accountToEdit={editingAccount}
        />
      </ScrollView>

      <ConfirmDialog
        visible={deleteConfirmOpen}
        title={isIncome ? 'Delete Income?' : 'Delete Expense?'}
        message={isIncome ? 'This income entry will be permanently removed.' : 'This expense will be permanently removed from your history.'}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          void softDeleteExpense(expenseId!).then(() => {
            notifyExpensesChanged();
            handleBack();
          }).catch((err) => {
            setError(err instanceof Error ? err.message : 'Could not delete this expense.');
          });
        }}
      />

      {/* ── STICKY SAVE BAR — always visible, type-colored total + CTA ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16) + 12,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          elevation: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 10,
        }}
      >
        <View style={{ flex: isCompactScreen ? 0.8 : 1, minWidth: 0 }}>
          <Text
            variant="caption"
            muted
            style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }}
          >
            {expenseId ? 'Updating' : (isIncome ? 'Income' : 'Total')}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
              fontSize: 19,
              lineHeight: 24,
              fontWeight: '900',
              includeFontPadding: false,
              color: isIncome ? '#10B981' : theme.colors.primary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {isIncome ? '+' : '-'} {formatMoney(Number(rawAmount) || 0, form.currency)}
          </Text>
        </View>

        <Button
          title={
            isCompactScreen
              ? (expenseId ? 'Update' : 'Save')
              : expenseId
              ? (isIncome ? 'Update Income' : 'Update Expense')
              : (isIncome ? 'Save Income' : 'Save Expense')
          }
          loading={saving}
          onPress={submit}
          style={{
            flex: isCompactScreen ? 1.2 : 1.3,
            minWidth: 0,
            height: 50,
            backgroundColor: isIncome ? '#10B981' : theme.colors.primary,
          }}
        />
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}