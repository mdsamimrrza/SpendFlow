import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXPENSE_CACHE_KEY, PAGE_SIZE } from '@/constants/app';
import { seedDefaultCategories } from '@/services/categories';
import { Expense, ExpenseFilters, ExpenseInput, ExpensePage, SortKey } from '@/types';
import { supabase } from '@/utils/supabase';

const selection = '*, categories(name, icon, color)';

export async function listExpenses(userId: string, page = 0, filters?: ExpenseFilters, sort: SortKey = 'date_desc'): Promise<ExpensePage> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase.from('expenses').select(selection).eq('user_id', userId).is('deleted_at', null).range(from, to);
  if (filters?.fromDate) query = query.gte('date', filters.fromDate);
  if (filters?.toDate) query = query.lte('date', filters.toDate);
  if (filters?.categoryIds?.length) query = query.in('category_id', filters.categoryIds);
  if (filters?.minAmount !== undefined) query = query.gte('amount', filters.minAmount);
  if (filters?.maxAmount !== undefined) query = query.lte('amount', filters.maxAmount);
  if (filters?.paymentMethod && filters.paymentMethod !== 'All') query = query.eq('payment_method', filters.paymentMethod);
  if (filters?.search) query = query.or(`description.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
  if (sort === 'amount_asc' || sort === 'amount_desc') query = query.order('amount', { ascending: sort === 'amount_asc' });
  else query = query.order('date', { ascending: sort === 'date_asc' }).order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  const items = (data ?? []) as Expense[];
  if (page === 0) await AsyncStorage.setItem(EXPENSE_CACHE_KEY, JSON.stringify(items));
  return { items, hasMore: items.length === PAGE_SIZE };
}

export async function getCachedExpenses() {
  const raw = await AsyncStorage.getItem(EXPENSE_CACHE_KEY);
  return raw ? (JSON.parse(raw) as Expense[]) : [];
}

export async function getExpense(id: string) {
  const { data, error } = await supabase.from('expenses').select(selection).eq('id', id).is('deleted_at', null).single();
  if (error) throw error;
  return data as Expense;
}

export async function createExpense(userId: string, input: ExpenseInput) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...input, user_id: userId, is_synced: true })
    .select(selection)
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const { data, error } = await supabase
    .from('expenses')
    .update({ ...input, updated_at: new Date().toISOString(), is_synced: true })
    .eq('id', id)
    .select(selection)
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function softDeleteExpense(id: string) {
  const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function restoreExpense(id: string) {
  const { error } = await supabase.from('expenses').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}

export async function seedDemoExpenses(userId: string) {
  const { data: existing, error: existingError } = await supabase
    .from('expenses')
    .select('id')
    .eq('user_id', userId)
    .like('description', 'Demo: %')
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return 0;

  const categories = await seedDefaultCategories(userId);
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]));
  const dateForDaysAgo = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const entries = [
    { category: 'Food', amount: 450, description: 'Demo: Lunch with colleagues', daysAgo: 0, time: '13:15:00', payment_method: 'Cash' },
    { category: 'Transport', amount: 220, description: 'Demo: Ride to office', daysAgo: 1, time: '08:40:00', payment_method: 'UPI' },
    { category: 'Shopping', amount: 1850, description: 'Demo: Weekly groceries', daysAgo: 2, time: '06:30:00', payment_method: 'Card' },
    { category: 'Entertainment', amount: 900, description: 'Demo: Movie night', daysAgo: 4, time: '07:45:00', payment_method: 'Card' },
    { category: 'Utilities', amount: 2400, description: 'Demo: Internet bill', daysAgo: 7, time: '10:00:00', payment_method: 'UPI' },
    { category: 'Food', amount: 680, description: 'Demo: Dinner out', daysAgo: 10, time: '08:20:00', payment_method: 'Card' },
    { category: 'Medical', amount: 1200, description: 'Demo: Pharmacy', daysAgo: 14, time: '11:10:00', payment_method: 'Cash' },
    { category: 'Travel', amount: 5200, description: 'Demo: Weekend trip', daysAgo: 22, time: '05:30:00', payment_method: 'Card' },
    { category: 'Education', amount: 1500, description: 'Demo: Online course', daysAgo: 35, time: '09:00:00', payment_method: 'UPI' },
  ];

  const rows = entries.flatMap((entry) => {
    const categoryId = categoryByName.get(entry.category);
    return categoryId
      ? [{
          amount: entry.amount,
          description: entry.description,
          time: entry.time,
          payment_method: entry.payment_method,
          category_id: categoryId,
          user_id: userId,
          currency: 'NPR',
          date: dateForDaysAgo(entry.daysAgo),
          notes: 'Seeded demo entry',
          is_synced: true,
        }]
      : [];
  });
  if (!rows.length) throw new Error('No categories available for demo data.');

  const { error } = await supabase.from('expenses').insert(rows);
  if (error) throw error;
  return rows.length;
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
      is_synced: true,
    };
  }).filter((row) => row.category_id);
  if (!rows.length) throw new Error('CSV has no importable rows.');
  const { error } = await supabase.from('expenses').insert(rows);
  if (error) throw error;
  return rows.length;
}
