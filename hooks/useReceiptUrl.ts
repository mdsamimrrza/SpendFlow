import { useEffect, useState } from 'react';
import { resolveReceiptUrl } from '@/services/receipts';

/**
 * Resolves whatever is stored in `expenses.receipt_image_url` (a raw storage
 * path on new rows, a legacy public URL, or a local device URI from the
 * offline fallback) into a renderable URL. Private-bucket objects are turned
 * into short-lived signed URLs; everything else passes through unchanged.
 */
export function useReceiptUrl(stored: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!stored) {
      setResolved(null);
      return;
    }
    resolveReceiptUrl(stored)
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch(() => {
        if (!cancelled) setResolved(stored);
      });
    return () => {
      cancelled = true;
    };
  }, [stored]);

  return resolved;
}
