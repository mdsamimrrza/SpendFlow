import { Platform } from 'react-native';
import type { NotificationRequestInput } from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadNotificationsModule } from '@/services/notificationsModule';
import { formatMoney } from '@/utils/format';
import { supabase } from '@/utils/supabase';

// Detect if running inside Expo Go (where remote push is unsupported since SDK 53)
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Null inside Expo Go — every consumer below no-ops instead of crashing.
const Notifications = loadNotificationsModule();

async function scheduleLocal(request: NotificationRequestInput): Promise<void> {
  await Notifications?.scheduleNotificationAsync(request);
}

// ── Persist a notification record to Supabase ──────────────────────────────
// userId is optional — if not available (e.g. on web) we skip the DB write.
async function saveNotification(
  userId: string | null | undefined,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body,
      data: data ?? null,
      is_read: false,
    });
  } catch {
    // Best-effort — never block the notification from firing
  }
}

// In-memory userId store — set once on app start via setNotificationUserId()
let _currentUserId: string | null = null;
export function setNotificationUserId(userId: string | null) {
  _currentUserId = userId;
}
// ─────────────────────────────────────────────────────────────────────────────

// Configure notification behavior — only register handler when the module
// loaded (real builds) and we're not inside Expo Go
if (Notifications && !isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// 1. Request Notification Permissions & Initialize Android Channel
async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  // Expo Go: the notifications module is unavailable — treat as "no permission".
  if (!Notifications) return false;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'SpendFlow Alerts & Budgets',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
        sound: 'default',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

export async function initNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await requestNotificationPermissions();
  } catch {
    // Ignore init errors
  }
}

// 2. Graduated Budget Multi-Threshold System (25%, 50%, 75%, 90%, 98%, 100%+)
const THRESHOLDS = [
  { percent: 25, title: '🟢 25% Budget Milestone', emoji: '🟢' },
  { percent: 50, title: '🟡 50% Budget Halfway Mark', emoji: '🟡' },
  { percent: 75, title: '🟠 75% Budget Warning', emoji: '🟠' },
  { percent: 90, title: '🔴 90% High Alert Warning!', emoji: '🔴' },
  { percent: 98, title: '🚨 98% Emergency Limit Alert!', emoji: '🚨' },
  { percent: 100, title: '💥 Monthly Budget Exceeded!', emoji: '💥' },
] as const;

// In-memory registry to prevent concurrent / duplicate notifications
const notifiedThresholdsMemory = new Set<string>();

// ── Shared threshold-alert engine ──────────────────────────────────────────
// The budget and category-budget alerts used to duplicate this whole flow
// (bracket scan, per-month dedupe via memory + AsyncStorage, "mark this
// bracket and all lower brackets" backfill suppression, permission →
// scheduleLocal → saveNotification tail). Dedupe rules drifting between the
// two paths is a silent double-/missed-alert bug factory, so every threshold
// feature goes through this engine — new scopes add a config, not a copy.
interface ThresholdBracket {
  percent: number;
}

