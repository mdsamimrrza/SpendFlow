import { addDays, addMonths, addWeeks, format, isBefore, parseISO } from 'date-fns';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaymentMethod, RecurringFrequency, RecurringMode, RecurringRule, BankAccount } from '@/types';
import { validateAmount } from '@/services/validation';
import { convertExpense, getRate } from '@/services/exchange';
import { computeAccountBalances, listBankAccounts } from '@/services/bankAccounts';
import { listExpenses } from '@/services/expenses';
import { listTransfers } from '@/services/transfers';
import { supabase } from '@/utils/supabase';

const selection = '*, categories(name, icon, color)';
const NO_ACCOUNT_MESSAGE = 'No bank account or wallet exists. Add an account and balance before saving this transaction.';
const INSUFFICIENT_BALANCE_MESSAGE = 'Insufficient account balance.';

/** One balance snapshot shared across a rule's due-slot validation (audit
 * 2026-10-27, A21: the slot loop used to re-fetch accounts + the whole
 * expenses table + transfers per slot — identical data every iteration). */
interface RecurringBalanceContext {
  accounts: BankAccount[];
  balances: (BankAccount & { live_balance: number })[];
}

async function loadRecurringBalanceContext(userId: string): Promise<RecurringBalanceContext> {
  const accounts = await listBankAccounts(userId);
  const [{ items: expenses }, transfers] = await Promise.all([
    listExpenses(userId, 0, { fetchAll: true }),
    listTransfers(userId),
  ]);
  const balances = await computeAccountBalances(accounts, expenses, transfers);
  return { accounts, balances };
}

async function assertRecurringPaymentCanProceed(
  userId: string,
  accountId: string | null | undefined,
  amount: number,
  currency: string,
  date: string,
  context?: RecurringBalanceContext,
) {
  if (!accountId) throw new Error(NO_ACCOUNT_MESSAGE);
  const { accounts, balances } = context ?? (await loadRecurringBalanceContext(userId));
  const account = accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(NO_ACCOUNT_MESSAGE);
  const liveBalance = balances.find((item) => item.id === accountId)?.live_balance ?? 0;
  const required = await convertExpense(
    { amount, currency, date, exchange_rate_to_usd: null },
    account.currency || 'NPR',
  ).catch(() => amount);
  if (required > liveBalance) throw new Error(INSUFFICIENT_BALANCE_MESSAGE);
}

/** One booked installment row, trimmed for the paid-state UI. */
export interface RuleOccurrence {
  id: string;
  recurring_rule_id: string;
  recurring_due_date: string | null;
  /** Actual payment date (the ledger date). */
  date: string;
  amount: number;
  currency: string;
}

/**
 * All booked occurrences for the given rules, newest slot first. One query
 * for the whole Recurring tab — rule counts are small, so the paid state and
 * timeline are derived client-side without per-rule round trips.
 */
