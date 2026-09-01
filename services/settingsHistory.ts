import { supabase } from '@/utils/supabase';
import { CategoryBudgetPeriod, UserSettingsPeriod } from '@/types';

// The baseline row covers every date before the first recorded change, so
// resolution always has something to fall back on.
const BASELINE_EFFECTIVE_FROM = '1900-01-01';

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// numeric columns can come back as string or number depending on the driver
function normNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sameUserSettings(
  a: { monthly_budget?: unknown; cycle_start_day?: unknown; cycle_end_day?: unknown },
  b: { monthly_budget: number | null; cycle_start_day: number; cycle_end_day: number | null },
): boolean {
  return (
    normNum(a.monthly_budget) === b.monthly_budget &&
    Number(a.cycle_start_day) === b.cycle_start_day &&
    normNum(a.cycle_end_day) === b.cycle_end_day
  );
}

/**
 * Seed the history with the user's current settings (once) so dates before
 * the first recorded change still resolve. Safe to call on every app start.
 */
export async function ensureUserSettingsBaseline(
  userId: string,
  settings: { monthly_budget: number | null; cycle_start_day: number; cycle_end_day: number | null },
): Promise<void> {
  const { data: existing, error } = await supabase
    .from('user_settings_history')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw error;
  if (existing && existing.length > 0) return;

  const { error: insertError } = await supabase.from('user_settings_history').insert({
    user_id: userId,
    effective_from: BASELINE_EFFECTIVE_FROM,
    monthly_budget: settings.monthly_budget,
    cycle_start_day: settings.cycle_start_day,
    cycle_end_day: settings.cycle_end_day,
  });
  if (insertError) throw insertError;
}

/**
 * Append a history row (effective today) after the user changes their budget
 * or cycle days. Deduped against the latest row so no-op saves don't add noise.
 */
export async function recordUserSettingsChange(
  userId: string,
  settings: { monthly_budget: number | null; cycle_start_day: number; cycle_end_day: number | null },
): Promise<void> {
  const { data: latestRows, error } = await supabase
    .from('user_settings_history')
    .select('monthly_budget, cycle_start_day, cycle_end_day')
    .eq('user_id', userId)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;

  const latest = latestRows?.[0];
  if (latest && sameUserSettings(latest, settings)) return;

  const { error: insertError } = await supabase.from('user_settings_history').insert({
    user_id: userId,
    effective_from: todayISO(),
    monthly_budget: settings.monthly_budget,
    cycle_start_day: settings.cycle_start_day,
    cycle_end_day: settings.cycle_end_day,
  });
  if (insertError) throw insertError;
}

/** Settings segments sorted oldest → newest. */
export async function fetchUserSettingsHistory(userId: string): Promise<UserSettingsPeriod[]> {
  const { data, error } = await supabase
    .from('user_settings_history')
    .select('effective_from, monthly_budget, cycle_start_day, cycle_end_day')
    .eq('user_id', userId)
    .order('effective_from', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    effective_from: row.effective_from,
    monthly_budget: normNum(row.monthly_budget),
    cycle_start_day: Number(row.cycle_start_day) || 1,
    cycle_end_day: row.cycle_end_day === null || row.cycle_end_day === undefined ? null : Number(row.cycle_end_day),
  }));
}

/** Settings that were active on the given date; falls back when history is empty. */
export function resolveUserSettingsForDate(
  history: UserSettingsPeriod[],
  fallback: UserSettingsPeriod,
  dateISO: string,
): UserSettingsPeriod {
  let resolved = fallback;
  for (const row of history) {
    if (row.effective_from <= dateISO) resolved = row;
  }
  return resolved;
}

/** Append a history row after a category's monthly budget changes. */
export async function recordCategoryBudgetChange(
  userId: string,
  categoryId: string,
  budgetMonthly: number | null,
): Promise<void> {
  const { data: latestRows, error } = await supabase
    .from('category_budget_history')
    .select('budget_monthly')
    .eq('category_id', categoryId)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;

  const latest = latestRows?.[0];
  if (latest && normNum(latest.budget_monthly) === budgetMonthly) return;

  const { error: insertError } = await supabase.from('category_budget_history').insert({
    user_id: userId,
    category_id: categoryId,
    effective_from: todayISO(),
    budget_monthly: budgetMonthly,
  });
  if (insertError) throw insertError;
}

/** Category budget segments sorted oldest → newest. */
export async function fetchCategoryBudgetHistory(userId: string): Promise<CategoryBudgetPeriod[]> {
  const { data, error } = await supabase
    .from('category_budget_history')
    .select('category_id, effective_from, budget_monthly')
    .eq('user_id', userId)
    .order('effective_from', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    category_id: row.category_id,
    effective_from: row.effective_from,
    budget_monthly: normNum(row.budget_monthly),
  }));
}

/** A category's monthly budget as it was on the given date. */
export function resolveCategoryBudgetForDate(
  history: CategoryBudgetPeriod[],
  categoryId: string,
  dateISO: string,
  fallback: number | null,
): number | null {
  let resolved = fallback;
  for (const row of history) {
    if (row.category_id === categoryId && row.effective_from <= dateISO) {
      resolved = row.budget_monthly;
    }
  }
  return resolved;
}
