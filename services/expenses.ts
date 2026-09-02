import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXPENSE_CACHE_PREFIX, LEGACY_EXPENSE_CACHE_KEY, PAGE_SIZE } from '@/constants/app';
import { seedDefaultCategories } from '@/services/categories';
import { getRate } from '@/services/exchange';
import { Expense, ExpenseFilters, ExpenseInput, ExpensePage, SortKey } from '@/types';
import { supabase } from '@/utils/supabase';

// Selection always joins categories + bank_accounts so detail views can show
// the account name. The bank_accounts embed is a many-to-one FK join (returns a
// single object or null), so it never duplicates expense rows.
const selection = '*, categories(name, icon, color), bank_accounts(name, icon, color, account_type)';

function applyExpenseFilters(query: any, page = 0, filters?: ExpenseFilters, sort: SortKey = 'date_desc') {
  let q = query;
  if (!filters?.fetchAll) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    q = q.range(from, to);
  }
  if (filters?.fromDate) q = q.gte('date', filters.fromDate);
  if (filters?.toDate) q = q.lte('date', filters.toDate);
  if (filters?.categoryIds?.length) q = q.in('category_id', filters.categoryIds);
  if (filters?.bankAccountId && filters.bankAccountId !== 'All') q = q.eq('bank_account_id', filters.bankAccountId);
  if (filters?.minAmount !== undefined) q = q.gte('amount', filters.minAmount);
  if (filters?.maxAmount !== undefined) q = q.lte('amount', filters.maxAmount);
  if (filters?.paymentMethod && filters.paymentMethod !== 'All') q = q.eq('payment_method', filters.paymentMethod);
  if (filters?.type && filters.type !== 'All') q = q.eq('type', filters.type);
  if (filters?.search) q = q.or(`description.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
  if (sort === 'amount_asc' || sort === 'amount_desc') q = q.order('amount', { ascending: sort === 'amount_asc' });
  else q = q.order('date', { ascending: sort === 'date_asc' }).order('created_at', { ascending: false });
  return q;
}

function matchesLocalFilters(expense: Expense, filters?: ExpenseFilters): boolean {
  if (expense.deleted_at) return false;
  if (filters?.fromDate && expense.date < filters.fromDate) return false;
  if (filters?.toDate && expense.date > filters.toDate) return false;
  if (filters?.categoryIds?.length && !filters.categoryIds.includes(expense.category_id)) return false;
  if (filters?.bankAccountId && filters.bankAccountId !== 'All' && expense.bank_account_id !== filters.bankAccountId) return false;
  if (filters?.minAmount !== undefined && Number(expense.amount) < filters.minAmount) return false;
  if (filters?.maxAmount !== undefined && Number(expense.amount) > filters.maxAmount) return false;
  if (filters?.paymentMethod && filters.paymentMethod !== 'All' && expense.payment_method !== filters.paymentMethod) return false;
  if (filters?.type && filters.type !== 'All' && (expense.type || 'expense') !== filters.type) return false;
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    const text = `${expense.description || ''} ${expense.notes || ''}`.toLowerCase();
    if (!text.includes(search)) return false;
  }
  return true;
}

function sortExpenses(items: Expense[], sort: SortKey): Expense[] {
  return [...items].sort((a, b) => {
    if (sort === 'amount_asc') return Number(a.amount) - Number(b.amount);
    if (sort === 'amount_desc') return Number(b.amount) - Number(a.amount);
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return sort === 'date_asc' ? dateCompare : -dateCompare;
    return sort === 'date_asc'
      ? a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at);
  });
}

/**
 * Applies the same filter + sort rules as the server query against locally
 * cached rows. Used to paint cached data instantly (before the network
 * response arrives) without showing entries the active filters exclude.
 */
export function filterAndSortCachedExpenses(items: Expense[], filters?: ExpenseFilters, sort: SortKey = 'date_desc'): Expense[] {
  return sortExpenses(items.filter((expense) => matchesLocalFilters(expense, filters)), sort);
}

export async function listExpenses(userId: string, page = 0, filters?: ExpenseFilters, sort: SortKey = 'date_desc'): Promise<ExpensePage> {
  let { data, error } = await Promise.resolve(
    applyExpenseFilters(
      supabase.from('expenses').select(selection).eq('user_id', userId).is('deleted_at', null),
      page,
      filters,
      sort,
    ),
  );
  if (error) {
    const fallbackQuery = applyExpenseFilters(
      supabase.from('expenses').select(selection).eq('user_id', userId).is('deleted_at', null),
      page,
      filters,
      sort,
    );
    const fallbackRes = await fallbackQuery;
    if (fallbackRes.error) throw fallbackRes.error;
    data = fallbackRes.data;
  }

  const serverItems = ((data ?? []) as Expense[]).map((e) => ({
    ...e,
    type: e.type || 'expense',
  }));

  // The server result is the authoritative list; page 0 is re-sorted client-side
  // so it matches the cache-paint ordering used before the network resolves.
  const items = page === 0 ? sortExpenses(serverItems, sort) : serverItems;

  if (page === 0) await AsyncStorage.setItem(`${EXPENSE_CACHE_PREFIX}${userId}`, JSON.stringify(items));
  return { items, hasMore: filters?.fetchAll ? false : serverItems.length === PAGE_SIZE };
}

function parseCachedExpenses(raw: string | null): Expense[] {
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as Expense[]).map((e) => ({
      ...e,
      type: e.type || 'expense',
    }));
  } catch {
    return [];
  }
}

/**
 * Reads the per-user expense cache. Falls back exactly once to the pre-P2
 * global key, migrating only rows whose embedded server-side user_id matches
 * the requesting user — rows belonging to anyone else are never returned or
 * copied. Marks the migration complete per user (idempotent across launches)
 * even when nothing migrates. The legacy key itself is left on disk during the
 * one-release compatibility window and removed in a later cleanup priority.
 */
export async function getCachedExpenses(userId?: string | null): Promise<Expense[]> {
  if (!userId) return [];
  const raw = await AsyncStorage.getItem(`${EXPENSE_CACHE_PREFIX}${userId}`).catch(() => null);
  if (raw !== null) return parseCachedExpenses(raw);

  // Legacy migration fallback (ownership-validated)
  const legacyRaw = await AsyncStorage.getItem(LEGACY_EXPENSE_CACHE_KEY).catch(() => null);
  const owned = parseCachedExpenses(legacyRaw).filter((e) => e.user_id === userId && !e.deleted_at);
  await AsyncStorage.setItem(`${EXPENSE_CACHE_PREFIX}${userId}`, JSON.stringify(owned)).catch(() => {});
  return owned;
}

export async function getExpense(id: string, userId?: string | null) {
  if (!isValidUUID(id)) {
    throw new Error('This offline expense was removed because SpendFlow now requires an internet connection.');
  }
  let requestError: unknown = null;
  try {
    const { data, error } = await supabase.from('expenses').select(selection).eq('id', id).is('deleted_at', null).single();
    if (!error && data) return data as Expense;
    requestError = error;
  } catch (error) {
    requestError = error;
  }

  // Scoped to the requesting user — without a userId no cache fallback runs.
  const cachedExpense = (await getCachedExpenses(userId)).find((expense) => expense.id === id && !expense.deleted_at);
  if (cachedExpense) return cachedExpense;
  if (requestError) throw requestError;
  throw new Error('This offline expense is no longer available on this device.');
}

function isValidUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function createExpense(userId: string, input: ExpenseInput) {
  const transactionType = input.type || 'expense';
  const sanitizedBankAccountId = isValidUUID(input.bank_account_id) ? input.bank_account_id : null;
  const sanitizedInput = {
    ...input,
    bank_account_id: sanitizedBankAccountId,
  };

  const snapshot = await getRate(input.currency || 'USD', input.date).catch(() => undefined);

  const values = {
    ...sanitizedInput,
    type: transactionType,
    user_id: userId,
    ...(snapshot ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' } : {}),
  };
  const result = await supabase.from('expenses').insert(values).select(selection).single();

  if (!result.error && result.data) return result.data as Expense;

  // Keep compatibility with databases that have not yet received the transaction-type
  // migration. Never retry arbitrary errors: a write may already have succeeded.
  if (result.error?.code !== '42703') throw result.error;
  const { type: _omitType, ...baseInput } = sanitizedInput;
  const legacyResult = await supabase
    .from('expenses')
    .insert({ ...baseInput, user_id: userId })
    .select(selection)
    .single();
  if (legacyResult.error) throw legacyResult.error;
  return { ...legacyResult.data, type: transactionType } as Expense;
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const transactionType = input.type || 'expense';
  const sanitizedBankAccountId = isValidUUID(input.bank_account_id) ? input.bank_account_id : null;
  const sanitizedInput = {
    ...input,
    bank_account_id: sanitizedBankAccountId,
  };

  const existing = await supabase.from('expenses').select('date, currency').eq('id', id).maybeSingle();
  const dateChanged = Boolean(
    existing.data &&
      (existing.data.date !== input.date || existing.data.currency !== input.currency),
  );
  const snapshot = dateChanged
    ? await getRate(input.currency || 'USD', input.date).catch(() => undefined)
    : undefined;
  const snapshotFields = snapshot
    ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' }
    : {};

  let updatedData: any = null;
  const res1 = await supabase
    .from('expenses')
    .update({ ...sanitizedInput, ...snapshotFields, type: transactionType, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(selection)
    .single();

  if (!res1.error && res1.data) {
    updatedData = res1.data;
  } else {
    const { type: _omitType, ...baseInput } = sanitizedInput;
    const res2 = await supabase
      .from('expenses')
      .update({ ...baseInput, ...snapshotFields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(selection)
      .single();

    if (res2.error) throw res2.error;
    updatedData = { ...res2.data, type: transactionType };
  }

  return updatedData as Expense;
}

export async function softDeleteExpense(id: string, userId?: string | null) {
  const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;

  if (!userId) return; // cache pruning requires a user scope

  // Remove immediately from the user's local cache so the UI re-renders
  // instantly without waiting for the next network fetch.
  try {
    const cached = await getCachedExpenses(userId);
    const updated = cached.filter((e) => e.id !== id);
    await AsyncStorage.setItem(`${EXPENSE_CACHE_PREFIX}${userId}`, JSON.stringify(updated));
  } catch {
    // Best-effort cache cleanup — the next fetch will correct it anyway
  }
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export async function importExpensesFromCsv(userId: string, csv: string) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV file has no expense rows.');
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name);
  const dateIndex = indexOf('date');
  const amountIndex = indexOf('amount');
  if (dateIndex < 0 || amountIndex < 0) throw new Error('CSV must include Date and Amount columns.');

  const categories = await seedDefaultCategories(userId);
  const categoryByName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
  const otherCategory = categoryByName.get('other');
  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const date = cells[dateIndex];
    const amount = Number(cells[amountIndex]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0) throw new Error(`Invalid date or amount on CSV row ${rowIndex + 2}.`);
    const categoryName = dateIndex >= 0 && indexOf('category') >= 0 ? cells[indexOf('category')].toLowerCase() : 'other';
    return {
      user_id: userId,
      date,
      amount,
      currency: indexOf('currency') >= 0 ? cells[indexOf('currency')] || 'NPR' : 'NPR',
      category_id: categoryByName.get(categoryName) ?? otherCategory,
      payment_method: (indexOf('payment method') >= 0 ? cells[indexOf('payment method')] : 'Cash') || 'Cash',
      description: indexOf('description') >= 0 ? cells[indexOf('description')] || null : null,
      notes: indexOf('notes') >= 0 ? cells[indexOf('notes')] || null : null,
    };
  }).filter((row) => row.category_id);
  if (!rows.length) throw new Error('CSV has no importable rows.');
  const { error } = await supabase.from('expenses').insert(rows);
  if (error) throw error;
  return rows.length;
}
