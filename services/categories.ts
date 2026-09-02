import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '@/constants/categories';
import { Category, TransactionType } from '@/types';
import { supabase } from '@/utils/supabase';
import { recordCategoryBudgetChange } from './settingsHistory';

const CATEGORY_CACHE_PREFIX = '@spendflow_categories_';
const INCOME_CATEGORY_NAMES = new Set(DEFAULT_INCOME_CATEGORIES.map((c) => c.name.toLowerCase()));

export function resolveCategoryType(name: string, explicitType?: TransactionType): TransactionType {
  if (explicitType === 'income' || explicitType === 'expense') return explicitType;
  return INCOME_CATEGORY_NAMES.has(name.toLowerCase()) ? 'income' : 'expense';
}

export async function seedDefaultCategories(userId: string): Promise<Category[]> {
  try {
    // 1. Check if user already has categories in DB
    const { data: existing, error: fetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!fetchError && existing && existing.length > 0) {
      const enriched = existing.map((c: any) => ({
        ...c,
        type: resolveCategoryType(c.name, c.type),
      })) as Category[];
      await AsyncStorage.setItem(`${CATEGORY_CACHE_PREFIX}${userId}`, JSON.stringify(enriched)).catch(() => {});
      return enriched;
    }

    // 2. Insert default categories with valid database IDs. Single attempt:
    //    on failure the flow falls through to the cache/template fallback below.
    const rowsWithType = DEFAULT_CATEGORIES.map((category) => ({
      user_id: userId,
      name: category.name,
      icon: category.icon,
      color: category.color,
      is_custom: false,
      type: (category as any).type || 'expense',
    }));

    const res1 = await supabase.from('categories').insert(rowsWithType).select('*').order('created_at', { ascending: true });
    const inserted = res1.error ? null : res1.data;

    if (inserted && inserted.length > 0) {
      const enriched = inserted.map((c: any) => ({
        ...c,
        type: resolveCategoryType(c.name, c.type),
      })) as Category[];
      await AsyncStorage.setItem(`${CATEGORY_CACHE_PREFIX}${userId}`, JSON.stringify(enriched)).catch(() => {});
      return enriched;
    }
  } catch {
    // Offline fallback
  }

  // Check local cache
  try {
    const cached = await AsyncStorage.getItem(`${CATEGORY_CACHE_PREFIX}${userId}`);
    if (cached) {
      const parsed = JSON.parse(cached) as Category[];
      return parsed.map((c) => ({
        ...c,
        type: resolveCategoryType(c.name, c.type),
      }));
    }
  } catch {
    // Ignore cache parse error
  }

  return DEFAULT_CATEGORIES.map((c, idx) => ({
    id: `local-cat-${idx}-${c.name.toLowerCase()}`,
    user_id: userId,
    ...c,
    is_custom: false,
    budget_monthly: null,
    type: (c as any).type || resolveCategoryType(c.name),
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
      const enriched = data.map((c: any) => ({
        ...c,
        type: resolveCategoryType(c.name, c.type),
      })) as Category[];
      await AsyncStorage.setItem(`${CATEGORY_CACHE_PREFIX}${userId}`, JSON.stringify(enriched)).catch(() => {});
      return enriched;
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
    if (cached) {
      const parsed = JSON.parse(cached) as Category[];
      return parsed.map((c) => ({
        ...c,
        type: resolveCategoryType(c.name, c.type),
      }));
    }
  } catch {
    // Ignore cache error
  }

  // Fallback to seeding or default template
  return await seedDefaultCategories(userId);
}

/**
 * Single-category lookup (e.g. for the per-save notification budget check).
 * Returns null on error or when the category does not exist — callers treat
 * null as "no category data" exactly like the previous full-list find-miss.
 */
export async function getCategoryById(categoryId: string): Promise<Category | null> {
  if (!categoryId) return null;
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', categoryId)
    .maybeSingle();
  if (error || !data) return null;
  const category = data as Category;
  return { ...category, type: resolveCategoryType(category.name, category.type) };
}

export async function createCategory(
  userId: string,
  input: {
    name: string;
    icon: string;
    color: string;
    budget_monthly?: number | null;
    type?: 'expense' | 'income';
  }
): Promise<Category> {
  const categoryType = input.type || 'expense';
  const trimmedName = input.name.trim();

  // ── Case-insensitive duplicate check before hitting the DB ──────────────
  const { data: existingCats } = await supabase
    .from('categories')
    .select('name')
    .eq('user_id', userId);

  if (existingCats) {
    const nameLower = trimmedName.toLowerCase();
    const duplicate = existingCats.find((c: { name: string }) => c.name.trim().toLowerCase() === nameLower);
    if (duplicate) {
      throw new Error(`A category named "${duplicate.name}" already exists.`);
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  const baseRow = {
    user_id: userId,
    name: trimmedName,
    icon: input.icon || '📌',
    color: input.color || '#10B981',
    is_custom: true,
    budget_monthly: input.budget_monthly ?? null,
  };

  // Single insert attempt (the legacy no-type retry was removed after the
  // production categories.type column was verified to exist).
  const { data: savedData, error: insertError } = await supabase
    .from('categories')
    .insert({ ...baseRow, type: categoryType })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      throw new Error('A category with this name already exists.');
    }
    throw insertError;
  }

  const finalCategory: Category = {
    ...savedData,
    type: resolveCategoryType(savedData.name, savedData.type ?? categoryType),
  };

  // Invalidate local cache
  await AsyncStorage.removeItem(`${CATEGORY_CACHE_PREFIX}${userId}`).catch(() => {});
  return finalCategory;
}

export async function updateCategory(
  categoryId: string,
  input: {
    name?: string;
    icon?: string;
    color?: string;
    budget_monthly?: number | null;
    type?: 'expense' | 'income';
  },
  userId?: string
): Promise<Category> {
  const updates: Record<string, any> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.icon !== undefined) updates.icon = input.icon;
  if (input.color !== undefined) updates.color = input.color;
  if (input.budget_monthly !== undefined) updates.budget_monthly = input.budget_monthly;

  // ── Case-insensitive duplicate check (only when name is being changed) ──
  if (input.name !== undefined && userId) {
    const trimmedName = input.name.trim();
    const { data: existingCats } = await supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', userId)
      .neq('id', categoryId);           // exclude the category being edited

    if (existingCats) {
      const nameLower = trimmedName.toLowerCase();
      const duplicate = existingCats.find((c: { id: string; name: string }) => c.name.trim().toLowerCase() === nameLower);
      if (duplicate) {
        throw new Error(`A category named "${duplicate.name}" already exists.`);
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  let updatedData: any = null;

  // Single update attempt (the legacy no-type retry was removed after the
  // production categories.type column was verified to exist).
  const res1 = await supabase
    .from('categories')
    .update({ ...updates, type: input.type })
    .eq('id', categoryId)
    .select('*')
    .single();

  if (res1.error) {
    if (res1.error.code === '23505') {
      throw new Error('A category with this name already exists.');
    }
    throw res1.error;
  }
  updatedData = res1.data;

  const finalCategory: Category = {
    ...updatedData,
    type: resolveCategoryType(updatedData.name, updatedData.type ?? input.type),
  };

  // Append-only budget history so past cycles show the limit active at the time
  if (userId && input.budget_monthly !== undefined) {
    void recordCategoryBudgetChange(userId, categoryId, input.budget_monthly).catch(() => undefined);
  }

  if (userId) {
    await AsyncStorage.removeItem(`${CATEGORY_CACHE_PREFIX}${userId}`).catch(() => {});
  }
  return finalCategory;
}

export async function deleteCategory(categoryId: string, userId?: string): Promise<void> {
  // 1. Handle local fallback category deletion (offline mode)
  if (categoryId.startsWith('local-cat-')) {
    if (userId) {
      try {
        const cached = await AsyncStorage.getItem(`${CATEGORY_CACHE_PREFIX}${userId}`);
        if (cached) {
          const list = JSON.parse(cached) as Category[];
          const filtered = list.filter((c) => c.id !== categoryId);
          await AsyncStorage.setItem(`${CATEGORY_CACHE_PREFIX}${userId}`, JSON.stringify(filtered));
        }
      } catch {
        // Ignore cache write error
      }
    }
    return;
  }

  // 2. Safe Foreign Key Reassignment:
  // If this category is linked to existing transactions or recurring rules,
  // reassign them to a fallback category ("Other" or first available category) so deletion succeeds
  if (userId) {
    try {
      const { data: otherCats } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', userId)
        .neq('id', categoryId);

      if (otherCats && otherCats.length > 0) {
        const fallback = otherCats.find((c) => c.name.toLowerCase().includes('other')) || otherCats[0];
        if (fallback?.id) {
          await supabase.from('expenses').update({ category_id: fallback.id }).eq('category_id', categoryId);
          await supabase.from('recurring_rules').update({ category_id: fallback.id }).eq('category_id', categoryId);
        }
      }
    } catch {
      // Proceed to deletion
    }
  }

  // 3. Delete category from database
  const { error } = await supabase.from('categories').delete().eq('id', categoryId);
  if (error) {
    if (error.code === '23503') {
      throw new Error('Please reassign transactions linked to this category before deleting it.');
    }
    throw error;
  }

  // 4. Invalidate local cache
  if (userId) {
    await AsyncStorage.removeItem(`${CATEGORY_CACHE_PREFIX}${userId}`).catch(() => {});
  }
}

export async function updateCategoryBudget(categoryId: string, budgetMonthly: number | null, userId?: string) {
  const { data, error } = await supabase
    .from('categories')
    .update({ budget_monthly: budgetMonthly })
    .eq('id', categoryId)
    .select('*')
    .single();

  if (error) throw error;

  // Append-only budget history so past cycles show the limit active at the time
  if (userId) {
    void recordCategoryBudgetChange(userId, categoryId, budgetMonthly).catch(() => undefined);
  }

  if (userId) {
    await AsyncStorage.removeItem(`${CATEGORY_CACHE_PREFIX}${userId}`).catch(() => {});
  }
  return data as Category;
}
