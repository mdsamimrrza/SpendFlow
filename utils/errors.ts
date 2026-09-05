/**
 * Extracts a human-readable message from any thrown value. Supabase request
 * failures are plain PostgrestError objects (not `Error` instances), so a bare
 * `instanceof Error` check would hide the real reason behind a generic fallback.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err.trim()) return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = String((err as { message: unknown }).message);
    if (message.trim()) return message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
