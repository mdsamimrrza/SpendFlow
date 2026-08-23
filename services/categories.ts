import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { Category } from '@/types';
import { supabase } from '@/utils/supabase';

export async function listCategories(userId: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function seedDefaultCategories(userId: string) {
  const existing = await listCategories(userId);
  if (existing.length > 0) return existing;

  const rows = DEFAULT_CATEGORIES.map((category) => ({
    user_id: userId,
    ...category,
    is_custom: false,
  }));
  const { data, error } = await supabase.from('categories').insert(rows).select('*');
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function createCategory(userId: string, input: Pick<Category, 'name' | 'icon' | 'color'>) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, ...input, is_custom: true })
    .select('*')
    .single();
  if (error) throw error;
  return data as Category;
}

export async function deleteCategory(categoryId: string) {
  const { error } = await supabase.from('categories').delete().eq('id', categoryId).eq('is_custom', true);
  if (error) throw error;
}

export async function updateCategoryBudget(categoryId: string, budgetMonthly: number | null) {
  const { data, error } = await supabase.from('categories').update({ budget_monthly: budgetMonthly }).eq('id', categoryId).select('*').single();
  if (error) throw error;
  return data as Category;
}
