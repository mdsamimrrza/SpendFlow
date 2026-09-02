import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountType, BankAccount, BankAccountInput, Expense } from '@/types';
import { supabase } from '@/utils/supabase';

const ACCOUNTS_CACHE_PREFIX = '@spendflow_cached_accounts_';

export async function getCachedBankAccounts(userId?: string): Promise<BankAccount[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(`${ACCOUNTS_CACHE_PREFIX}${userId}`);
    if (!raw) return [];
    const list = JSON.parse(raw) as BankAccount[];
    return list.filter((item, idx, self) => idx === self.findIndex((t) => t.id === item.id));
  } catch {
    return [];
  }
}

export async function setCachedBankAccounts(userId: string, accounts: BankAccount[]): Promise<void> {
  try {
    const unique = accounts.filter((item, idx, self) => idx === self.findIndex((t) => t.id === item.id));
    await AsyncStorage.setItem(`${ACCOUNTS_CACHE_PREFIX}${userId}`, JSON.stringify(unique));
  } catch {
    // Ignore storage errors
  }
}

export async function listBankAccounts(userId: string): Promise<BankAccount[]> {
  const cached = await getCachedBankAccounts(userId);
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Could not query bank_accounts from Supabase, returning cache:', error.message);
      return cached;
    }

    // Supabase is the authoritative source. The cache is only used to paint
    // the UI fast on failure and to preserve locally chosen account types for
    // legacy check-constraint rows — it never contributes non-server accounts.
    const remoteAccounts = (data ?? []) as BankAccount[];
    const combined = remoteAccounts.map((rem) => {
      const matchingLocal = cached.find((c) => c.id === rem.id);
      if (matchingLocal && matchingLocal.account_type !== rem.account_type) {
        return { ...rem, account_type: matchingLocal.account_type };
      }
      return rem;
    });

    await setCachedBankAccounts(userId, combined);
    return combined;
  } catch (err) {
    console.warn('Failed to list bank accounts, returning cached:', err);
    return cached;
  }
}

/** Adds a successfully created Supabase account to the performance cache. */
async function addCreatedAccountToCache(userId: string, account: BankAccount, isDefault: boolean): Promise<void> {
  const cached = await getCachedBankAccounts(userId);
  const updatedCache = isDefault
    ? [account, ...cached.map((a) => ({ ...a, is_default: false }))]
    : [...cached, account];
  await setCachedBankAccounts(userId, updatedCache);
}

export async function createBankAccount(userId: string, input: BankAccountInput): Promise<BankAccount> {
  const desiredType = input.account_type || 'bank';
  const newAccount: Partial<BankAccount> = {
    user_id: userId,
    name: input.name.trim(),
    account_type: desiredType,
    currency: input.currency || 'NPR',
    initial_balance: Number(input.initial_balance || 0),
    current_balance: Number(input.initial_balance || 0),
    color: input.color || '#3B82F6',
    icon: input.icon || 'landmark',
    account_number_last4: input.account_number_last4?.trim() || null,
    is_default: Boolean(input.is_default),
  };

  // If setting this account as default, unmark other default accounts
  if (newAccount.is_default) {
    await supabase
      .from('bank_accounts')
      .update({ is_default: false })
      .eq('user_id', userId);
  }

  const { data, error } = await supabase
    .from('bank_accounts')
    .insert([newAccount])
    .select('*')
    .single();

  if (error) {
    // Legacy remote check constraint rejected newer account types (e.g. credit_card):
    // store the row with a compatible type while keeping the user's chosen type in the UI.
    if (error.code === '23514' || error.message?.toLowerCase().includes('check constraint')) {
      console.warn('Remote check constraint detected, saving with fallback type in database while keeping local type:', desiredType);
      const fallbackPayload = { ...newAccount, account_type: 'bank' as AccountType };
      const { data: retryData, error: retryErr } = await supabase
        .from('bank_accounts')
        .insert([fallbackPayload])
        .select('*')
        .single();

      if (retryErr || !retryData) {
        throw retryErr ?? new Error('Could not create the account. Please check your connection and try again.');
      }
      const created: BankAccount = { ...(retryData as BankAccount), account_type: desiredType };
      await addCreatedAccountToCache(userId, created, Boolean(newAccount.is_default));
      return created;
    }
    throw error;
  }

  const created = data as BankAccount;
  await addCreatedAccountToCache(userId, created, Boolean(newAccount.is_default));
  return created;
}

