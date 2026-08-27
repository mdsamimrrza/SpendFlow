import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { Category } from '@/types';
import { supabase } from '@/utils/supabase';

const CATEGORY_CACHE_PREFIX = '@spendflow_categories_';

export async function seedDefaultCategories(userId: string): Promise<Category[]> {
  try {
    // 1. Check if user already has categories in DB
    const { data: existing, error: fetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!fetchError && existing && existing.length > 0) {
      await AsyncStorage.setItem(`${CATEGORY_CACHE_PREFIX}${userId}`, JSON.stringify(existing)).catch(() => {});
      return existing as Category[];
    }

    // 2. Insert default categories with valid database IDs
    const rows = DEFAULT_CATEGORIES.map((category) => ({
      user_id: userId,
      name: category.name,
      icon: category.icon,
      color: category.color,
      is_custom: false,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('categories')
      .insert(rows)
      .select('*')
      .order('created_at', { ascending: true });

    if (!insertError && inserted && inserted.length > 0) {
      await AsyncStorage.setItem(`${CATEGORY_CACHE_PREFIX}${userId}`, JSON.stringify(inserted)).catch(() => {});
      return inserted as Category[];
    }
  } catch {
    // Offline fallback
  }

  // Check local cache
  try {
    const cached = await AsyncStorage.getItem(`${CATEGORY_CACHE_PREFIX}${userId}`);
    if (cached) return JSON.parse(cached) as Category[];
  } catch {
    // Ignore cache parse error
  }

  return DEFAULT_CATEGORIES.map((c, idx) => ({
    id: `local-cat-${idx}-${c.name.toLowerCase()}`,
    user_id: userId,
    ...c,
    is_custom: false,
    budget_monthly: null,
    created_at: new Date().toISOString(),
  })) as Category[];
}

export async function listCategories(userId: string): Promise<Category[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      await AsyncStorage.setItem(`${CATEGORY_CACHE_PREFIX}${userId}`, JSON.stringify(data)).catch(() => {});
      return data as Category[];
    }

    // If categories table is empty for this user, seed it immediately
    if (!error && data && data.length === 0) {
      return await seedDefaultCategories(userId);
    }
  } catch {
    // Network offline
  }

  // Try local cache
  try {
    const cached = await AsyncStorage.getItem(`${CATEGORY_CACHE_PREFIX}${userId}`);
    if (cached) return JSON.parse(cached) as Category[];
  } catch {
    // Ignore cache error
  }

  // Fallback to seeding or default template
  return await seedDefaultCategories(userId);
}

export async function updateCategoryBudget(categoryId: string, budgetMonthly: number | null) {
  const { data, error } = await supabase.from('categories').update({ budget_monthly: budgetMonthly }).eq('id', categoryId).select('*').single();
  if (error) throw error;
  return data as Category;
}
