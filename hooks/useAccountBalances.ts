import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeAccountBalances } from '@/services/bankAccounts';
import { useExpenses } from '@/hooks/useExpenses';
import { useTransfers } from '@/hooks/useTransfers';
import { BankAccount } from '@/types';

export type AccountWithBalance = BankAccount & { live_balance: number };

/**
 * THE single source of truth for live account balances.
 *
 * Balance = initial_balance + income − expenses (converted into each
 * account's own currency) ± account-to-account transfers, per
 * computeAccountBalances(). Before this hook existed, Accounts & Wallets and
 * the Add/Edit expense form each wired up useExpenses + useTransfers + a
 * compute effect on their own — two independent sources of the same number
 * that silently diverged the moment one screen forgot a fetchAll flag, showing
 * a NEGATIVE balance in one place and the correct one in the other.
 *
 * Every screen that shows a balance must consume this hook. Accounts stay an
 * INPUT (each screen owns its account CRUD/loading); transactions always come
 * from fetchAll — a partial history would miss old income and break the sum.
 */
export function useAccountBalances(userId: string | undefined, accounts: BankAccount[]) {
  // fetchAll is not optional here: it is the whole reason both screens agree.
  const expenses = useExpenses(userId, { fetchAll: true });
  const transfers = useTransfers(userId);

  const [liveBalances, setLiveBalances] = useState<AccountWithBalance[]>([]);

  // Paint raw initial balances synchronously when the account set changes so
  // lists never flash empty while the async currency conversions resolve.
  useEffect(() => {
    setLiveBalances(
      accounts.map((account) => ({ ...account, live_balance: Number(account.initial_balance || 0) })),
    );
  }, [accounts]);

  useEffect(() => {
    let cancelled = false;
    computeAccountBalances(accounts, expenses.items, transfers.transfers)
      .then((next) => {
        if (!cancelled) setLiveBalances(next);
      })
      .catch(() => {
        // Keep the last computed balances; submit guards still work off them.
      });
    return () => {
      cancelled = true;
    };
  }, [accounts, expenses.items, transfers.transfers]);

  const balanceById = useMemo(
    () => new Map(liveBalances.map((account) => [account.id, account.live_balance])),
    [liveBalances],
  );

  /** Re-pull the transaction side (callers reload their own accounts). */
  const refresh = useCallback(async () => {
    await Promise.all([expenses.refresh(true), transfers.refresh()]);
  }, [expenses.refresh, transfers.refresh]);

  return { liveBalances, balanceById, refresh, loading: expenses.loading || transfers.loading, expenses, transfers };
}
