import { deleteReceipt } from '@/services/receipts';
import { notifyRecurringRulesChanged } from '@/services/recurring';
import { notifyExpensesChanged } from '@/hooks/useExpenses';
import { supabase } from '@/utils/supabase';
import { BIN_RETENTION_DAYS, BinItem, Expense, RecurringRule } from '@/types';

const DAY_MS = 86_400_000;

/**
 * Bin (Google-Photos-style trash). Deleting an expense or a recurring plan
 * sets `deleted_at` instead of removing the row; the item then lives here for
 * BIN_RETENTION_DAYS days, showing its own countdown, until either the user
 * restores it / deletes it forever, or the nightly `purge_expired_bin_items()`
 * cron sweep removes the row from the database for good (which is what keeps
 * the hot tables small).
 */

/** ISO cutoff: rows soft-deleted BEFORE this instant have exhausted the 60 days. */
function retentionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - BIN_RETENTION_DAYS * DAY_MS).toISOString();
}

/** Whole days left before the automatic purge (60 right after deletion → 1). */
export function binDaysLeft(deletedAt: string, now: Date = new Date()): number {
  const remainingMs = deletedAt
    ? BIN_RETENTION_DAYS * DAY_MS - (now.getTime() - new Date(deletedAt).getTime())
    : 0;
  return Math.min(BIN_RETENTION_DAYS, Math.max(1, Math.ceil(remainingMs / DAY_MS)));
}

/**
 * Every restorable item: binned expenses + binned recurring plans, newest
 * deletion first. Rows that already passed the window are hidden — the cron
 * purge deletes them server-side, and we must never offer "Restore" for a row
 * whose data is about to vanish mid-tap.
 */
export async function listBinItems(userId: string): Promise<BinItem[]> {
  const cutoff = retentionCutoff();

  const [expenseResult, ruleResult] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, categories(name, icon, color)')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .gte('deleted_at', cutoff)
      .order('deleted_at', { ascending: false }),
    supabase
      .from('recurring_rules')
      .select('*, categories(name, icon, color)')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .gte('deleted_at', cutoff)
      .order('deleted_at', { ascending: false }),
  ]);

  if (expenseResult.error) throw expenseResult.error;
  if (ruleResult.error) throw ruleResult.error;

  const items: BinItem[] = [
    ...(((expenseResult.data ?? []) as unknown) as Expense[]).map((expense) => ({
      kind: 'expense' as const,
      id: expense.id,
      deleted_at: (expense.deleted_at ?? expense.updated_at) as string,
      expense,
    })),
    ...(((ruleResult.data ?? []) as unknown) as RecurringRule[]).map((rule) => ({
      kind: 'recurring' as const,
      id: rule.id,
      deleted_at: (rule.deleted_at ?? rule.updated_at) as string,
      rule,
    })),
  ];

  return items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
}

/** Back to normal: clears the trash flag and refreshes the mounted screens. */
export async function restoreBinItem(userId: string, item: BinItem): Promise<void> {
  const table = item.kind === 'expense' ? 'expenses' : 'recurring_rules';
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: null })
    .eq('id', item.id)
    .eq('user_id', userId);
  if (error) throw error;

  if (item.kind === 'expense') notifyExpensesChanged();
  else notifyRecurringRulesChanged();
}

/**
 * "Delete forever" — removes the row now, skipping the remaining countdown,
 * plus its private receipt file. Ownership is RLS-scoped; the user_id filter is
 * defense in depth.
 */
export async function deleteBinItemForever(userId: string, item: BinItem): Promise<void> {
  const table = item.kind === 'expense' ? 'expenses' : 'recurring_rules';
  if (item.kind === 'expense') {
    // Best-effort first: a storage hiccup must not leave the row undeleted.
    await deleteReceipt(item.expense.receipt_image_url).catch(() => undefined);
  }
  const { error } = await supabase.from(table).delete().eq('id', item.id).eq('user_id', userId);
  if (error) throw error;

  if (item.kind === 'expense') notifyExpensesChanged();
  else notifyRecurringRulesChanged();
}

/** Deletes every binned row (and its receipt file). Returns the number removed. */
export async function emptyBin(userId: string): Promise<number> {
  const items = await listBinItems(userId);
  let removed = 0;
  for (const item of items) {
    await deleteBinItemForever(userId, item);
    removed += 1;
  }
  return removed;
}

/**
 * Nightly cron purge also un-roots receipt FILES it can no longer reach from
 * SQL; the migration queues their paths and this claim drains them through
 * the normal owner-scoped storage delete. Fire-and-forget on Bin load.
 */
export async function drainBinReceiptOrphans(userId?: string | null): Promise<void> {
  if (!userId) return;
  try {
    const { data, error } = await supabase.rpc('claim_bin_receipt_orphans');
    if (error || !data?.length) return;
    const paths = (data as string[]).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from('receipts').remove(paths).catch(() => undefined);
    }
  } catch {
    // Storage hygiene is best-effort; queued paths stay for the next visit.
  }
}