export async function updateBankAccount(
  id: string,
  userId: string,
  input: Partial<BankAccountInput>,
): Promise<BankAccount> {
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.account_type !== undefined) payload.account_type = input.account_type;
  if (input.currency !== undefined) payload.currency = input.currency;
  if (input.initial_balance !== undefined) payload.initial_balance = Number(input.initial_balance);
  if (input.color !== undefined) payload.color = input.color;
  if (input.icon !== undefined) payload.icon = input.icon;
  if (input.account_number_last4 !== undefined) payload.account_number_last4 = input.account_number_last4?.trim() || null;
  if (input.is_default !== undefined) payload.is_default = input.is_default;

  // If setting this account as default, unmark other default accounts
  if (input.is_default) {
    await supabase
      .from('bank_accounts')
      .update({ is_default: false })
      .eq('user_id', userId);
  }

  const { data, error } = await supabase
    .from('bank_accounts')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23514' || error.message?.toLowerCase().includes('check constraint')) {
      // Legacy check constraint: retry with a compatible stored type
      const fallbackPayload = { ...payload, account_type: 'bank' };
      const { error: retryError } = await supabase
        .from('bank_accounts')
        .update(fallbackPayload)
        .eq('id', id);
      if (retryError) throw retryError;
    } else {
      throw error;
    }
  }

  // Success only: merge the authoritative result into the performance cache.
  const cached = await getCachedBankAccounts(userId);
  const target = cached.find((a) => a.id === id);
  const updated: BankAccount = {
    ...(target || (data as BankAccount)),
    ...payload,
    id,
    user_id: userId,
  };
  const next = cached.map((a) => (a.id === id ? updated : input.is_default ? { ...a, is_default: false } : a));
  await setCachedBankAccounts(userId, next);
  return updated;
}

const SEEDED_KEY = '@spendflow_accounts_seeded_';

export async function deleteBankAccount(id: string, userId: string): Promise<void> {
  // 1. Unlink any transactions referencing this account so they are not deleted
  const { error: unlinkTxError } = await supabase
    .from('expenses')
    .update({ bank_account_id: null })
    .eq('bank_account_id', id);
  if (unlinkTxError) throw unlinkTxError;

  // 2. Unlink any recurring rules
  const { error: unlinkRuleError } = await supabase
    .from('recurring_rules')
    .update({ bank_account_id: null })
    .eq('bank_account_id', id);
  if (unlinkRuleError) throw unlinkRuleError;

  // 3. Try hard delete first, fallback to soft delete
  const { error: delError } = await supabase
    .from('bank_accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (delError) {
    const { error: softError } = await supabase
      .from('bank_accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    if (softError) throw softError;
  }

  // Success only: mark as seeded so an empty account state does not trigger
  // auto-reseed, then drop the account from the performance cache.
  try {
    await AsyncStorage.setItem(`${SEEDED_KEY}${userId}`, 'true');
  } catch {}

  const cached = await getCachedBankAccounts(userId);
  const next = cached.filter((a) => a.id !== id);
  await setCachedBankAccounts(userId, next);
}

export async function seedDefaultAccounts(userId: string, currency = 'NPR'): Promise<BankAccount[]> {
  try {
    const isSeeded = await AsyncStorage.getItem(`${SEEDED_KEY}${userId}`);
    if (isSeeded === 'true') {
      return [];
    }
  } catch {}

  const existing = await listBankAccounts(userId);
  if (existing.length > 0) {
    try {
      await AsyncStorage.setItem(`${SEEDED_KEY}${userId}`, 'true');
    } catch {}
    return existing;
  }

  const defaults: BankAccountInput[] = [
    {
      name: 'Main Bank Account',
      account_type: 'bank',
      currency,
      initial_balance: 0,
      color: '#10B981',
      icon: 'landmark',
      is_default: true,
    },
    {
      name: 'Cash Wallet',
      account_type: 'cash',
      currency,
      initial_balance: 0,
      color: '#10B981',
      icon: 'banknote',
      is_default: false,
    },
  ];

  const created: BankAccount[] = [];
  for (const acc of defaults) {
    try {
      const item = await createBankAccount(userId, acc);
      created.push(item);
    } catch {
      // Continue
    }
  }

  try {
    await AsyncStorage.setItem(`${SEEDED_KEY}${userId}`, 'true');
  } catch {}

  return created;
}

/**
 * Calculates live balances for all accounts by summing initial balance + Income - Expenses
 */
export function computeAccountBalances(accounts: BankAccount[], expenses: Expense[]): (BankAccount & { live_balance: number })[] {
  return accounts.map((account) => {
    let balance = Number(account.initial_balance || 0);

    expenses.forEach((expense) => {
      if (expense.bank_account_id === account.id && !expense.deleted_at) {
        const amt = Number(expense.amount) || 0;
        if (expense.type === 'income') {
          balance += amt;
        } else {
          balance -= amt;
        }
      }
    });

    return {
      ...account,
      live_balance: balance,
    };
  });
}
