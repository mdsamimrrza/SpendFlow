/**
 * Extracts a human-readable message from any thrown value. Supabase request
 * failures are plain PostgrestError objects (not `Error` instances), so a bare
 * `instanceof Error` check would hide the real reason behind a generic fallback.
 *
 * Audit 2026-10-27 (A12/A13): known infrastructure failures are mapped to
 * user-safe wording — raw PostgREST constraint text, JWT internals, and
 * fetch-level messages never reach the UI. Unknown messages still pass
 * through (they are usually the app's own curated validation copy).
 */
const FRIENDLY_PATTERNS: [RegExp, string][] = [
  [/fetch failed|network request failed|failed to fetch|err_network/i,
    "You're offline — check your connection and try again."],
  [/duplicate key value/i, 'This entry already exists.'],
  [/violates check constraint/i, 'Some values are out of range. Please review the form and try again.'],
  [/row-level security|permission denied/i, "You don't have permission for this action."],
  [/jwt|invalid claim|token expired|pgrst301|401/i, 'Your session expired. Please sign in again.'],
  [/insufficient/i, 'Insufficient balance for this action.'],
];

export function getErrorMessage(err: unknown, fallback: string): string {
  let message = fallback;
  if (typeof err === 'string' && err.trim()) message = err;
  else if (typeof err === 'object' && err !== null && 'message' in err) {
    const extracted = String((err as { message: unknown }).message);
    if (extracted.trim()) message = extracted;
  } else if (err instanceof Error && err.message.trim()) message = err.message;

  for (const [pattern, friendly] of FRIENDLY_PATTERNS) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}
