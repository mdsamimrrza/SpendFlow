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
  a: { monthly_budget?: unknown; budget_currency?: unknown; cycle_start_day?: unknown; cycle_end_day?: unknown },
  b: { monthly_budget: number | null; budget_currency?: string | null; cycle_start_day: number; cycle_end_day: number | null },
): boolean {
  return (
    normNum(a.monthly_budget) === b.monthly_budget &&
    (a.budget_currency || null) === (b.budget_currency || null) &&
    Number(a.cycle_start_day) === b.cycle_start_day &&
    normNum(a.cycle_end_day) === b.cycle_end_day
  );
}

/**
 * Seed/refresh the baseline row (1900-01-01) with the user's current settings.
 * Always upserts so the baseline stays in sync with the latest values in `users` table.
 */
export async function ensureUserSettingsBaseline(
  userId: string,
  settings: { monthly_budget: number | null; budget_currency?: string | null; cycle_start_day: number; cycle_end_day: number | null },
): Promise<void> {
  const payload: Record<string, any> = {
    user_id: userId,
    effective_from: BASELINE_EFFECTIVE_FROM,
    monthly_budget: settings.monthly_budget,
    cycle_start_day: settings.cycle_start_day,
    cycle_end_day: settings.cycle_end_day,
  };
  if (settings.budget_currency !== undefined) payload.budget_currency = settings.budget_currency;

  // Upsert: insert if missing, update if exists (keeps baseline in sync with current)
  const { error } = await supabase
    .from('user_settings_history')
    .upsert(payload, {
      onConflict: 'user_id,effective_from',
      ignoreDuplicates: false,
    });
  if (error) throw error;
}

/**
 * Record a settings change for today. If a row already exists for this month
 * (same user + same effective_from month/year), UPDATE it instead of inserting
 * a duplicate. This keeps one row per month per user.
 */
export async function recordUserSettingsChange(
  userId: string,
  settings: { monthly_budget: number | null; budget_currency?: string | null; cycle_start_day: number; cycle_end_day: number | null },
): Promise<void> {
  const today = todayISO(); // YYYY-MM-DD
  const monthPrefix = today.slice(0, 7); // YYYY-MM

  // Check if a row for this month already exists
  const { data: existing, error: selectError } = await supabase
    .from('user_settings_history')
    .select('id, monthly_budget, budget_currency, cycle_start_day, cycle_end_day')
    .eq('user_id', userId)
    .like('effective_from', `${monthPrefix}%`)
    .order('effective_from', { ascending: false })
    .limit(1);
  if (selectError) throw selectError;

  const existingRow = existing?.[0];
  const settingsMatch = existingRow && sameUserSettings(existingRow, settings);

  if (settingsMatch) {
    return; // No change needed
  }

  const payload: Record<string, any> = {
    user_id: userId,
    effective_from: today,
    monthly_budget: settings.monthly_budget,
    cycle_start_day: settings.cycle_start_day,
    cycle_end_day: settings.cycle_end_day,
  };
  if (settings.budget_currency !== undefined) payload.budget_currency = settings.budget_currency;

  if (existingRow) {
    // Same month exists but values differ → UPDATE it
    const { error: updateError } = await supabase
      .from('user_settings_history')
      .update(payload)
      .eq('id', existingRow.id);
    if (updateError) throw updateError;
  } else {
    // New month → INSERT
    const { error: insertError } = await supabase.from('user_settings_history').insert(payload);
    if (insertError) throw insertError;
  }
}

/** Settings segments sorted oldest → newest. */
export async function fetchUserSettingsHistory(userId: string): Promise<UserSettingsPeriod[]> {
  const { data, error } = await supabase
    .from('user_settings_history')
    .select('effective_from, monthly_budget, budget_currency, cycle_start_day, cycle_end_day')
    .eq('user_id', userId)
    .order('effective_from', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    effective_from: row.effective_from,
    monthly_budget: normNum(row.monthly_budget),
    budget_currency: row.budget_currency ?? null,
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