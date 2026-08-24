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

export async function checkAndNotifyBudgetThreshold(
  monthTotal: number,
  monthlyBudget: number,
  currency = 'NPR',
): Promise<void> {
  if (Platform.OS === 'web' || !monthlyBudget || monthlyBudget <= 0) return;

  const currentMonthKey = new Date().toISOString().slice(0, 7); // e.g. "2026-08"
  const pct = Math.floor((monthTotal / monthlyBudget) * 100);

  // Find all crossed thresholds in descending order
  const crossedThresholds = [...THRESHOLDS].reverse().filter((item) => pct >= item.percent);
  if (!crossedThresholds.length) return;

  // Find the single highest crossed threshold that has not been sent yet
  let highestUnsent: typeof THRESHOLDS[number] | null = null;
  for (const item of crossedThresholds) {
    const storageKey = `@spendflow_alert_sent_${currentMonthKey}_${item.percent}`;
    const alreadySent = await AsyncStorage.getItem(storageKey).catch(() => null);
    if (!alreadySent) {
      highestUnsent = item;
      break;
    }
  }

  if (!highestUnsent) return;

  // Mark all thresholds at or below highestUnsent as acknowledged so backlog alerts never spam
  for (const item of THRESHOLDS) {
    if (item.percent <= highestUnsent.percent) {
      const storageKey = `@spendflow_alert_sent_${currentMonthKey}_${item.percent}`;
      await AsyncStorage.setItem(storageKey, 'true').catch(() => {});
    }
  }

  const hasPermission = await requestNotificationPermissions();
  if (hasPermission) {
    let bodyMsg = '';
    if (highestUnsent.percent >= 100) {
      const excess = monthTotal - monthlyBudget;
      bodyMsg = `You have spent ${formatMoney(monthTotal, currency)} against your ${formatMoney(monthlyBudget, currency)} limit (Over by ${formatMoney(excess, currency)}).`;
    } else {
      const remaining = monthlyBudget - monthTotal;
      bodyMsg = `You have used ${pct}% (${formatMoney(monthTotal, currency)}) of your ${formatMoney(monthlyBudget, currency)} budget. ${formatMoney(remaining, currency)} remaining.`;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: highestUnsent.title,
        body: bodyMsg,
        data: { type: 'budget_threshold', percent: highestUnsent.percent },
        sound: true,
      },
      trigger: null, // Send immediately
    });
  }
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Recurring Bill Reminder',
        body: `Reminder: Your recurring payment "${description}" (${formatMoney(amount, currency)}) is due on ${dueDate}.`,
        data: { type: 'recurring_bill_due' },
        sound: true,
      },
      trigger: null, // Send immediately
    });
  }
}

// 4. Large Single Purchase Notification
export async function notifyLargeExpense(amount: number, categoryName: string, currency = 'NPR'): Promise<void> {
  if (Platform.OS === 'web' || !amount || amount < 5000) return;

  const hasPermission = await requestNotificationPermissions();
  if (hasPermission) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '💸 Large Purchase Recorded',
        body: `Recorded purchase of ${formatMoney(amount, currency)} in ${categoryName}.`,
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
  categoryName: string,
  description?: string | null,
  currency = 'NPR',
): Promise<void> {
  if (Platform.OS === 'web' || !amount) return;

  const hasPermission = await requestNotificationPermissions();
  if (hasPermission) {
    const descText = description?.trim() ? ` (${description.trim()})` : '';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Expense Recorded',
        body: `Successfully logged ${formatMoney(amount, currency)} in ${categoryName}${descText}.`,
        data: { type: 'expense_added' },
        sound: true,
      },
      trigger: null, // Send immediately
    });
  }
}
