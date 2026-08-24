import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatMoney } from '@/utils/format';

// Configure notification behavior for foreground & background notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// 1. Request Notification Permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SpendFlow General',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F9F8E',
    });
  }

  return true;
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

export async function checkAndNotifyBudgetThreshold(
  monthTotal: number,
  monthlyBudget: number,
  currency = 'NPR',
): Promise<void> {
  if (Platform.OS === 'web' || !monthlyBudget || monthlyBudget <= 0) return;

  const currentMonthKey = new Date().toISOString().slice(0, 7); // e.g. "2026-08"
  const pct = Math.floor((monthTotal / monthlyBudget) * 100);

  // Find the SINGLE HIGHEST threshold bracket that matches the current percentage
  // e.g. at 51%, currentBracket is 50%. At 76%, it is 75%. At 100%+, it is 100%.
  const currentBracket = [...THRESHOLDS].reverse().find((item) => pct >= item.percent);
  if (!currentBracket) return;

  const targetStorageKey = `@spendflow_alert_sent_${currentMonthKey}_${currentBracket.percent}`;
  const memoryKey = `${currentMonthKey}_${currentBracket.percent}`;

  // Check if this specific bracket has already been sent this month
  if (notifiedThresholdsMemory.has(memoryKey)) {
    return;
  }

  const alreadySent = await AsyncStorage.getItem(targetStorageKey).catch(() => null);
  if (alreadySent) {
    notifiedThresholdsMemory.add(memoryKey);
    return;
  }

  // Mark this bracket AND ALL LOWER BRACKETS as sent/acknowledged IMMEDIATELY
  // So the app will NEVER backfill or trigger lower milestone notifications (e.g. 25% when reaching 50%)
  for (const item of THRESHOLDS) {
    if (item.percent <= currentBracket.percent) {
      notifiedThresholdsMemory.add(`${currentMonthKey}_${item.percent}`);
      const storageKey = `@spendflow_alert_sent_${currentMonthKey}_${item.percent}`;
      await AsyncStorage.setItem(storageKey, 'true').catch(() => {});
    }
  }

  const hasPermission = await requestNotificationPermissions();
  if (hasPermission) {
    let bodyMsg = '';
    if (currentBracket.percent >= 100) {
      const excess = monthTotal - monthlyBudget;
      bodyMsg = `You have spent ${formatMoney(monthTotal, currency)} against your ${formatMoney(monthlyBudget, currency)} limit (Over by ${formatMoney(excess, currency)}).`;
    } else {
      const remaining = monthlyBudget - monthTotal;
      bodyMsg = `You have used ${pct}% (${formatMoney(monthTotal, currency)}) of your ${formatMoney(monthlyBudget, currency)} budget. ${formatMoney(remaining, currency)} remaining.`;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: currentBracket.title,
        body: bodyMsg,
        data: { type: 'budget_threshold', percent: currentBracket.percent },
        sound: true,
      },
      trigger: null, // Send immediately
    });
  }
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Recurring Bill Reminder',
        body: `Reminder: Your recurring payment "${description}" (${formattedAmount}) is due on ${dueDate}.`,
        data: { type: 'recurring_bill_due' },
        sound: true,
      },
      trigger: null, // Send immediately
    });
  }
}

// 4. Large Single Purchase Notification
export async function notifyLargeExpense(
  amount: number,
  categoryName?: string | null,
  currency = 'NPR',
): Promise<void> {
  if (Platform.OS === 'web' || !amount || amount < 5000) return;

  const hasPermission = await requestNotificationPermissions();
  if (hasPermission) {
    const formattedAmount = formatMoney(amount, currency);
    const category = cleanCategoryLabel(categoryName);
    const inCategoryText = category ? ` in ${category}` : '';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '💸 Large Purchase Recorded',
        body: `Recorded purchase of ${formattedAmount}${inCategoryText}.`,
        data: { type: 'large_expense' },
        sound: true,
      },
      trigger: null, // Send immediately
    });
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

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Expense Recorded',
        body,
        data: { type: 'expense_added' },
        sound: true,
      },
      trigger: null, // Send immediately
    });
  }
}
