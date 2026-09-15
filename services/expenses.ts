import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXPENSE_CACHE_PREFIX, LEGACY_EXPENSE_CACHE_KEY, PAGE_SIZE } from '@/constants/app';
import { createCategory, listCategories } from '@/services/categories';
import { listBankAccounts } from '@/services/bankAccounts';
import { getRate } from '@/services/exchange';
import { MAX_AMOUNT, validateAmount } from '@/services/validation';
import { BankAccount, Expense, ExpenseFilters, ExpenseInput, ExpensePage, SortKey } from '@/types';
import { supabase } from '@/utils/supabase';

// Explicit column list (not select('*')) so list payloads never include
// schema-only fields — the search_vector tsvector on environments where the
// phase-2 migration is applied, and the legacy is_synced/client_sync_id
// offline-era columns. Type-consistent with Expense on every schema state.
const selection = [
  'id', 'user_id', 'category_id', 'amount', 'currency', 'description', 'date', 'time',
  'payment_method', 'notes', 'receipt_image_url', 'is_recurring', 'recurring_rule_id',
  'recurring_due_date',
  'bank_account_id', 'exchange_rate_to_usd', 'base_currency', 'type', 'deleted_at',
  'created_at', 'updated_at',
  'categories(name, icon, color)',
  'bank_accounts(name, icon, color, account_type)',
].join(', ');

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
  if (filters?.search) {
    // The search text must never reach PostgREST raw: a value like
    // `%",category_id.in.(x)` could forge extra filter conditions. Stripping
    // the characters that carry logic-tree meaning and double-quoting the
    // value keeps it a single literal ilike pattern.
    const pattern = `%${filters.search.replace(/[\\"]/g, '')}%`;
    q = q.or(`description.ilike."${pattern}",notes.ilike."${pattern}"`);
  }
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
  // One logical load = one query. Errors propagate to the caller (useExpenses
  // paints the cache and surfaces the error) — no identical re-query.
  const { data, error } = await applyExpenseFilters(
    supabase.from('expenses').select(selection).eq('user_id', userId).is('deleted_at', null),
    page,
    filters,
    sort,
  );
  if (error) throw error;

  const serverItems = (((data ?? []) as unknown) as Expense[]).map((e) => ({
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
    let query = supabase.from('expenses').select(selection).eq('id', id).is('deleted_at', null);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query.single();
    if (!error && data) return data as unknown as Expense;
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

// ── Server-side input validation ────────────────────────────────────────────
// Monetary values are security-sensitive: NaN/Infinity/negative amounts and
// malformed dates must be rejected before they reach PostgREST, independent
// of what the UI allows.
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_NOTES_LENGTH = 2000;
const MAX_CSV_IMPORT_ROWS = 1000;

function validateDate(date: unknown): string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new Error('Enter a valid transaction date.');
  }
  return date;
}

function cleanText(value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * CSV cells the exporter wrapped with a leading apostrophe (spreadsheet
 * formula-injection guard for values starting with = + - @) must be unwrapped
 * on import so descriptions round-trip byte-identical.
 */
function stripExportQuote(value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return cleanText(value.startsWith("'") ? value.slice(1) : value, maxLength);
}

export async function createExpense(userId: string, input: ExpenseInput) {
  const transactionType = input.type || 'expense';
  const sanitizedBankAccountId = isValidUUID(input.bank_account_id) ? input.bank_account_id : null;
  const amount = validateAmount(input.amount);
  const date = validateDate(input.date);
  const sanitizedInput = {
    ...input,
    bank_account_id: sanitizedBankAccountId,
    description: cleanText(input.description, MAX_DESCRIPTION_LENGTH),
    notes: cleanText(input.notes, MAX_NOTES_LENGTH),
  };

  const snapshot = await getRate(input.currency || 'USD', date).catch(() => undefined);

  const values = {
    ...sanitizedInput,
    type: transactionType,
    user_id: userId,
    amount,
    date,
    ...(snapshot ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' } : {}),
  };
  const result = await supabase.from('expenses').insert(values).select(selection).single();

  if (result.error) throw result.error;
  return result.data as unknown as Expense;
}

export async function updateExpense(id: string, input: ExpenseInput, userId?: string | null) {
  const transactionType = input.type || 'expense';
  const sanitizedBankAccountId = isValidUUID(input.bank_account_id) ? input.bank_account_id : null;
  const amount = validateAmount(input.amount);
  const date = validateDate(input.date);
  const sanitizedInput = {
    ...input,
    bank_account_id: sanitizedBankAccountId,
    description: cleanText(input.description, MAX_DESCRIPTION_LENGTH),
    notes: cleanText(input.notes, MAX_NOTES_LENGTH),
  };

  const existing = await supabase.from('expenses').select('date, currency').eq('id', id).maybeSingle();
  const dateChanged = Boolean(
    existing.data &&
      (existing.data.date !== date || existing.data.currency !== input.currency),
  );
  const snapshot = dateChanged
    ? await getRate(input.currency || 'USD', date).catch(() => undefined)
    : undefined;
  const snapshotFields = snapshot
    ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' }
    : {};

  // Ownership is enforced by RLS; the explicit user_id scope is defense in
  // depth so a compromised client context can never touch another user's row.
  let updateQuery = supabase
    .from('expenses')
    .update({ ...sanitizedInput, ...snapshotFields, type: transactionType, amount, date, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (userId) updateQuery = updateQuery.eq('user_id', userId);

  const res1 = await updateQuery.select(selection).single();

  if (res1.error) throw res1.error;
  return res1.data as unknown as Expense;
}

export async function softDeleteExpense(id: string, userId?: string | null) {
  let deleteQuery = supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (userId) deleteQuery = deleteQuery.eq('user_id', userId);
  const { error } = await deleteQuery;
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
  // Strip the UTF-8 BOM our own exporter prepends (for Windows Excel) — it
  // would otherwise glue itself onto the first header name ('Type').
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV file has no expense rows.');
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name);
  const dateIndex = indexOf('date');
  const amountIndex = indexOf('amount');
  if (dateIndex < 0 || amountIndex < 0) throw new Error('CSV must include Date and Amount columns.');

  // Round-trip resolution maps: categories by name (create-on-demand with the
  // exported icon/color so nothing silently degrades to "Other"), bank accounts
  // by name (link when the name matches an existing account).
  const categories = await listCategories(userId);
  const categoryByName = new Map(categories.map((category) => [category.name.toLowerCase(), category]));
  const createCategoryIfMissing = async (name: string, icon: string, color: string, type: 'expense' | 'income') => {
    const key = name.toLowerCase();
    const existing = categoryByName.get(key);
    if (existing) return existing;
    try {
      const created = await createCategory(userId, { name, icon: icon || '📌', color: color || '#10B981', type });
      categoryByName.set(key, created);
      return created;
    } catch {
      return null; // network/DB refused — row falls back below
    }
  };

  const accounts = await listBankAccounts(userId).catch(() => [] as BankAccount[]);
  const accountByName = new Map(accounts.map((account) => [account.name.toLowerCase(), account.id]));

  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const date = cells[dateIndex];
    const amount = Number(cells[amountIndex]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new Error(`Invalid date or amount on CSV row ${rowIndex + 2}.`);

    // Type: income rows must stay income — default keeps legacy files expense.
    const typeCell = indexOf('type') >= 0 ? cells[indexOf('type')].toLowerCase() : '';
    const type: 'expense' | 'income' = typeCell === 'income' ? 'income' : 'expense';

    // Category: resolve by name; icon/color only matter when creating it.
    // stripExportQuote mirrors the exporter's formula-injection guard so
    // sanitized cells round-trip byte-identical.
    const categoryName = stripExportQuote(indexOf('category') >= 0 && cells[indexOf('category')] ? cells[indexOf('category')] : 'Other', 100) ?? 'Other';
    const categoryIcon = stripExportQuote(indexOf('category icon') >= 0 ? cells[indexOf('category icon')] : '', 32) ?? '';
    const categoryColor = stripExportQuote(indexOf('category color') >= 0 ? cells[indexOf('category color')] : '', 32) ?? '';
    const category = categoryByName.get(categoryName.toLowerCase()) ?? null;

    // Account: re-link by name when it matches; otherwise unassigned.
    const accountName = stripExportQuote(indexOf('account') >= 0 ? cells[indexOf('account')] : '', 100) ?? '';
    const bank_account_id = accountName ? accountByName.get(accountName.toLowerCase()) ?? null : null;

    // Time: free-typed "HH:MM[:SS]" — shape-validated, quote-stripped.
    const rawTime = stripExportQuote(indexOf('time') >= 0 ? cells[indexOf('time')] : '', 8) ?? '';
    const time = /^\d{1,2}:\d{2}(:\d{2})?$/.test(rawTime) ? rawTime : null;

    return {
      user_id: userId,
      date,
      amount,
      type,
      time,
      currency: (indexOf('currency') >= 0 ? cells[indexOf('currency')] || 'NPR' : 'NPR').trim().toUpperCase().slice(0, 3) || 'NPR',
      category_id: category?.id ?? null,
      category_meta: { name: categoryName, icon: categoryIcon, color: categoryColor, type },
      bank_account_id,
      payment_method: (indexOf('payment method') >= 0 ? cells[indexOf('payment method')] : 'Cash') || 'Cash',
      description: stripExportQuote(indexOf('description') >= 0 ? cells[indexOf('description')] : null, MAX_DESCRIPTION_LENGTH),
      notes: stripExportQuote(indexOf('notes') >= 0 ? cells[indexOf('notes')] : null, MAX_NOTES_LENGTH),
    };
  });
  if (!rows.length) throw new Error('CSV has no importable rows.');
  if (rows.length > MAX_CSV_IMPORT_ROWS) throw new Error(`CSV import is limited to ${MAX_CSV_IMPORT_ROWS} rows per file.`);

  // Create any categories the file references but the account doesn't have,
  // then fill every row's category_id.
  const missingCategories = new Map<string, { icon: string; color: string; type: 'expense' | 'income' }>();
  for (const row of rows) {
    if (!row.category_id && row.category_meta.name) {
      if (!missingCategories.has(row.category_meta.name.toLowerCase())) {
        missingCategories.set(row.category_meta.name.toLowerCase(), {
          icon: row.category_meta.icon,
          color: row.category_meta.color,
          type: row.category_meta.type,
        });
      }
    }
  }
  for (const [name, meta] of missingCategories) {
    const created = await createCategoryIfMissing(name, meta.icon, meta.color, meta.type);
    if (created) {
      for (const row of rows) {
        if (row.category_meta.name.toLowerCase() === name) row.category_id = created.id;
      }
    }
  }

  // category_id is NOT NULL with FK RESTRICT — any row still unresolved after
  // the create-on-demand pass (network refused, invalid name) is dropped
  // rather than failing the whole batch, matching the legacy filter.
  const importable = rows.filter((row) => row.category_id);
  if (!importable.length) {
    throw new Error('CSV has no importable rows — no category could be resolved for any transaction.');
  }

  // Exchange snapshot per row — same field createExpense writes, so imported
  // history converts at its own dates exactly like natively-created rows.
  const rateCache = new Map<string, number | null>();
  const snapshotFor = async (currency: string, date: string): Promise<number | null> => {
    const key = `${currency}:${date}`;
    if (rateCache.has(key)) return rateCache.get(key) ?? null;
    const rate = await getRate(currency, date).catch(() => null);
    const safe = rate && rate > 0 ? rate : null;
    rateCache.set(key, safe);
    return safe;
  };

  const insertRows = await Promise.all(
    importable.map(async (row) => {
      const snapshot = await snapshotFor(row.currency, row.date);
      return {
        user_id: row.user_id,
        date: row.date,
        time: row.time,
        amount: row.amount,
        type: row.type,
        currency: row.currency,
        category_id: row.category_id,
        bank_account_id: row.bank_account_id,
        payment_method: row.payment_method,
        description: row.description,
        notes: row.notes,
        ...(snapshot ? { exchange_rate_to_usd: snapshot, base_currency: 'USD' } : {}),
      };
    }),
  );

  const { error } = await supabase.from('expenses').insert(insertRows);
  if (error) throw error;
  return insertRows.length;
}