async function fireThresholdAlert<T extends ThresholdBracket>(config: {
  spend: number;
  budget: number;
  table: readonly T[];
  /** Storage/memory dedupe keys for the current month. Formats are already
   *  persisted on real devices — never change these strings. */
  keyFor: (monthKey: string, percent: number) => { memory: string; storage: string };
  /** Extra precondition (e.g. missing category id). Evaluated before anything. */
  enabled?: boolean;
  currency?: string;
  buildMessage: (bracket: T, pct: number) => {
    title: string;
    body: string;
    pushData: Record<string, unknown>;
    dbType: string;
    dbData: Record<string, unknown>;
  };
}): Promise<void> {
  const { spend, budget, table, keyFor, currency = 'NPR' } = config;
  if (Platform.OS === 'web' || config.enabled === false || !budget || budget <= 0) return;

  const monthKey = new Date().toISOString().slice(0, 7); // e.g. "2026-08"
  const pct = Math.floor((spend / budget) * 100);

  // The SINGLE HIGHEST bracket matching the current percentage: 51% → 50,
  // 76% → 75, 100%+ → 100.
  const bracket = [...table].reverse().find((item) => pct >= item.percent);
  if (!bracket) return;

  const target = keyFor(monthKey, bracket.percent);
  if (notifiedThresholdsMemory.has(target.memory)) return;
  const alreadySent = await AsyncStorage.getItem(target.storage).catch(() => null);
  if (alreadySent) {
    notifiedThresholdsMemory.add(target.memory);
    return;
  }

  // Mark this bracket AND ALL LOWER BRACKETS as sent IMMEDIATELY, so a later
  // check never backfires a skipped milestone (hitting 50% kills the 25%).
  for (const item of table) {
    if (item.percent <= bracket.percent) {
      const lower = keyFor(monthKey, item.percent);
      notifiedThresholdsMemory.add(lower.memory);
      await AsyncStorage.setItem(lower.storage, 'true').catch(() => {});
    }
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const message = config.buildMessage(bracket, pct);
  await scheduleLocal({
    content: {
      title: message.title,
      body: message.body,
      data: message.pushData,
      sound: true,
      // @ts-expect-error channelId is supported on Android
      channelId: 'default',
    },
    trigger: null, // Send immediately
  });
  void saveNotification(_currentUserId, message.dbType, message.title, message.body, message.dbData);
}

const budgetAlertKeys = (monthKey: string, percent: number) => ({
  memory: `${monthKey}_${percent}`,
  storage: `@spendflow_alert_sent_${monthKey}_${percent}`,
});

const categoryAlertKeys = (categoryId: string) => (monthKey: string, percent: number) => ({
  memory: `cat_${monthKey}_${categoryId}_${percent}`,
  storage: `@spendflow_cat_alert_sent_${monthKey}_${categoryId}_${percent}`,
});

export async function resetBudgetAlertHistory(monthKey?: string): Promise<void> {
  const currentMonthKey = monthKey || new Date().toISOString().slice(0, 7);
  for (const item of THRESHOLDS) {
    const keys = budgetAlertKeys(currentMonthKey, item.percent);
    notifiedThresholdsMemory.delete(keys.memory);
    await AsyncStorage.removeItem(keys.storage).catch(() => {});
  }
}

export async function checkAndNotifyBudgetThreshold(
  monthTotal: number,
  monthlyBudget: number,
  currency = 'NPR',
): Promise<void> {
  await fireThresholdAlert({
    spend: monthTotal,
    budget: monthlyBudget,
    table: THRESHOLDS,
    keyFor: budgetAlertKeys,
    currency,
    buildMessage: (bracket, pct) => {
      const body =
        bracket.percent >= 100
          ? `You have spent ${formatMoney(monthTotal, currency)} against your ${formatMoney(monthlyBudget, currency)} limit (Over by ${formatMoney(monthTotal - monthlyBudget, currency)}).`
          : `You have used ${pct}% (${formatMoney(monthTotal, currency)}) of your ${formatMoney(monthlyBudget, currency)} budget. ${formatMoney(monthlyBudget - monthTotal, currency)} remaining.`;
      return {
        title: bracket.title,
        body,
        pushData: { type: 'budget_threshold', percent: bracket.percent },
        dbType: 'budget_threshold',
        dbData: { percent: bracket.percent },
      };
    },
  });
}

// Category Budget Thresholds (Strictly 90% and 100% only)
const CATEGORY_THRESHOLDS = [
  { percent: 90, emoji: '⚠️' },
  { percent: 100, emoji: '💥' },
] as const;

export async function checkAndNotifyCategoryBudgetThreshold(
  categoryId: string,
  categoryName: string,
  categoryIcon = '📌',
  monthCategoryTotal: number,
  categoryMonthlyBudget: number,
  currency = 'NPR',
): Promise<void> {
  await fireThresholdAlert({
    spend: monthCategoryTotal,
    budget: categoryMonthlyBudget,
    table: CATEGORY_THRESHOLDS,
    keyFor: categoryAlertKeys(categoryId),
    enabled: Boolean(categoryId),
    currency,
    buildMessage: (bracket, pct) => {
      const cleanName = cleanCategoryLabel(categoryName) || 'Category';
      const isExceeded = bracket.percent >= 100;
      const title = `${bracket.emoji} ${cleanName}: ${isExceeded ? 'Budget Exceeded!' : '90% Budget Alert'}`;
      const body = isExceeded
        ? `${categoryIcon} You have spent ${formatMoney(monthCategoryTotal, currency)} of your ${formatMoney(categoryMonthlyBudget, currency)} ${cleanName} limit (Over by ${formatMoney(monthCategoryTotal - categoryMonthlyBudget, currency)}).`
        : `${categoryIcon} You have used ${pct}% (${formatMoney(monthCategoryTotal, currency)}) of your ${formatMoney(categoryMonthlyBudget, currency)} ${cleanName} budget. ${formatMoney(categoryMonthlyBudget - monthCategoryTotal, currency)} remaining.`;
      return {
        title,
        body,
        pushData: { type: 'category_budget_threshold', categoryId, percent: bracket.percent },
        dbType: 'category_budget_threshold',
        dbData: { categoryId, percent: bracket.percent },
      };
    },
  });
}

// Helper to ensure clean, human-readable category names and strip raw database IDs / UUIDs
function cleanCategoryLabel(raw?: string | null): string {
  if (!raw || !raw.trim()) return '';
  const val = raw.trim();
  const stripped = val.replace(/^default-/, '').replace(/^cat_/, '');
  // If it's a UUID, don't show raw hash string
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(stripped)) {
    return '';
  }
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// 3. Recurring Bills Notification Helper
export async function notifyRecurringBillDue(
  description: string,
  amount: number,
  dueDate: string,
  currency = 'NPR',
): Promise<void> {
  if (Platform.OS === 'web' || !amount) return;

  const hasPermission = await requestNotificationPermissions();
  if (hasPermission) {
    const formattedAmount = formatMoney(amount, currency);
    const recurringTitle = '🔔 Recurring Bill Reminder';
    const recurringBody = `Reminder: Your recurring payment "${description}" (${formattedAmount}) is due on ${dueDate}.`;
    await scheduleLocal({
      content: {
        title: recurringTitle,
        body: recurringBody,
        data: { type: 'recurring_bill_due' },
        sound: true,
        // @ts-expect-error channelId is supported on Android
        channelId: 'default',
      },
      trigger: null, // Send immediately
    });
    void saveNotification(_currentUserId, 'recurring_bill_due', recurringTitle, recurringBody, { description, amount, dueDate });
  }
}

// Per-currency large-purchase thresholds so the alert is meaningful regardless of currency
const LARGE_EXPENSE_THRESHOLDS: Record<string, number> = {
  NPR: 5000,
  INR: 5000,
  USD: 100,
  QAR: 365,
  GBP: 80,
};

// 4. Large Single Purchase Notification
export async function notifyLargeExpense(
  amount: number,
  categoryName?: string | null,
  currency = 'NPR',
): Promise<void> {
  const threshold = LARGE_EXPENSE_THRESHOLDS[currency.toUpperCase()] ?? 5000;
  if (Platform.OS === 'web' || !amount || amount < threshold) return;

  const hasPermission = await requestNotificationPermissions();
  if (hasPermission) {
    const formattedAmount = formatMoney(amount, currency);
    const category = cleanCategoryLabel(categoryName);
    const inCategoryText = category ? ` in ${category}` : '';
    const largeTitle = '💸 Large Purchase Recorded';
    const largeBody = `Recorded purchase of ${formattedAmount}${inCategoryText}.`;

    await scheduleLocal({
      content: {
        title: largeTitle,
        body: largeBody,
        data: { type: 'large_expense' },
        sound: true,
        // @ts-expect-error channelId is supported on Android
        channelId: 'default',
      },
      trigger: null, // Send immediately
    });
    void saveNotification(_currentUserId, 'large_expense', largeTitle, largeBody, { amount, currency });
  }
}

// 5. Instant Expense Added Confirmation Notification
export async function notifyExpenseAdded(
  amount: number,
  categoryName?: string | null,
  description?: string | null,
  currency = 'NPR',
): Promise<void> {
  if (Platform.OS === 'web' || !amount) return;

  const hasPermission = await requestNotificationPermissions();
  if (hasPermission) {
    const formattedAmount = formatMoney(amount, currency);
    const category = cleanCategoryLabel(categoryName);
    const note = description?.trim();

    let body = `Recorded ${formattedAmount}`;
    if (note && category) {
      body = `Logged ${formattedAmount} for "${note}" in ${category}.`;
    } else if (note) {
      body = `Logged ${formattedAmount} for "${note}".`;
    } else if (category) {
      body = `Logged ${formattedAmount} in ${category}.`;
    } else {
      body = `Successfully recorded ${formattedAmount}.`;
    }

    await scheduleLocal({
      content: {
        title: '✅ Expense Recorded',
        body,
        data: { type: 'expense_added' },
        sound: true,
        // @ts-expect-error channelId is supported on Android
        channelId: 'default',
      },
      trigger: null, // Send immediately
    });
    void saveNotification(_currentUserId, 'expense_added', '✅ Expense Recorded', body, { amount, currency });
  }
}
