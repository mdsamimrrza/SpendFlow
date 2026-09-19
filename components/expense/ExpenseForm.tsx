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
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
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
  LayoutGrid,
  Plus,
  Repeat,
  Sparkles,
  Tag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
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
import { notifyExpensesChanged } from '@/hooks/useExpenses';
import { useAccountBalances } from '@/hooks/useAccountBalances';
import { useLanguage } from '@/hooks/useLanguage';
import { useSecurity } from '@/hooks/useSecurity';
import { useTheme } from '@/hooks/useTheme';
import { listBankAccounts, seedDefaultAccounts } from '@/services/bankAccounts';
import { listCategories } from '@/services/categories';
import { convertExpense } from '@/services/exchange';
import { getExpense, softDeleteExpense } from '@/services/expenses';
import {
  getCachedRecurringRules,
  listRecurringRules,
  payPlanFromForm,
  updateRecurringRule,
} from '@/services/recurring';
import { deleteReceipt, uploadReceipt } from '@/services/receipts';
import { ReceiptScan, scanReceipt } from '@/services/receiptOcr';
import { showToast, ToastHost } from '@/components/ui/Toast';
import { useReceiptUrl } from '@/hooks/useReceiptUrl';
import { BankAccount, Category, ExpenseInput, PaymentMethod, RecurringRule, TransactionType } from '@/types';
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompactScreen = screenWidth < 380;
  // Suppresses the biometric lock around camera/picker round-trips (system
  // activities fire background→active on return).
  const { beginSystemCapture, endSystemCapture } = useSecurity();
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  // Single source of truth for live balances (same hook the Accounts & Wallets
  // screen uses), so the submit guard and the account chips can never disagree
  // with the balances shown elsewhere in the app. `expenses`/`transfers` come
  // from the hook too — the balance math and every consumer share one load.
  const {
    liveBalances: accountLiveBalances,
    expenses,
  } = useAccountBalances(userId, accounts);
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
  // Floating dropdowns render in a transparent Modal (same pattern as the
  // History toolbar) so their ScrollView scrolls natively on Android without
  // fighting the form's outer ScrollView for the drag gesture. The anchor's
  // window rect is measured at open time to position the panel below the row.
  const categoryAnchorRef = useRef<View | null>(null);
  const accountAnchorRef = useRef<View | null>(null);
  const planAnchorRef = useRef<View | null>(null);
  // Panel placement, computed once at open time from the anchor card's window
  // rect: `top` when the list fits below the card, `bottom` when it must flip
  // ABOVE the card (bottom-of-screen cards), `scrollMax` = the ScrollView
  // viewport height left over after the panel chrome.
  const [popoverRect, setPopoverRect] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    scrollMax: number;
  } | null>(null);
  // Pay-from-plan collapses to a single "🔁 Pay from plan (N)" line like the
  // Add-a-note row; the circle row is hidden until expanded.
  const [planRowOpen, setPlanRowOpen] = useState(false);
  // Notes start collapsed in add mode; edit mode auto-expands when a saved
  // note exists (see the getExpense effect) so it's never hidden from view.
  const [notesOpen, setNotesOpen] = useState(false);
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

  // Receipts live in a private bucket — the stored value is a storage path
  // (or legacy URL/local URI) that must be resolved to a signed URL to render.
  const receiptPreviewUrl = useReceiptUrl(form.receipt_image_url);

  // ── Deferred receipt upload ──
  // A picked image is kept LOCAL (its device URI sits in
  // form.receipt_image_url for preview) and only uploads in submit() right
  // before the row is saved. This guarantees an abandoned scan (user picks a
  // bill, OCR runs, form is closed without saving) never leaves an orphaned
  // object in storage. Cleared on remove/submit/replace.
  const [pendingReceipt, setPendingReceipt] = useState<{
    uri: string;
    fileName: string | null;
    mimeType: string | null;
    base64: string | null;
  } | null>(null);
  // The receipt the EDITED expense originally pointed at (loaded from the DB).
  // If the user replaces or clears it, the old storage object is deleted only
  // AFTER the updated row saves — deleting earlier would lose the image if the
  // save fails or the user backs out.
  const originalReceiptUrlRef = useRef<string | null>(null);

  const [rawAmount, setRawAmount] = useState('');
  // Edit mode: the rule this row belongs to (drives the "Part of a plan" badge
  // and the delete dialog's "cancel plan too?" branch).
  const [planRuleId, setPlanRuleId] = useState<string | null>(null);
  // ── PAY FROM PLAN dropdown: pick an existing recurring rule → the form
  // auto-fills from it, the date stays "today", and saving books the open
  // slot AND re-anchors the chain from the payment date (docs §3/§6).
  const [rulesCache, setRulesCache] = useState<RecurringRule[]>([]);
  const [payPlan, setPayPlan] = useState<RecurringRule | null>(null);
  const [planDropdownOpen, setPlanDropdownOpen] = useState(false);
  const currencyManuallySelected = useRef(false);
  // Fields the user has touched this session — receipt-OCR prefill must never
  // overwrite them (mirrors currencyManuallySelected, one flag per field).
  const userEditedFields = useRef<Set<'amount' | 'date' | 'time' | 'description' | 'category' | 'payment'>>(new Set());

  // ── 12-hour numeric time entry buffers ──
  // Seeded from form.time so the boxes are pre-filled in add-mode. In edit-mode
  // they are re-seeded from the loaded expense's saved time (see the load
  // effect below) — the saved expense arrives after mount, so without that
  // re-seed the boxes would keep showing the mount-time "now".
  const initTimeMatch = (form.time || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const [minuteRaw, setMinuteRaw] = useState(() => initTimeMatch ? initTimeMatch[2] : '');
  const [hourRaw, setHourRaw] = useState(() => initTimeMatch ? initTimeMatch[1] : '');

  // accountLiveBalances (live_balance per account, converted into each
  // account's own currency) comes from useAccountBalances above — shared with
  // the Accounts & Wallets screen. Used for the submit() guard and chips.
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

  // Circle row = current pick first (so it's always visible and ringed), then
  // the richest accounts behind it, capped at five plus the ▦ All button —
  // mirrors the category circle row in the card above.
  const accountRow = useMemo(() => {
    const seen = new Set<string>();
    const list: BankAccount[] = [];
    const selected = accounts.find((a) => a.id === form.bank_account_id);
    if (selected) {
      list.push(selected);
      seen.add(selected.id);
    }
    for (const acc of accountsByBalanceDesc) {
      if (!seen.has(acc.id)) {
        list.push(acc);
        seen.add(acc.id);
      }
    }
    return list.slice(0, 5);
  }, [accounts, form.bank_account_id, accountsByBalanceDesc]);

  // ── Live over-balance alert for the amount hero ───────────────────────────
  // Mirrors the submit() insufficient-balance guard: the entry amount is
  // converted into the account's own currency before comparing, and in edit
  // mode the already-booked original row is added back to the available
  // balance. While true, the amount card border turns red.
  const [overBalance, setOverBalance] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const acct = accounts.find((a) => a.id === form.bank_account_id);
    const amt = Number(form.amount) || 0;
    if (!acct || amt <= 0 || (form.type ?? 'expense') !== 'expense') {
      setOverBalance(false);
      return;
    }
    const acctCurrency = acct.currency || 'NPR';
    const balance =
      accountLiveBalances.find((x) => x.id === acct.id)?.live_balance ?? Number(acct.initial_balance ?? 0);
    void (async () => {
      try {
        const amountInAcct = await convertExpense(
          { currency: form.currency || 'NPR', date: form.date || isoDate(), exchange_rate_to_usd: null, amount: amt },
          acctCurrency,
        );
        let available = balance;
        const original = expenseId ? expenses.items.find((e) => e.id === expenseId) : null;
        if (original && original.type === 'expense' && original.bank_account_id === acct.id) {
          available += await convertExpense(original, acctCurrency).catch(() => Number(original.amount) || 0);
        }
        if (!cancelled) setOverBalance(amountInAcct > available);
      } catch {
        if (!cancelled) setOverBalance(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.amount, form.currency, form.date, form.type, form.bank_account_id, accounts, accountLiveBalances, expenseId, expenses.items]);

  // Profile hydration can finish after this screen mounts while offline. Apply the
  // cached preferred currency once, but never overwrite a currency the user picked.
  useEffect(() => {
    if (!expenseId && profile?.preferred_currency && !currencyManuallySelected.current) {
      setForm((current) => ({ ...current, currency: profile.preferred_currency }));
    }
  }, [expenseId, profile?.preferred_currency]);

  // Recurring rules for the duplicate-bill chip — add mode only; cached first,
  // then the server list (same paint pattern as the rest of the app).
  useEffect(() => {
    if (!userId || expenseId) return;
    void getCachedRecurringRules(userId).then(setRulesCache).catch(() => undefined);
    void listRecurringRules(userId).then(setRulesCache).catch(() => undefined);
  }, [userId, expenseId]);

  const loadCategories = async () => {
    if (!userId) return [];
    // Paint the cached list instantly, then swap in the server list.
    const nextCategories = await listCategories(userId, (cached) => setCategories(cached));
    setCategories(nextCategories);
    return nextCategories;
  };

  const loadAccounts = async (autoSelectNewest = false) => {
    if (!userId) return [];
    // Paint the cached list instantly, then swap in the server list.
    let nextAccounts = await listBankAccounts(userId, (cached) => setAccounts(cached));
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
    // audit run-1: require a confirmed userId before the record read — without
    // it the query dropped the client-side user_id filter and leaned on RLS
    // alone, and an unhydrated mount should not issue authenticated reads.
    if (!expenseId || !userId) return;
    getExpense(expenseId, userId)
      .then((expense) => {
        const savedTime = formatTimeForInput(expense.time);
        setForm({
          amount: Number(expense.amount),
          category_id: expense.category_id,
          currency: expense.currency,
          description: expense.description ?? '',
          date: expense.date,
          time: savedTime,
          payment_method: expense.payment_method,
          bank_account_id: expense.bank_account_id ?? null,
          notes: expense.notes ?? '',
          receipt_image_url: expense.receipt_image_url,
          type: expense.type || 'expense',
        });
        originalReceiptUrlRef.current = expense.receipt_image_url ?? null;
        // Rule linkage drives the "Part of a plan" badge + delete branching.
        setPlanRuleId(expense.recurring_rule_id ?? null);
        // Re-seed the hour/minute boxes with the saved time so updating the
        // entry retains it instead of overwriting it with mount-time "now".
        const savedParts = savedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        setHourRaw(savedParts ? savedParts[1] : '');
        setMinuteRaw(savedParts ? savedParts[2] : '');
        setRawAmount(String(expense.amount));
        // A saved note must be visible immediately in edit mode.
        setNotesOpen(Boolean(expense.notes));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this expense.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, userId]);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  function handleAmountChange(text: string) {
    userEditedFields.current.add('amount');
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
    setRawAmount(sanitized);
    setForm((current) => ({ ...current, amount: sanitized ? Number(sanitized) : 0 }));
  }

  function handleAddQuickAmount(inc: number) {
    userEditedFields.current.add('amount');
    const current = rawAmount ? Number(rawAmount) : 0;
    const next = String(current + inc);
    setRawAmount(next);
    setForm((prev) => ({ ...prev, amount: Number(next) }));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }

  // ── 12-hour numeric time entry helpers ──
  const hourInputRef = useRef<TextInput | null>(null);
  const minuteInputRef = useRef<TextInput | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const accountCardY = useRef<number>(0);
  const timeMatch = (form.time || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const timePeriod = (timeMatch ? timeMatch[3].toUpperCase() : 'PM') as 'AM' | 'PM';

  function updateTimeParts(hour?: string, minute?: string, period?: 'AM' | 'PM') {
    userEditedFields.current.add('time');
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

  /**
   * Applies receipt-OCR findings to the form. Each field is filled only when
   * the user has not touched it this session (userEditedFields) — in edit mode
   * the loaded expense pre-populates the form, and prefill never clobbers it.
   */
  function applyReceiptScan(scan: ReceiptScan) {
    const touched = userEditedFields.current;

    if (scan.amount !== null && !touched.has('amount')) {
      setRawAmount(String(scan.amount));
      setForm((prev) => ({ ...prev, amount: scan.amount! }));
    }
    if (scan.date !== null && !touched.has('date')) {
      setForm((prev) => ({ ...prev, date: scan.date! }));
    }
    if (scan.time !== null && !touched.has('time')) {
      setForm((prev) => ({ ...prev, time: scan.time! }));
      const parts = scan.time!.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (parts) {
        setHourRaw(parts[1]);
        setMinuteRaw(parts[2]);
      }
    }
    if (scan.merchant !== null && !touched.has('description') && !form.description) {
      setForm((prev) => ({ ...prev, description: scan.merchant! }));
    }
    if (scan.categoryName !== null && !touched.has('category')) {
      const match = categories.find(
        (c) =>
          c.name.toLowerCase().includes(scan.categoryName!.toLowerCase()) ||
          scan.categoryName!.toLowerCase().includes(c.name.toLowerCase()),
      );
      // Only when the default (first) category is still selected — an active
      // user choice must win even if it was auto-assigned before OCR finished.
      const isDefaultSelection =
        !form.category_id || categories[0]?.id === form.category_id;
      if (match && isDefaultSelection) {
        setForm((prev) => ({ ...prev, category_id: match.id }));
      }
    }
    if (scan.currency !== null && scan.currency !== form.currency && !currencyManuallySelected.current) {
      setForm((prev) => ({ ...prev, currency: scan.currency! }));
    }
    if (scan.paymentMethod !== null && !touched.has('payment') && form.payment_method === 'Cash') {
      setForm((prev) => ({ ...prev, payment_method: scan.paymentMethod! }));
    }

    const filledCount = [
      scan.amount !== null && !touched.has('amount'),
      scan.date !== null && !touched.has('date'),
      scan.time !== null && !touched.has('time'),
      scan.merchant !== null && !touched.has('description') && !form.description,
    ].filter(Boolean).length;

    if (filledCount > 0) {
      showToast({ message: `${t('ocr_scan_success') || 'Receipt scanned — details filled'} ✓`, type: 'success' });
    } else if (scan.amount === null && scan.hasText) {
      showToast({ message: t('ocr_scan_failed') || "Couldn't read the bill — please fill details", type: 'info' });
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

      // The camera/gallery is a separate Android activity: without the capture
      // suppression the app treats returning with the photo as a fresh
      // foreground and re-prompts biometrics on every attach.
      beginSystemCapture();
      let result;
      try {
        result = fromCamera
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
      } finally {
        endSystemCapture();
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Downscale to a 1600px long edge at quality 0.65 (industry sweet
        // spot for paper receipts: ~150-350 KB, text stays crisp and OCR-safe
        // — below this small print starts softening). Applied before the
        // preview, the scan and the upload so all use the same small file.
        // Skipped on web (native module) and on failure.
        let finalUri = asset.uri;
        let finalBase64 = asset.base64 ?? null;
        let finalMime = asset.mimeType ?? null;
        const MAX_EDGE = 1600;
        const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
        if (Platform.OS !== 'web' && longest > MAX_EDGE) {
          const scale = MAX_EDGE / longest;
          try {
            const resized = await manipulateAsync(
              asset.uri,
              [{ resize: { width: Math.round((asset.width ?? longest) * scale), height: Math.round((asset.height ?? longest) * scale) } }],
              { compress: 0.65, format: SaveFormat.JPEG, base64: true },
            );
            finalUri = resized.uri;
            finalBase64 = resized.base64 ?? null;
            finalMime = 'image/jpeg';
          } catch {
            // Keep the original capture if manipulation fails — never block.
          }
        }
        // OCR runs immediately (local file) and never blocks — a scan failure
        // is silently ignored.
        void scanReceipt(finalUri, form.currency || 'NPR')
          .then(applyReceiptScan)
          .catch(() => undefined);
        // Upload is DEFERRED to submit(): keeping the image local here means
        // an abandoned scan never writes anything to storage. The device URI
        // renders fine as a preview until then.
        setPendingReceipt({
          uri: finalUri,
          fileName: asset.fileName ?? null,
          mimeType: finalMime,
          base64: finalBase64,
        });
        setForm((current) => ({ ...current, receipt_image_url: finalUri }));
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
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
        const accountCurrency = accountWithBalance.currency || 'NPR';
        // Compare in the account's currency: the entry amount and the balance
        // may be recorded in different currencies (e.g. INR entry, NPR account).
        const amountInAccountCurrency = await convertExpense(
          { currency: form.currency || 'NPR', date: form.date || isoDate(), exchange_rate_to_usd: null, amount },
          accountCurrency,
        ).catch(() => amount);
        let availableBalance = accountWithBalance.live_balance;

        // In edit mode the original expense is already baked into the live balance
        // (it has already been deducted). Add it back — converted into the
        // account's currency — so we compare against the balance as if this
        // transaction hadn't been recorded yet.
        if (expenseId) {
          const original = expenses.items.find((e) => e.id === expenseId);
          if (original && original.bank_account_id === selectedAccountId && original.type === 'expense') {
            const originalConverted = await convertExpense(original, accountCurrency).catch(
              () => Number(original.amount),
            );
            availableBalance += originalConverted;
          }
        }

        if (amountInAccountCurrency > availableBalance) {
          const shortfall = amountInAccountCurrency - availableBalance;
          setInsufficientBalance({
            accountName: accountWithBalance.name,
            accountIcon: accountWithBalance.icon,
            accountColor: accountWithBalance.color,
            available: availableBalance,
            required: amountInAccountCurrency,
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
      // ── Receipt upload (deferred from pickImage) ──
      // Only now, with validation passed and the row about to be written, does
      // the picked image go to storage. Offline/upload failure falls back to
      // the local device URI so the expense still saves with a local link.
      let receiptUrl: string | null = form.receipt_image_url ?? null;
      if (pendingReceipt) {
        try {
          receiptUrl = await uploadReceipt(
            userId ?? '',
            pendingReceipt.uri,
            pendingReceipt.fileName,
            pendingReceipt.mimeType,
            pendingReceipt.base64,
          );
        } catch {
          receiptUrl = pendingReceipt.uri;
        }
        setPendingReceipt(null);
      }

      // ── Pay-from-plan path (docs/recurring-plan.md §6): book the rule's
      // open slot with what's actually in the form (corrected price wins),
      // then the chain recalculates from THIS payment date. The row is
      // written inside the service, so the generic save is skipped entirely.
      if (payPlan) {
        const paid = await payPlanFromForm(userId ?? '', payPlan.id, {
          amount: Number(parsed.data.amount),
          category_id: parsed.data.category_id,
          currency: parsed.data.currency || 'NPR',
          description: parsed.data.description?.trim() || null,
          notes: parsed.data.notes?.trim() || null,
          date: parsed.data.date,
          time: parseTimeInput(parsed.data.time),
          payment_method: parsed.data.payment_method,
          bank_account_id: parsed.data.bank_account_id ?? null,
          receipt_image_url: receiptUrl,
        });
        notifyExpensesChanged();
        showToast({
          message:
            `${t('recurring_marked_paid') || 'Payment recorded'} · ${t('recurring_next_due_short') || 'next due'} ${paid.nextDue}`
            + (paid.lateDays > 0 ? ` · ${t('recurring_late_days') || 'late'} ${paid.lateDays}d` : ''),
          type: 'success',
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        handleBack();
        return;
      }

      const payloadToSave: ExpenseInput = {
        ...parsed.data,
        type: txType,
        time: parseTimeInput(parsed.data.time),
        receipt_image_url: receiptUrl,
      };

      await expenses.save(payloadToSave, expenseId);

      // The row is safely saved — now (and only now) delete a replaced or
      // cleared original receipt. Best-effort; a failure just leaves the old
      // object for a later cleanup rather than breaking the save.
      if (originalReceiptUrlRef.current && originalReceiptUrlRef.current !== receiptUrl) {
        void deleteReceipt(originalReceiptUrlRef.current);
        originalReceiptUrlRef.current = receiptUrl;
      }

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

  // ── Category usage for the recents chips: "last used" = newest loaded row,
  // "count" = entries in the entry's month (loaded page = recent history,
  // which is exactly what a recents strip should rank on).
  const categoryUsage = useMemo(() => {
    const byCat = new Map<string, { last: string; count: number }>();
    const month = form.date.slice(0, 7);
    for (const e of expenses.items) {
      if (e.deleted_at) continue;
      const prev = byCat.get(e.category_id);
      byCat.set(e.category_id, {
        last: !prev || e.date > prev.last ? e.date : prev.last,
        count: (prev?.count ?? 0) + (e.date.slice(0, 7) === month ? 1 : 0),
      });
    }
    const top = [...byCat.entries()]
      .map(([id, v]) => ({ category: categories.find((c) => c.id === id), last: v.last, count: v.count }))
      .filter((x) => !!x.category && (isIncome ? x.category.type === 'income' : x.category.type !== 'income'))
      .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
      .slice(0, 5);
    return { byCat, top };
  }, [expenses.items, categories, form.date, isIncome]);

  // Circle row = current pick first (so it's always visible and ringed),
  // then the recents behind it, capped at five plus the ▦ All button.
  const categoryRow = useMemo(() => {
    const seen = new Set<string>();
    const list: Category[] = [];
    if (selectedCategory && ((form.type ?? 'expense') === 'income' ? selectedCategory.type === 'income' : selectedCategory.type !== 'income')) {
      list.push(selectedCategory);
      seen.add(selectedCategory.id);
    }
    for (const u of categoryUsage.top) {
      if (u.category && !seen.has(u.category.id)) {
        list.push(u.category);
        seen.add(u.category.id);
      }
    }
    return list.slice(0, 5);
  }, [selectedCategory, categoryUsage, form.type]);

  // ── Pay-from-plan selection: fill the form from the rule, keep the date at
  // today, and flag the submit path to book this slot and re-anchor the
  // schedule from this payment date. Touched fields are marked so a later
  // receipt OCR never clobbers the plan-provided values.
  const availablePlans = useMemo(
    () => rulesCache.filter((r) => r.is_active),
    [rulesCache],
  );

  // Circle row = current plan first, then the soonest-due behind it (overdue
  // dates sort to the front), capped at five plus the ▦ All popover — mirrors
  // the category & account circle rows below.
  const planRow = useMemo(() => {
    const seen = new Set<string>();
    const list: RecurringRule[] = [];
    if (payPlan) {
      list.push(payPlan);
      seen.add(payPlan.id);
    }
    const byDue = [...availablePlans].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
    for (const r of byDue) {
      if (!seen.has(r.id)) {
        list.push(r);
        seen.add(r.id);
      }
    }
    return list.slice(0, 5);
  }, [availablePlans, payPlan]);

  function handleSelectPlan(rule: RecurringRule) {
    setPlanDropdownOpen(false);
    setPlanRowOpen(false); // collapse to the "🔁 PlanName" line, like "Note added"
    setPayPlan(rule);
    const amt = Number(rule.amount);
    setRawAmount(Number.isFinite(amt) ? String(amt) : '');
    setForm((prev) => ({
      ...prev,
      type: 'expense',
      amount: amt,
      category_id: rule.category_id || prev.category_id,
      currency: rule.currency || prev.currency,
      description: rule.description?.trim() || prev.description,
      payment_method: rule.payment_method || prev.payment_method,
      bank_account_id: rule.bank_account_id ?? prev.bank_account_id,
      date: isoDate(),
    }));
    const touched = userEditedFields.current;
    (['amount', 'category', 'payment', 'description', 'date'] as const).forEach((f) => touched.add(f));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }

  // Slot chip shown on each plan tile: human date (Sep 18), red when overdue,
  // primary tint when due today, neutral for upcoming.
  function planSlotChip(rule: RecurringRule): { label: string; tone: 'danger' | 'primary' | 'muted' } {
    const due = rule.next_due_date;
    const late = Math.max(
      0,
      Math.round((new Date(`${isoDate()}T00:00:00`).getTime() - new Date(`${due}T00:00:00`).getTime()) / 86_400_000),
    );
    if (late > 0) return { label: `${t('recurring_overdue') || 'Overdue'} ${late}d`, tone: 'danger' };
    if (due === isoDate()) return { label: t('recurring_due_today') || 'Due today', tone: 'primary' };
    let text = due;
    try {
      text = format(parseISO(due), 'MMM d');
    } catch {
      // keep raw ISO if the row carries an unexpected format
    }
    return { label: `${t('recurring_next_due_short') || 'next due'} ${text}`, tone: 'muted' };
  }

  function cycleLabel(rule: RecurringRule): string {
    if (rule.frequency === 'daily') return 'Daily';
    if (rule.frequency === 'weekly') return 'Weekly';
    if (rule.frequency === 'custom') return `Every ${rule.interval_days ?? 30} days`;
    return 'Monthly';
  }

  // Rule-linked rows get a three-way delete: payment only, plan + payment, or cancel.
  function requestDelete() {
    if (!planRuleId) {
      setDeleteConfirmOpen(true);
      return;
    }
    Alert.alert(
      t('recurring_delete_title') || 'Delete this payment?',
      t('recurring_delete_plan_question') || 'This entry belongs to a recurring plan. Cancel the plan too?',
      [
        { text: t('common_cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('recurring_delete_plan_too') || 'Cancel plan too',
          style: 'destructive',
          onPress: () => {
            void Promise.all([
              softDeleteExpense(expenseId!, userId),
              updateRecurringRule(planRuleId, { is_active: false }, userId),
            ])
              .then(() => {
                notifyExpensesChanged();
                showToast({ type: 'success', message: t('bin_moved_toast') });
                handleBack();
              })
              .catch((err) => setError(err instanceof Error ? err.message : 'Could not delete this expense.'));
          },
        },
        {
          text: t('recurring_delete_payment_only') || 'This payment only',
          style: 'destructive',
          onPress: () => {
            void softDeleteExpense(expenseId!, userId)
              .then(() => {
                notifyExpensesChanged();
                showToast({ type: 'success', message: t('bin_moved_toast') });
                handleBack();
              })
              .catch((err) => setError(err instanceof Error ? err.message : 'Could not delete this expense.'));
          },
        },
      ],
    );
  }
  const closeAllDropdowns = () => {
    if (categoryDropdownOpen) setCategoryDropdownOpen(false);
    if (accountDropdownOpen) setAccountDropdownOpen(false);
    if (paymentDropdownOpen) setPaymentDropdownOpen(false);
    if (planDropdownOpen) setPlanDropdownOpen(false);
  };

  // The floating panels render in a box-none overlay at the screen root (see
  // the JSX near the end of the return) — NOT in a Modal: a Modal is its own
  // window and swallows every touch behind it, which made the whole form feel
  // frozen while a dropdown was open. The panel's ScrollView sits on top of
  // the form instead, so it scrolls natively and the page behind stays live.
  // The anchor's window rect is measured when the ▦ All button is tapped.
  // Rough full-list heights (rows + footer) used to decide below-vs-above.
  // The ScrollView scrolls what doesn't fit, so these are comfort targets,
  // not hard requirements.
  const PANEL_NEED: Record<'category' | 'account' | 'plan', number> = {
    category: 300,
    account: 320,
    plan: 350,
  };

  const openDropdown = (
    kind: 'category' | 'account' | 'plan',
    ref: React.RefObject<View | null>,
  ) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    // Clear first so the panel only mounts once the fresh rect arrives —
    // measureInWindow is async, and rendering with a stale rect would flash
    // the popover at the wrong card's position for a frame.
    setPopoverRect(null);
    ref.current?.measureInWindow((x, y, w, h) => {
      const belowTop = y + (h || 0) + 6;
      const chrome = 70; // padding + borders + pinned footer row
      const spaceBelow = screenHeight - belowTop - 24;
      const spaceAbove = y - 24;
      const listNeed = PANEL_NEED[kind] - chrome;
      if (spaceBelow >= Math.min(listNeed, 190)) {
        // Just below the card — the normal case.
        setPopoverRect({
          top: belowTop,
          left: x,
          width: w,
          scrollMax: Math.max(130, Math.min(listNeed, spaceBelow)),
        });
      } else if (spaceAbove >= Math.min(listNeed, 190)) {
        // Card sits near the bottom (bank account / pay-from-plan while the
        // keyboard is up): flip ABOVE so the whole panel stays visible and
        // scrollable instead of collapsing into an off-screen sliver.
        setPopoverRect({
          bottom: Math.max(24, screenHeight - y + 6),
          left: x,
          width: w,
          scrollMax: Math.max(130, Math.min(listNeed, spaceAbove)),
        });
      } else {
        // Neither side has a comfortable room: keep the panel fully on
        // screen with a 160px scroll viewport.
        setPopoverRect({
          top: Math.min(belowTop, Math.max(96, screenHeight - 300)),
          left: x,
          width: w,
          scrollMax: 160,
        });
      }
    });
    setCategoryDropdownOpen(kind === 'category');
    setAccountDropdownOpen(kind === 'account');
    setPlanDropdownOpen(kind === 'plan');
    setPaymentDropdownOpen(false);
  };

  const toggleDropdown = (
    kind: 'category' | 'account' | 'plan',
    ref: React.RefObject<View | null>,
  ) => {
    const isOpen =
      kind === 'category' ? categoryDropdownOpen : kind === 'account' ? accountDropdownOpen : planDropdownOpen;
    if (isOpen) closeAllDropdowns();
    else openDropdown(kind, ref);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 36}
    >
      <View style={{ flex: 1 }}>
        {/* Everything except the floating panel overlay — the scrolling form
            AND the fixed bottom bar — sits under one capture: pressing
            anywhere outside an open panel closes it on the SAME touch-down,
            and the press still passes through to the control under the
            finger (Google-style dismissal). The panels are NOT descendants
            of this View, so their own taps/drags are never captured here. */}
        <View
          style={{ flex: 1 }}
          onStartShouldSetResponderCapture={() => {
            if (categoryDropdownOpen || accountDropdownOpen || planDropdownOpen) {
              closeAllDropdowns();
            }
            return false;
          }}
        >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={closeAllDropdowns}
          // Web: wheel/trackpad scrolling never fires onScrollBeginDrag, so the
          // viewport-anchored overlay panels would drift off their anchor cards
          // while the form scrolls behind them. Close on any scroll (no-op when
          // no dropdown is open).
          onScroll={closeAllDropdowns}
          // Google-style outside dismissal without stealing the touch: an open
          // popover closes on a press anywhere in the form, and the SAME press
          // still reaches the control under the finger (return false keeps the
          // bubble phase). The panels are NOT inside this ScrollView anymore
          // (they live in the root overlay), so their own taps never land here.
          onStartShouldSetResponderCapture={() => {
            if (categoryDropdownOpen || accountDropdownOpen || planDropdownOpen) {
              closeAllDropdowns();
            }
            return false;
          }}
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
                  (form.type ?? 'expense') === 'income' ? theme.colors.income : 'transparent',
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

          {/* ── PART OF A PLAN badge (edit mode, rule-linked row) ── */}
          {expenseId && planRuleId ? (
            <Pressable
              onPress={() => router.push('/recurring')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                paddingVertical: 9,
                borderRadius: theme.radius.md,
                backgroundColor: theme.isDark ? 'rgba(99,102,241,0.12)' : 'rgba(79,70,229,0.06)',
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.colors.primary,
              }}
            >
              <Repeat size={14} color={theme.colors.primary} />
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.primary }}>
                {t('recurring_part_of_plan') || 'Part of a recurring plan'} · {t('recurring_manage_plan') || 'manage'} →
              </Text>
            </Pressable>
          ) : null}

          {/* ── 2. HERO AMOUNT & CURRENCY DISPLAY CARD ── */}
          <Card
            style={{
              padding: theme.spacing.lg,
              gap: 12,
              backgroundColor: theme.isDark ? '#111827' : theme.colors.cardHighlight,
              borderWidth: 2,
              // Red alert while the entry exceeds the selected account's live balance.
              borderColor: overBalance
                ? theme.colors.danger
                : (form.type ?? 'expense') === 'income'
                  ? theme.colors.income
                  : theme.colors.primary,
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
                  color: (form.type ?? 'expense') === 'income' ? theme.colors.income : theme.colors.primary,
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
                  borderColor: (form.type ?? 'expense') === 'income' ? theme.colors.income : theme.colors.primary,
                }}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    color: (form.type ?? 'expense') === 'income' ? theme.colors.income : theme.colors.primary,
                    fontSize: 12,
                  }}
                >
                  {form.currency}
                </Text>
                <ChevronDown
                  size={14}
                  color={(form.type ?? 'expense') === 'income' ? theme.colors.income : theme.colors.primary}
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
                  color: (form.type ?? 'expense') === 'income' ? theme.colors.income : theme.colors.primary,
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

          {/* ── 2.5 PAY FROM PLAN — collapses to a single line like the
              Add-a-note row. Expanded: a circle row of quick picks (booked
              plan leads, then soonest-due) plus a dashed ▦ All that opens the
              floating Modal with the rich plan tiles. Selecting fills the whole
              form; re-tapping the checked circle unbooks it. ── */}
          {!expenseId && !isIncome && availablePlans.length > 0 ? (
            <View style={{ position: 'relative', zIndex: planDropdownOpen ? 40 : 0 }}>
            <View style={{ gap: theme.spacing.xs }}>
              {/* Collapsed single line, same interaction as the Add-a-note row. */}
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  if (planDropdownOpen) setPlanDropdownOpen(false);
                  setPlanRowOpen((v) => !v);
                }}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
              >
                <Text
                  variant="caption"
                  style={{ fontWeight: '800', color: planRowOpen || payPlan ? theme.colors.primary : theme.colors.textMuted }}
                >
                  {payPlan && !planRowOpen
                    ? `🔁 ${payPlan.description?.trim() || payPlan.categories?.name || 'Plan'}`
                    : `🔁 ${t('expense_pay_from_plan') || 'Pay from plan'} (${availablePlans.length})`}
                </Text>
                <ChevronDown
                  size={15}
                  color={theme.colors.textMuted}
                  style={{ transform: [{ rotate: planRowOpen ? '180deg' : '0deg' }] }}
                />
              </Pressable>

              {planRowOpen && (
              <>

              {/* ── Icon-circle row ── */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 10, paddingVertical: 4, paddingRight: 4 }}
              >
                {planRow.map((rule) => {
                  const isSelected = payPlan?.id === rule.id;
                  return (
                    <Pressable
                      key={rule.id}
                      onPress={() => {
                        if (isSelected) {
                          // Re-tapping the booked circle unbooks the plan
                          // (filled fields stay, same as the old ✕ clear).
                          setPayPlan(null);
                          setPlanDropdownOpen(false);
                        } else {
                          handleSelectPlan(rule);
                        }
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                      }}
                      style={{ width: 60, alignItems: 'center', gap: 5 }}
                    >
                      <View
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 23,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: isSelected ? 2 : 1,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: isSelected
                            ? (theme.isDark ? 'rgba(99,102,241,0.2)' : 'rgba(79,70,229,0.09)')
                            : theme.colors.surfaceElevated,
                        }}
                      >
                        <CategoryIcon
                          name={rule.categories?.icon}
                          size={20}
                          color={isSelected ? theme.colors.primary : theme.colors.text}
                        />
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          width: 60,
                          textAlign: 'center',
                          fontSize: 10.5,
                          fontWeight: isSelected ? '800' : '600',
                          color: isSelected ? theme.colors.primary : theme.colors.textMuted,
                          includeFontPadding: false,
                        }}
                      >
                        {rule.description?.trim() || rule.categories?.name || 'Plan'}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => toggleDropdown('plan', planAnchorRef)}
                  style={{ width: 60, alignItems: 'center', gap: 5 }}
                >
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.6,
                      borderStyle: 'dashed',
                      borderColor: planDropdownOpen ? theme.colors.primary : theme.colors.textMuted,
                      backgroundColor: planDropdownOpen
                        ? (theme.isDark ? 'rgba(99,102,241,0.14)' : 'rgba(79,70,229,0.06)')
                        : 'transparent',
                    }}
                  >
                    <LayoutGrid size={18} color={planDropdownOpen ? theme.colors.primary : theme.colors.textMuted} />
                  </View>
                  <Text
                    style={{
                      width: 60,
                      textAlign: 'center',
                      fontSize: 10.5,
                      fontWeight: '800',
                      color: planDropdownOpen ? theme.colors.primary : theme.colors.textMuted,
                      includeFontPadding: false,
                    }}
                  >
                    {t('expense_all') || 'All'}
                  </Text>
                </Pressable>
              </ScrollView>

              {/* One line of context under the row */}
              <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                {payPlan
                  ? (t('expense_plan_autofill_note') || 'Saving pays this installment — the next due date is calculated from today.')
                  : `${availablePlans.length} ${availablePlans.length === 1 ? 'active plan' : 'active plans'} · ${t('expense_plan_fills_hint') || 'fills amount, category & date'}`}
              </Text>
              </>
              )}

              {/* Zero-height anchor: measured when ▦ All is tapped; the tiles
                  panel renders in the root-level overlay below. */}
              <View ref={planAnchorRef} style={{ position: 'relative' }} />
            </View>
            </View>
          ) : null}

          {/* ── 3. CATEGORY SELECTOR (IN-PLACE DROPDOWN DESIGN) ── */}
          {/* zIndex lifts this card above later siblings while the All-popover
              floats over them (same overlay pattern as the History toolbar). */}
          <View style={{ position: 'relative', zIndex: categoryDropdownOpen ? 40 : 0 }}>
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

            {/* ── Icon-circle row: the current pick leads the row, followed by
                the most-used categories; the dashed ▦ All opens the full
                in-place list. One tap to change, zero wasted vertical space. ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingVertical: 4, paddingRight: 4 }}
            >
              {categoryRow.map((cat) => {
                const isSelected = form.category_id === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      userEditedFields.current.add('category');
                      setForm((prev) => ({ ...prev, category_id: cat.id }));
                      setCategoryDropdownOpen(false);
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                    }}
                    style={{ width: 60, alignItems: 'center', gap: 5 }}
                  >
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 23,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: isSelected
                          ? (theme.isDark ? 'rgba(99,102,241,0.2)' : 'rgba(79,70,229,0.09)')
                          : theme.colors.surfaceElevated,
                      }}
                    >
                      <CategoryIcon name={cat.icon} size={20} color={isSelected ? theme.colors.primary : theme.colors.text} />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        width: 60,
                        textAlign: 'center',
                        fontSize: 10.5,
                        fontWeight: isSelected ? '800' : '600',
                        color: isSelected ? theme.colors.primary : theme.colors.textMuted,
                        includeFontPadding: false,
                      }}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => {
                  toggleDropdown('category', categoryAnchorRef);
                }}
                style={{ width: 60, alignItems: 'center', gap: 5 }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.6,
                    borderStyle: 'dashed',
                    borderColor: categoryDropdownOpen ? theme.colors.primary : theme.colors.textMuted,
                    backgroundColor: categoryDropdownOpen
                      ? (theme.isDark ? 'rgba(99,102,241,0.14)' : 'rgba(79,70,229,0.06)')
                      : 'transparent',
                  }}
                >
                  <LayoutGrid size={18} color={categoryDropdownOpen ? theme.colors.primary : theme.colors.textMuted} />
                </View>
                <Text
                  style={{
                    width: 60,
                    textAlign: 'center',
                    fontSize: 10.5,
                    fontWeight: '800',
                    color: categoryDropdownOpen ? theme.colors.primary : theme.colors.textMuted,
                    includeFontPadding: false,
                  }}
                >
                  {t('expense_all') || 'All'}
                </Text>
              </Pressable>
            </ScrollView>

            {/* Zero-height anchor: measured when ▦ All is tapped; the panel
                itself renders in the root-level overlay below. */}
            <View ref={categoryAnchorRef} style={{ position: 'relative' }} />
          </Card>
          </View>

          {/* ── 3.5 BANK ACCOUNT & WALLET SELECTOR (IN-PLACE DROPDOWN DESIGN) ── */}
          {/* zIndex lifts this card above later siblings while the All-popover
              floats over them (same overlay pattern as the History toolbar). */}
          <View style={{ position: 'relative', zIndex: accountDropdownOpen ? 40 : 0 }}>
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

            {/* ── Icon-circle row (same design as the category picker above):
                the current pick leads, then the richest accounts; the dashed
                ▦ All opens the full in-place list with live balances. ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingVertical: 4, paddingRight: 4 }}
            >
              {accountRow.map((acc) => {
                const isSelected = form.bank_account_id === acc.id;
                const accent = acc.color || theme.colors.primary;
                return (
                  <Pressable
                    key={acc.id}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, bank_account_id: acc.id }));
                      setAccountDropdownOpen(false);
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                    }}
                    style={{ width: 60, alignItems: 'center', gap: 5 }}
                  >
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 23,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? accent : theme.colors.border,
                        backgroundColor: isSelected ? `${accent}18` : theme.colors.surfaceElevated,
                      }}
                    >
                      <CategoryIcon name={acc.icon} size={20} color={isSelected ? accent : theme.colors.text} />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        width: 60,
                        textAlign: 'center',
                        fontSize: 10.5,
                        fontWeight: isSelected ? '800' : '600',
                        color: isSelected ? accent : theme.colors.textMuted,
                        includeFontPadding: false,
                      }}
                    >
                      {acc.name}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => toggleDropdown('account', accountAnchorRef)}
                style={{ width: 60, alignItems: 'center', gap: 5 }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.6,
                    borderStyle: 'dashed',
                    borderColor: accountDropdownOpen ? theme.colors.primary : theme.colors.textMuted,
                    backgroundColor: accountDropdownOpen
                      ? (theme.isDark ? 'rgba(99,102,241,0.14)' : 'rgba(79,70,229,0.06)')
                      : 'transparent',
                  }}
                >
                  <LayoutGrid size={18} color={accountDropdownOpen ? theme.colors.primary : theme.colors.textMuted} />
                </View>
                <Text
                  style={{
                    width: 60,
                    textAlign: 'center',
                    fontSize: 10.5,
                    fontWeight: '800',
                    color: accountDropdownOpen ? theme.colors.primary : theme.colors.textMuted,
                    includeFontPadding: false,
                  }}
                >
                  {t('expense_all') || 'All'}
                </Text>
              </Pressable>
            </ScrollView>

            {/* Zero-height anchor: measured when ▦ All is tapped; the panel
                itself renders in the root-level overlay below. Balances stay
                dropdown-only (Live: … on each row). */}
            <View ref={accountAnchorRef} style={{ position: 'relative' }} />
          </Card>
          </View>

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
                    onChangeText={(description) => {
                      if (description) userEditedFields.current.add('description');
                      setForm((current) => ({ ...current, description }));
                    }}
            />

            {/* Quick Tag Pills */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {((form.type ?? 'expense') === 'income' ? INCOME_QUICK_TAGS : EXPENSE_QUICK_TAGS).map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => {
                    userEditedFields.current.add('description');
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
            {/* ── NOTES (collapsed optional; the record view shows this) ── */}
            <View style={{ gap: theme.spacing.xs }}>
              <Pressable
                onPress={() => setNotesOpen((v) => !v)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
              >
                <Text variant="caption" style={{ fontWeight: '800', color: notesOpen || form.notes ? theme.colors.primary : theme.colors.textMuted }}>
                  {form.notes && !notesOpen
                    ? `📝 ${t('expense_note_label') || 'Note added'}`
                    : `📝 ${t('expense_add_note') || 'Add a note (optional)'}`}
                </Text>
                <ChevronDown
                  size={15}
                  color={theme.colors.textMuted}
                  style={{ transform: [{ rotate: notesOpen ? '180deg' : '0deg' }] }}
                />
              </Pressable>

              {notesOpen ? (
                <TextInput
                  value={form.notes ?? ''}
                  onChangeText={(notes) => setForm((current) => ({ ...current, notes }))}
                  placeholder={t('expense_note_placeholder') || 'Split info, reason, follow-up…'}
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  style={{
                    minHeight: 78,
                    textAlignVertical: 'top',
                    padding: 12,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                    fontSize: 13.5,
                    fontWeight: '600',
                    includeFontPadding: false,
                  }}
                />
              ) : null}
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
                      userEditedFields.current.add('time');
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
                  { key: 'Cash', icon: '💵', label: 'Cash', },
                  { key: 'Card', icon: '💳', label: 'Card', },
                  { key: 'UPI', icon: '📱', label: 'UPI', },
                  { key: 'Other', icon: '🪙', label: 'Other', },
                ] as { key: PaymentMethod; icon: string; label: string; sub: string }[]).map((pm) => {
                  const isSelected = form.payment_method === pm.key;
                  return (
                    <Pressable
                      key={pm.key}
                      onPress={() => {
                        userEditedFields.current.add('payment');
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
                      source={{ uri: receiptPreviewUrl || form.receipt_image_url || undefined }}
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
                    onPress={() => {
                      // A pending local pick has nothing in storage yet — just
                      // clear it. A saved receipt (edit mode) stays in storage
                      // until the row is actually saved without it, so backing
                      // out of the form loses nothing.
                      setPendingReceipt(null);
                      setForm((prev) => ({ ...prev, receipt_image_url: null }));
                    }}
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
              onPress={requestDelete}
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
                    <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.income }}>
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
                userEditedFields.current.add('date');
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
          title={isIncome ? t('expense_delete_income_title') : t('expense_delete_title')}
          message={t('bin_move_expense_message')}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={() => {
            setDeleteConfirmOpen(false);
            void softDeleteExpense(expenseId!, userId).then(() => {
              notifyExpensesChanged();
              showToast({ type: 'success', message: t('bin_moved_toast') });
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
            paddingBottom: Math.max(insets.bottom, 12),
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
                color: isIncome ? theme.colors.income : theme.colors.primary,
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
              backgroundColor: isIncome ? theme.colors.income : theme.colors.primary,
            }}
          />
        </View>
        </View>

        {/* ── DROPDOWN OVERLAY LAYER (category / account / plan panels) ──
            Sits at the screen root and renders the three ▦ All panels at the
            window coords measured from their anchors. box-none lets touches
            that miss a panel fall through to the live form behind — no Modal
            window, so the page is never frozen while a dropdown is open. */}
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
          }}
        >
            {categoryDropdownOpen && popoverRect && (
              <View
                style={{
                      position: 'absolute',
                      top: popoverRect?.top,
                      bottom: popoverRect?.bottom,
                      left: popoverRect?.left ?? theme.spacing.lg,
                      width: popoverRect?.width ?? screenWidth - theme.spacing.lg * 2,
                      gap: 4,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 16,
                      borderWidth: 1.2,
                      borderColor: theme.colors.border,
                      padding: 6,
                      elevation: 25,
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.25,
                      shadowRadius: 10,
                    }}
                  >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  // RNW ignores showsVerticalScrollIndicator; hide the browser
                  // scrollbar via CSS scrollbar-width (web-only style prop).
                  // Android: without nestedScrollEnabled the parent form
                  // ScrollView wins the drag gesture and the list feels frozen.
                  nestedScrollEnabled
                  style={[
                    Platform.OS === 'web' ? ({ scrollbarWidth: 'none' } as never) : undefined,
                    { maxHeight: popoverRect?.scrollMax ?? 220 },
                  ]}
                >
                  {categories
                    .filter((c) => ((form.type ?? 'expense') === 'income' ? c.type === 'income' : c.type !== 'income'))
                    .map((cat) => {
                      const isSelected = form.category_id === cat.id;
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => {
                            userEditedFields.current.add('category');
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
            {accountDropdownOpen && popoverRect && (
              <View
                style={{
                      position: 'absolute',
                      top: popoverRect?.top,
                      bottom: popoverRect?.bottom,
                      left: popoverRect?.left ?? theme.spacing.lg,
                      width: popoverRect?.width ?? screenWidth - theme.spacing.lg * 2,
                      gap: 4,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 16,
                      borderWidth: 1.2,
                      borderColor: theme.colors.border,
                      padding: 6,
                      elevation: 25,
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.25,
                      shadowRadius: 10,
                    }}
                  >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  style={[
                    Platform.OS === 'web' ? ({ scrollbarWidth: 'none' } as never) : undefined,
                    { maxHeight: popoverRect?.scrollMax ?? 230 },
                  ]}
                >
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
                                color: liveBalance >= 0 ? theme.colors.income : theme.colors.danger,
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
              {planDropdownOpen && popoverRect && (
                <View
                  style={{
                        position: 'absolute',
                        top: popoverRect?.top,
                        bottom: popoverRect?.bottom,
                        left: popoverRect?.left ?? theme.spacing.lg,
                        width: popoverRect?.width ?? screenWidth - theme.spacing.lg * 2,
                        backgroundColor: theme.colors.surface,
                        borderRadius: 16,
                        borderWidth: 1.2,
                        borderColor: theme.colors.border,
                        padding: 6,
                        elevation: 25,
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.25,
                        shadowRadius: 10,
                      }}
                    >
                  {/* Plan tiles — tap to fill; selected tile locks in with a check */}
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    style={[
                      Platform.OS === 'web' ? ({ scrollbarWidth: 'none' } as never) : undefined,
                      { maxHeight: popoverRect?.scrollMax ?? 280 },
                    ]}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {availablePlans.map((rule) => {
                      const isSelected = payPlan?.id === rule.id;
                      const chip = planSlotChip(rule);
                      const chipColor = chip.tone === 'danger'
                        ? (theme.isDark ? '#F87171' : '#DC2626')
                        : chip.tone === 'primary'
                          ? theme.colors.primary
                          : theme.colors.textMuted;
                      return (
                        <Pressable
                          key={rule.id}
                          onPress={() => handleSelectPlan(rule)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            padding: 12,
                            borderRadius: theme.radius.md,
                            borderWidth: isSelected ? 1.8 : 1.2,
                            borderStyle: isSelected ? 'solid' : 'dashed',
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: isSelected
                              ? (theme.isDark ? 'rgba(99,102,241,0.16)' : 'rgba(79,70,229,0.07)')
                              : theme.colors.surfaceElevated,
                          }}
                        >
                          {/* Icon tile */}
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: `${theme.colors.primary}18`,
                              borderWidth: 1,
                              borderColor: `${theme.colors.primary}30`,
                            }}
                          >
                            <CategoryIcon name={rule.categories?.icon} size={19} color={theme.colors.primary} />
                          </View>

                          {/* Name + cycle / slot chip */}
                          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: isSelected ? theme.colors.primary : theme.colors.text }}>
                              {rule.description?.trim() || rule.categories?.name || 'Plan'}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.colors.textMuted }}>
                                {cycleLabel(rule)}
                              </Text>
                              <View
                                style={{
                                  paddingHorizontal: 7,
                                  paddingVertical: 2,
                                  borderRadius: theme.radius.full,
                                  borderWidth: 1,
                                  borderColor: chip.tone === 'muted' ? theme.colors.border : chipColor,
                                  backgroundColor: chip.tone === 'danger'
                                    ? (theme.isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)')
                                    : 'transparent',
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: chipColor }}>
                                  {chip.label}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Amount + selected badge */}
                          <View style={{ alignItems: 'flex-end', gap: 3 }}>
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight: '900',
                                color: theme.colors.text,
                                fontVariant: ['tabular-nums'],
                              }}
                            >
                              {formatMoney(Number(rule.amount), rule.currency || profile?.preferred_currency || 'NPR')}
                            </Text>
                            {isSelected ? (
                              <CheckCircle2 size={17} color={theme.colors.primary} />
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
        </View>
      </View>
      {/* Local host: expense/add is modal-presented (Android window above the
          root host). Topmost-host arbitration keeps toasts single-rendered. */}
      <ToastHost />
    </KeyboardAvoidingView>
  );
}