// Single source of truth for input validation shared across the write services.
// The canonical amount predicate started life as a private helper in
// services/expenses.ts and was re-typed inline in services/recurring.ts (twice)
// and services/transfers.ts — with real drift already (transfers lacked the
// MAX_AMOUNT cap). Everything that accepts a user-supplied money value must
// validate through here so a forged/overflowing number is rejected identically
// at every write path.

export const MAX_AMOUNT = 1_000_000_000_000;

/** Coerces and validates a positive money amount, capped at MAX_AMOUNT.
 *  Throws a user-facing Error (surfaced through the existing Alert/toast paths). */
export function validateAmount(
  amount: unknown,
  message = 'Enter a valid amount greater than zero.',
): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) {
    throw new Error(message);
  }
  return value;
}
