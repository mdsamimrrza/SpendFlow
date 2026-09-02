import { addDays, addMonths, addWeeks, format, isBefore, parseISO } from 'date-fns';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { PaymentMethod, RecurringFrequency, RecurringRule } from '@/types';
import { getRate } from '@/services/exchange';
import { supabase } from '@/utils/supabase';

const selection = '*, categories(name, icon, color)';

export async function listRecurringRules(userId: string) {
  const { data, error } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('user_id', userId)
    .order('next_due_date');
  if (error) throw error;
  return (data ?? []) as RecurringRule[];
}

export async function createRecurringRule(userId: string, input: {
  amount: number;
  category_id: string;
  currency: string;
  description?: string | null;
  payment_method: PaymentMethod;
  frequency: RecurringFrequency;
  next_due_date: string;
}) {
  const snapshot = await getRate(input.currency || 'USD', input.next_due_date).catch(() => undefined);
  const { data, error } = await supabase
    .from('recurring_rules')
    .insert({
      user_id: userId,
      ...input,
      is_active: true,
      ...(snapshot ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' } : {}),
    })
    .select(selection)
    .single();
  if (error) throw error;
  await scheduleRecurringReminder(data as RecurringRule);
  return data as RecurringRule;
}

export async function updateRecurringRule(
  id: string,
  input: Partial<{
    amount: number;
    category_id: string;
    currency: string;
    description: string | null;
    payment_method: PaymentMethod;
    frequency: RecurringFrequency;
    next_due_date: string;
    is_active: boolean;
  }>,
) {
  const { data, error } = await supabase
    .from('recurring_rules')
    .update(input)
    .eq('id', id)
    .select(selection)
    .single();
  if (error) throw error;
  if (data) {
    await scheduleRecurringReminder(data as RecurringRule);
  }
  return data as RecurringRule;
}

async function scheduleRecurringReminder(rule: RecurringRule) {
  if (Platform.OS === 'web' || Constants.appOwnership === 'expo') return;

  try {
    const Notifications = await import('expo-notifications');
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      if (requested.status !== 'granted') return;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Recurring expense due', body: rule.description || 'A recurring expense is due today.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: parseISO(rule.next_due_date) },
    });
  } catch {
    // Notifications are optional on web and unsupported devices.
  }
}

export async function deleteRecurringRule(id: string) {
  const { error } = await supabase.from('recurring_rules').delete().eq('id', id);
  if (error) throw error;
}

function nextDate(date: Date, frequency: RecurringFrequency) {
  if (frequency === 'daily') return addDays(date, 1);
  if (frequency === 'weekly') return addWeeks(date, 1);
  return addMonths(date, 1);
}

export async function generateDueRecurringExpenses(userId: string) {
  const rules = await listRecurringRules(userId);
  const today = new Date();
  let generated = 0;

  for (const rule of rules.filter((item) => item.is_active)) {
    // 1. Collect every due occurrence date for this rule before touching the
    //    network. The global cap matches the previous serial loop.
    const dueDates: string[] = [];
    let cursor = parseISO(rule.next_due_date);
    while (!isBefore(today, cursor) && generated + dueDates.length < 100) {
      dueDates.push(format(cursor, 'yyyy-MM-dd'));
      cursor = nextDate(cursor, rule.frequency);
    }
    if (dueDates.length === 0) continue;

    // 2. Resolve the historical rate snapshot per unique occurrence date in
    //    parallel (previously one sequential lookup per inserted row).
    const uniqueDates = [...new Set(dueDates)];
    const resolvedRates = await Promise.all(
      uniqueDates.map((date) => getRate(rule.currency || 'USD', date).catch(() => undefined)),
    );
    const rateByDate = new Map(uniqueDates.map((date, idx) => [date, resolvedRates[idx]]));

    // 3. Insert all occurrences in ONE batch. The rule's next_due_date is only
    //    advanced after the insert succeeds, so a failed launch regenerates the
    //    same occurrences next time (all-or-nothing per rule — no partial
    //    generation, no duplicates).
    const rows = dueDates.map((date) => {
      const snapshot = rateByDate.get(date);
      return {
        user_id: userId,
        category_id: rule.category_id,
        amount: rule.amount,
        currency: rule.currency,
        description: rule.description,
        date,
        payment_method: rule.payment_method,
        is_recurring: true,
        recurring_rule_id: rule.id,
        ...(snapshot ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' } : {}),
      };
    });
    const { error } = await supabase.from('expenses').insert(rows);
    if (error) throw error;
    generated += dueDates.length;

    // 4. Advance the schedule once per rule (previous loop advanced it after
    //    the last occurrence of each rule; dueDates.length > 0 guarantees a change).
    const { error: updateError } = await supabase
      .from('recurring_rules')
      .update({ next_due_date: format(cursor, 'yyyy-MM-dd') })
      .eq('id', rule.id);
    if (updateError) throw updateError;
  }

  return generated;
}