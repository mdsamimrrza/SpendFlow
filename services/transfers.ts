import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transfer, TransferInput } from '@/types';
import { getRate } from '@/services/exchange';
import { supabase } from '@/utils/supabase';

const TRANSFERS_CACHE_PREFIX = '@spendflow_cached_transfers_';

const TRANSFER_SELECT =
  '*, from_account:from_account_id(name, icon, color, currency, country), to_account:to_account_id(name, icon, color, currency, country)';

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getCachedTransfers(userId?: string): Promise<Transfer[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(`${TRANSFERS_CACHE_PREFIX}${userId}`);
    if (!raw) return [];
    return JSON.parse(raw) as Transfer[];
  } catch {
    return [];
  }
}

async function setCachedTransfers(userId: string, transfers: Transfer[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${TRANSFERS_CACHE_PREFIX}${userId}`, JSON.stringify(transfers));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Lists the user's transfers from Supabase. `onCached` fires first with the
 * locally cached list (when present) so callers can paint the UI instantly;
 * the resolved value is always the authoritative server list.
 */
export async function listTransfers(
  userId: string,
  onCached?: (cached: Transfer[]) => void,
): Promise<Transfer[]> {
  const cached = await getCachedTransfers(userId);
  if (onCached && cached.length > 0) onCached(cached);
  try {
    const { data, error } = await supabase
      .from('transfers')
      .select(TRANSFER_SELECT)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not query transfers from Supabase, returning cache:', error.message);
      return cached;
    }

    const transfers = (data ?? []) as Transfer[];
    await setCachedTransfers(userId, transfers);
    return transfers;
  } catch (err) {
    console.warn('Failed to list transfers, returning cached:', err);
    return cached;
  }
}

/**
 * Creates a transfer between two accounts. The exchange rate is resolved from
 * the transfer date through the shared exchange service (DB cache →
 * exchangerate.host → pegs/fallbacks) and locked on the row together with the
 * converted amount, so balances stay historically accurate.
 */
export async function createTransfer(userId: string, input: TransferInput): Promise<Transfer> {
  const amount = Number(input.amount);
  const fee = Number(input.fee || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid amount to transfer.');
  }
  if (!input.from_account_id || !input.to_account_id) {
    throw new Error('Select both the source and destination accounts.');
  }
  if (input.from_account_id === input.to_account_id) {
    throw new Error('Source and destination accounts must be different.');
  }

  const { data: accounts, error: accountsError } = await supabase
    .from('bank_accounts')
    .select('id, currency')
    .eq('user_id', userId)
    .in('id', [input.from_account_id, input.to_account_id]);
  if (accountsError) throw accountsError;

  const rows = accounts ?? [];
  const fromAccount = rows.find((a) => a.id === input.from_account_id);
  const toAccount = rows.find((a) => a.id === input.to_account_id);
  if (!fromAccount || !toAccount) {
    throw new Error('One of the selected accounts no longer exists.');
  }

  const fromCurrency = (fromAccount.currency || 'NPR').toUpperCase();
  const toCurrency = (toAccount.currency || 'NPR').toUpperCase();

  let exchangeRate = 1;
  if (fromCurrency !== toCurrency) {
    const [fromUsdPerUnit, toUsdPerUnit] = await Promise.all([
      getRate(fromCurrency, input.date),
      getRate(toCurrency, input.date),
    ]);
    exchangeRate = round8(fromUsdPerUnit / toUsdPerUnit);
  }
  const convertedAmount = round2(amount * exchangeRate);
  if (!Number.isFinite(convertedAmount) || convertedAmount <= 0) {
    throw new Error('Could not convert the amount at the current exchange rate. Please try again.');
  }

  const { data, error } = await supabase
    .from('transfers')
    .insert({
      user_id: userId,
      from_account_id: input.from_account_id,
      to_account_id: input.to_account_id,
      amount: round2(amount),
      from_currency: fromCurrency,
      to_currency: toCurrency,
      exchange_rate: exchangeRate,
      converted_amount: convertedAmount,
      fee: round2(Math.max(fee, 0)),
      date: input.date,
      time: input.time || null,
      notes: input.notes?.trim() || null,
    })
    .select(TRANSFER_SELECT)
    .single();

  if (error) throw error;

  const created = data as Transfer;
  const cached = await getCachedTransfers(userId);
  await setCachedTransfers(userId, [created, ...cached]);
  return created;
}

export async function deleteTransfer(id: string, userId: string): Promise<void> {
  // Soft delete first so the audit trail and balance history stay recoverable.
  // If the row cannot be soft-deleted (e.g. a legacy `transfers` table without
  // the deleted_at column), fall back to a hard delete — either way the user's
  // balances are restored because the row stops contributing.
  const { error } = await supabase
    .from('transfers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    const { error: hardError } = await supabase
      .from('transfers')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (hardError) throw hardError;
  }

  const cached = await getCachedTransfers(userId);
  await setCachedTransfers(userId, cached.filter((t) => t.id !== id));
}