export async function listRuleOccurrences(userId: string, ruleIds: string[]): Promise<RuleOccurrence[]> {
  if (ruleIds.length === 0) return [];
  const { data, error } = await supabase
    .from('expenses')
    .select('id, recurring_rule_id, recurring_due_date, date, amount, currency')
    .eq('user_id', userId)
    .in('recurring_rule_id', ruleIds)
    .is('deleted_at', null)
    .order('recurring_due_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RuleOccurrence[];
}

const RULES_CACHE_PREFIX = '@spendflow_cached_recurring_rules_';

/**
 * Cross-screen refresh signal (same listener pattern as notifyExpensesChanged):
 * Bin restores fire it so an already-mounted Recurring tab reloads without
 * waiting for pull-to-refresh.
 */
type RulesChangeListener = () => void;
const ruleListeners = new Set<RulesChangeListener>();

export function notifyRecurringRulesChanged() {
  ruleListeners.forEach((listener) => listener());
}

export function subscribeRecurringRulesChanged(listener: RulesChangeListener): () => void {
  ruleListeners.add(listener);
  return () => {
    ruleListeners.delete(listener);
  };
}

export async function getCachedRecurringRules(userId?: string): Promise<RecurringRule[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(`${RULES_CACHE_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as RecurringRule[]) : [];
  } catch {
    return [];
  }
}

async function setCachedRecurringRules(userId: string, rules: RecurringRule[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${RULES_CACHE_PREFIX}${userId}`, JSON.stringify(rules));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Lists the user's recurring rules. `onCached` fires first with the locally
 * cached list (when present) so the tab paints instantly — the same
 * cache-then-network pattern as bank accounts, expenses, and transfers.
 */
export async function listRecurringRules(
  userId: string,
  onCached?: (cached: RecurringRule[]) => void,
) {
  const cached = await getCachedRecurringRules(userId);
  if (onCached && cached.length > 0) onCached(cached);
  const { data, error } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('next_due_date');
  if (error) throw error;
  const rules = (data ?? []) as RecurringRule[];
  await setCachedRecurringRules(userId, rules);
  return rules;
}

/**
 * Advances a date by one cycle of the rule. The chain is SCHEDULE-LOCKED:
 * callers always pass the current DUE slot, never a payment date — paying
 * late notes the delay but must not shift the plan.
 * 'custom' uses interval_days (falls back to 30 if unset).
 */
function nextDate(date: Date, frequency: RecurringFrequency, intervalDays?: number | null) {
  if (frequency === 'daily') return addDays(date, 1);
  if (frequency === 'weekly') return addWeeks(date, 1);
  if (frequency === 'custom') return addDays(date, intervalDays ?? 30);
  return addMonths(date, 1);
}

/** String form used across the service layer. */
export function nextDueDate(
  dueDate: string,
  frequency: RecurringFrequency,
  intervalDays?: number | null,
): string {
  return format(nextDate(parseISO(dueDate), frequency, intervalDays), 'yyyy-MM-dd');
}

/**
 * Forward-only chain advance. The .lt() guard means a stale device that read
 * an older next_due_date can never overwrite a newer schedule another device
 * already advanced (the expenses slot index already protects the rows).
 * Returns true if this call moved the schedule (false = already at/after target).
 */
async function advanceRuleChain(
  ruleId: string,
  userId: string | null,
  newDue: string,
): Promise<boolean> {
  let query = supabase
    .from('recurring_rules')
    .update({ next_due_date: newDue })
    .eq('id', ruleId)
    .lt('next_due_date', newDue);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** True when the RPC itself isn't deployed yet (migration not applied server-side). */
function isMissingFunctionError(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /function .* does not exist/i.test(error.message ?? '');
}

export async function createRecurringRule(userId: string, input: {
  amount: number;
  category_id: string;
  currency: string;
  description?: string | null;
  payment_method: PaymentMethod;
  bank_account_id?: string | null;
  frequency: RecurringFrequency;
  interval_days?: number | null;
  mode?: RecurringMode;
  /** Chain anchor (defaults to next_due_date). Due slots = anchor + N × cycle. */
  plan_start_date?: string | null;
  next_due_date: string;
}) {
  const amount = validateAmount(input.amount);
  if (typeof input.next_due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.next_due_date)) {
    throw new Error('Enter a valid next due date.');
  }
  if (input.frequency === 'custom') {
    const days = Number(input.interval_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('Custom cycle needs a repeat length of 1–365 days.');
    }
  }
  let bankAccountId = input.bank_account_id ?? null;
  const accounts = await listBankAccounts(userId);
  if (accounts.length === 0) {
    throw new Error('No bank account or wallet exists. Add an account and balance before creating a recurring plan.');
  }
  if (bankAccountId && !accounts.some((a) => a.id === bankAccountId)) {
    bankAccountId = null;
  }
  if (!bankAccountId) {
    const defaultAccount = accounts.find((account) => account.is_default);
    if (defaultAccount) {
      bankAccountId = defaultAccount.id;
    } else if (accounts.length > 0) {
      const [{ items: expenses }, transfers] = await Promise.all([
        listExpenses(userId, 0, { fetchAll: true }),
        listTransfers(userId),
      ]);
      const balances = await computeAccountBalances(accounts, expenses, transfers);
      const usage = new Map<string, number>();
      for (const expense of expenses) {
        if (expense.bank_account_id) {
          usage.set(expense.bank_account_id, (usage.get(expense.bank_account_id) || 0) + 1);
        }
      }
      bankAccountId = [...balances]
        .sort((a, b) => {
          const balanceDiff = Number(b.live_balance) - Number(a.live_balance);
          if (balanceDiff !== 0) return balanceDiff;
          return (usage.get(b.id) || 0) - (usage.get(a.id) || 0);
        })[0]?.id ?? null;
    }
  }
  if (!bankAccountId) {
    throw new Error('No bank account or wallet exists. Add an account and balance before creating a recurring plan.');
  }
  await assertRecurringPaymentCanProceed(userId, bankAccountId, amount, input.currency || 'USD', input.next_due_date);
  const snapshot = await getRate(input.currency || 'USD', input.next_due_date).catch(() => undefined);
  const { data, error } = await supabase
    .from('recurring_rules')
    .insert({
      user_id: userId,
      ...input,
      bank_account_id: bankAccountId,
      amount,
      description: input.description?.trim().slice(0, 500) || null,
      interval_days: input.frequency === 'custom' ? input.interval_days ?? null : null,
      mode: input.mode ?? 'pay_on_due',
      plan_start_date: input.plan_start_date ?? input.next_due_date,
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
    bank_account_id?: string | null;
    frequency: RecurringFrequency;
    interval_days: number | null;
    mode: RecurringMode;
    plan_start_date: string | null;
    next_due_date: string;
    is_active: boolean;
  }>,
  userId?: string | null,
) {
  if (input.amount !== undefined) {
    input = { ...input, amount: validateAmount(input.amount) };
  }
  if (input.description !== undefined) {
    input = { ...input, description: input.description?.trim().slice(0, 500) || null };
  }
  // audit run-1: update mirrors createRecurringRule's shape checks so the two
  // write paths can't diverge (interval_days <= 0 used to be able to freeze a
  // chain when routed through an update instead of create).
  if (input.next_due_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.next_due_date))) {
    throw new Error('Enter a valid next due date.');
  }
  if (input.frequency === 'custom' && (input.interval_days !== undefined || input.frequency !== undefined)) {
    const days = Number(input.interval_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('Custom cycle needs a repeat length of 1–365 days.');
    }
  }
  if (userId) {
    const accounts = await listBankAccounts(userId);
    if (accounts.length === 0) {
      throw new Error(NO_ACCOUNT_MESSAGE);
    }
    if (input.bank_account_id !== undefined) {
      if (!input.bank_account_id || !accounts.some((a) => a.id === input.bank_account_id)) {
        throw new Error(NO_ACCOUNT_MESSAGE);
      }
    }
  }
  // Ownership is enforced by RLS; the explicit user scope is defense in depth.
  let query = supabase
    .from('recurring_rules')
    .update(input)
    .eq('id', id);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.select(selection).single();
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

/**
 * Moves the rule to the Bin (soft delete). The row survives for
 * BIN_RETENTION_DAYS — restorable from app/bin.tsx — and a nightly cron sweep
 * (purge_expired_bin_items) removes it from the database for good afterwards.
 * While binned it is invisible to listRecurringRules, so it never auto-charges,
 * never shows a due card, and its schedule stays frozen for a clean restore.
 */
export async function deleteRecurringRule(id: string, userId?: string | null) {
  let query = supabase
    .from('recurring_rules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;

  if (userId) {
    const cached = await getCachedRecurringRules(userId);
    await setCachedRecurringRules(userId, cached.filter((rule) => rule.id !== id));
  }
}

/**
 * Auto-posts every due occurrence of ACTIVE `auto_charge` rules.
 * `pay_on_due` rules are skipped on purpose: their due card waits for an
 * explicit markOccurrencePaid() tap, so no row exists until money actually left.
 */
export async function generateDueRecurringExpenses(userId: string) {
  const accounts = await listBankAccounts(userId);
  if (accounts.length === 0) return 0;
  const rules = await listRecurringRules(userId);
  const today = new Date();
  let generated = 0;

  for (const rule of rules.filter(
    (item) => item.is_active && (item.mode ?? 'auto_charge') === 'auto_charge',
  )) {
    if (!rule.bank_account_id || !accounts.some((a) => a.id === rule.bank_account_id)) continue;
    // 1. Collect every due occurrence slot for this rule before touching the
    //    network. ONE balance context is loaded per rule and shared by every
    //    slot check (the data is identical across iterations — nothing is
    //    inserted between them), instead of a full-table fetch per slot.
    const context = await loadRecurringBalanceContext(userId);
    const dueSlots: string[] = [];
    let cursor = parseISO(rule.next_due_date);
    while (!isBefore(today, cursor) && generated + dueSlots.length < 100) {
      const slotDate = format(cursor, 'yyyy-MM-dd');
      try {
        await assertRecurringPaymentCanProceed(userId, rule.bank_account_id, Number(rule.amount), rule.currency || 'USD', slotDate, context);
        dueSlots.push(slotDate);
      } catch {
        break;
      }
      cursor = nextDate(cursor, rule.frequency, rule.interval_days);
    }
    if (dueSlots.length === 0) continue;

    // 2. Resolve the historical rate snapshot per unique slot date in parallel.
    const uniqueDates = [...new Set(dueSlots)];
    const resolvedRates = await Promise.all(
      uniqueDates.map((date) => getRate(rule.currency || 'USD', date).catch(() => undefined)),
    );
    const rateByDate = new Map(uniqueDates.map((date, idx) => [date, resolvedRates[idx]]));

    // 3. Insert all occurrences in ONE batch with conflict-skip semantics
    //    (INSERT ... ON CONFLICT (recurring_rule_id, recurring_due_date) DO
    //    NOTHING): the SLOT column is the dedup key, so a payment already
    //    booked for a slot — by another device, or by a Mark Paid / manual
    //    chip conversion — is skipped while the rest insert. Manual
    //    transactions are unaffected (NULLs are distinct). Genuine failures
    //    still throw, and the rule's next_due_date is only advanced after
    //    success, so a failed launch regenerates identically next time.
    const rows = dueSlots.map((date) => {
      const snapshot = rateByDate.get(date);
      return {
        user_id: userId,
        category_id: rule.category_id,
        amount: rule.amount,
        currency: rule.currency,
        description: rule.description,
        bank_account_id: rule.bank_account_id ?? null,
        date,
        payment_method: rule.payment_method,
        type: 'expense',
        is_recurring: true,
        recurring_rule_id: rule.id,
        recurring_due_date: date,
        ...(snapshot ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' } : {}),
      };
    });
    const { error } = await supabase
      .from('expenses')
      .upsert(rows, { ignoreDuplicates: true, onConflict: 'recurring_rule_id,recurring_due_date' });
    if (error) throw error;
    generated += dueSlots.length;

    // 4. Advance the schedule once per rule.
    await advanceRuleChain(rule.id, userId, format(cursor, 'yyyy-MM-dd'));
  }

  return generated;
}

/**
 * Books the CURRENT slot of a rule as paid on `paidDate` (defaults to today)
 * — the single shared write behind every "paid" surface: the Recurring tab
 * Mark Paid button, the Add Expense duplicate chip, and web.
 *
 * Chain lock: the next due date is always `slot + one cycle` — paying late
 * records `late by N days` on the row but never shifts the plan.
 *
 * Idempotent: the unique (recurring_rule_id, recurring_due_date) index means
 * a double-tap or a phone/web race books exactly one installment.
 */
export async function markOccurrencePaid(
  userId: string,
  ruleId: string,
  paidDate?: string,
): Promise<{ rule: RecurringRule; slot: string; lateDays: number }> {
  const { data: ruleRow, error: ruleError } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('id', ruleId)
    .eq('user_id', userId)
    .single();
  if (ruleError) throw ruleError;
  const rule = ruleRow as RecurringRule;
  if (!rule.bank_account_id) {
    throw new Error(NO_ACCOUNT_MESSAGE);
  }
  const accounts = await listBankAccounts(userId);
  if (!accounts.some((a) => a.id === rule.bank_account_id)) {
    throw new Error(NO_ACCOUNT_MESSAGE);
  }

  const slot = rule.next_due_date;
  const paymentDate = paidDate ?? format(new Date(), 'yyyy-MM-dd');
  await assertRecurringPaymentCanProceed(userId, rule.bank_account_id, Number(rule.amount), rule.currency || 'USD', paymentDate);
  const lateDays = Math.max(
    0,
    Math.round((parseISO(paymentDate).getTime() - parseISO(slot).getTime()) / 86_400_000),
  );

  const snapshot = await getRate(rule.currency || 'USD', paymentDate).catch(() => undefined);
  const { error: insertError } = await supabase
    .from('expenses')
    .upsert(
      {
        user_id: userId,
        category_id: rule.category_id,
        amount: rule.amount,
        currency: rule.currency,
        description: rule.description,
        bank_account_id: rule.bank_account_id ?? null,
        date: paymentDate,
        payment_method: rule.payment_method,
        type: 'expense',
        is_recurring: true,
        recurring_rule_id: rule.id,
        recurring_due_date: slot,
        ...(snapshot ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' } : {}),
      },
      { ignoreDuplicates: true, onConflict: 'recurring_rule_id,recurring_due_date' },
    );
  if (insertError) throw insertError;

  // Advance off the SLOT (chain arithmetic), never off the payment date.
  await advanceRuleChain(rule.id, userId, nextDueDate(slot, rule.frequency, rule.interval_days));

  const { data: updated, error: fetchError } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('id', rule.id)
    .single();
  if (fetchError) throw fetchError;
  return { rule: updated as RecurringRule, slot, lateDays };
}

/**
 * Skips the current cycle without keeping money in the ledger. Runs through
 * the server-side skip_recurring_occurrence RPC (migration 20261027030000),
 * which is atomic against the nightly auto-charge poster: an open slot just
 * advances the chain, and if the poster already booked this slot the booking
 * is removed in the same transaction (cancelled_booking = true). Falls back
 * to the client-side chain advance when the RPC isn't deployed yet — in that
 * state the slot is always unbooked here, because the Skip button only shows
 * for open slots and the legacy path never touches bookings.
 */
export async function skipCurrentOccurrence(
  userId: string,
  ruleId: string,
): Promise<{ rule: RecurringRule; skippedSlot: string; cancelledBooking?: boolean }> {
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('skip_recurring_occurrence', { p_rule_id: ruleId });
  if (!rpcError) {
    const result = (rpcData ?? null) as { skipped_slot?: string; cancelled_booking?: boolean } | null;
    if (!result?.skipped_slot) {
      throw new Error('Only the most recent cycle can be skipped.');
    }
    const { data: updated, error: fetchError } = await supabase
      .from('recurring_rules')
      .select(selection)
      .eq('id', ruleId)
      .single();
    if (fetchError) throw fetchError;
    return {
      rule: updated as RecurringRule,
      skippedSlot: result.skipped_slot,
      cancelledBooking: result.cancelled_booking ?? false,
    };
  }
  if (!isMissingFunctionError(rpcError)) throw rpcError;

  const { data: ruleRow, error } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('id', ruleId)
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  const rule = ruleRow as RecurringRule;

  const slot = rule.next_due_date;
  await advanceRuleChain(rule.id, userId, nextDueDate(slot, rule.frequency, rule.interval_days));

  const { data: updated, error: fetchError } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('id', ruleId)
    .single();
  if (fetchError) throw fetchError;
  return { rule: updated as RecurringRule, skippedSlot: slot };
}

/**
 * Removes an already-BOOKED auto_charge installment (the nightly poster or a
 * device booked it and moved the chain past it): deletes the occurrence and
 * keeps the chain forward, so the cycle is cancelled — the poster will not
 * re-book it. Returns null when the newest booking isn't the one the chain
 * just stepped off (older history stays). pay_on_due bookings use
 * undoLatestOccurrencePayment instead — their money really moved, so
 * re-opening the slot is the correct lever, not silent cancellation.
 */
export async function cancelRecurringOccurrence(
  userId: string,
  ruleId: string,
): Promise<{ rule: RecurringRule; cancelledSlot: string } | null> {
  const { data: rpcData, error } = await supabase
    .rpc('skip_recurring_occurrence', { p_rule_id: ruleId });
  if (error) throw error;
  const result = (rpcData ?? null) as { skipped_slot?: string; cancelled_booking?: boolean } | null;
  if (!result?.skipped_slot || !result.cancelled_booking) return null;

  const { data: updated, error: fetchError } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('id', ruleId)
    .eq('user_id', userId)
    .single();
  if (fetchError) throw fetchError;
  return { rule: updated as RecurringRule, cancelledSlot: result.skipped_slot };
}

/**
 * "Pay from plan" in the Add Expense form: books the rule's open slot with
 * the VALUES THE USER ENTERED (they may have corrected the price) and then
 * re-anchors the chain from the payment date — "everything starts counting
 * from today", the validity-style plan (28-day recharge). The Recurring tab's
 * Mark Paid keeps the schedule-locked advance; this flow is the explicit,
 * user-initiated one, so the payment date wins. The rule's amount/currency
 * self-correct to what was actually paid.
 */
export interface PlanFormPaymentValues {
  amount: number;
  category_id: string;
  currency: string;
  description?: string | null;
  notes?: string | null;
  date: string;
  time?: string | null;
  payment_method: PaymentMethod;
  bank_account_id?: string | null;
  receipt_image_url?: string | null;
}

export async function payPlanFromForm(
  userId: string,
  ruleId: string,
  values: PlanFormPaymentValues,
): Promise<{ slot: string; lateDays: number; nextDue: string }> {
  const { data: ruleRow, error: ruleError } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('id', ruleId)
    .eq('user_id', userId)
    .single();
  if (ruleError) throw ruleError;
  const rule = ruleRow as RecurringRule;
  // audit run-1: this write path must validate through the single money
  // validation source like every other amount write (validateAmount/MAX_AMOUNT).
  const amount = validateAmount(values.amount);

  const slot = rule.next_due_date;
  const paidDate = values.date;
  const lateDays = Math.max(
    0,
    Math.round((parseISO(paidDate).getTime() - parseISO(slot).getTime()) / 86_400_000),
  );

  const snapshot = await getRate(values.currency || 'USD', paidDate).catch(() => undefined);
  const { error: insertError } = await supabase
    .from('expenses')
    .insert({
      user_id: userId,
      category_id: values.category_id,
      amount,
      currency: values.currency,
      description: values.description?.trim() || rule.description || null,
      notes: values.notes?.trim() || null,
      time: values.time ?? null,
      receipt_image_url: values.receipt_image_url ?? null,
      bank_account_id: values.bank_account_id ?? rule.bank_account_id ?? null,
      date: paidDate,
      payment_method: values.payment_method,
      type: 'expense',
      is_recurring: true,
      recurring_rule_id: rule.id,
      recurring_due_date: slot,
      ...(snapshot ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' } : {}),
    });
  if (insertError) {
    if (insertError.code === '23505') {
      throw new Error('This installment was already paid — the plan may have run on another device.');
    }
    throw insertError;
  }

  // Chain re-anchors from the payment date. The .eq(next_due, slot) guard
  // means we only move the schedule off the slot THIS call just booked — a
  // concurrent advance is then re-applied forward-only as a best effort.
  const nextDue = nextDueDate(paidDate, rule.frequency, rule.interval_days);
  const { data: advanced, error: advanceError } = await supabase
    .from('recurring_rules')
    .update({ next_due_date: nextDue, amount, currency: values.currency })
    .eq('id', rule.id)
    .eq('user_id', userId)
    .eq('next_due_date', slot)
    .select('next_due_date')
    .maybeSingle();
  if (advanceError) throw advanceError;
  if (!advanced) {
    await advanceRuleChain(rule.id, userId, nextDue).catch(() => undefined);
  }

  return { slot, lateDays, nextDue };
}

/**
 * Reverses a just-booked payment: hard-deletes the occurrence row (a
 * soft-delete would keep holding the slot, so the chain position could never
 * be re-paid) and pulls next_due_date back to that slot. Only the most recent
 * booking is undoable.
 */
export async function undoLatestOccurrencePayment(
  userId: string,
  ruleId: string,
): Promise<{ rule: RecurringRule; undoneSlot: string } | null> {
  const { data: ruleRow, error: ruleError } = await supabase
    .from('recurring_rules')
    .select(selection)
    .eq('id', ruleId)
    .eq('user_id', userId)
    .single();
  if (ruleError) throw ruleError;
  const rule = ruleRow as RecurringRule;

  const { data: latest, error: findError } = await supabase
    .from('expenses')
    .select('id, recurring_due_date')
    .eq('recurring_rule_id', ruleId)
    .is('deleted_at', null)
    .order('recurring_due_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (!latest?.recurring_due_date) return null;

  const slot = latest.recurring_due_date as string;
  // Undoable only if the chain sits exactly one cycle past this slot —
  // anything older is history and stays booked.
  if (rule.next_due_date !== nextDueDate(slot, rule.frequency, rule.interval_days)) {
    return null;
  }

  // user_id filter is defense-in-depth like every sibling delete — RLS is the
  // authority (audit run-1 consistency note).
  const { error: deleteError } = await supabase.from('expenses').delete().eq('id', latest.id).eq('user_id', userId);
  if (deleteError) throw deleteError;

  let query = supabase
    .from('recurring_rules')
    .update({ next_due_date: slot })
    .eq('id', rule.id)
    .gt('next_due_date', slot);
  if (userId) query = query.eq('user_id', userId);
  const { data: updated, error: fetchError } = await query.select(selection).single();
  if (fetchError) throw fetchError;
  return { rule: updated as RecurringRule, undoneSlot: slot };
}
