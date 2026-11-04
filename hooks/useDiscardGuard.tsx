import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useLanguage } from '@/hooks/useLanguage';

/**
 * Discard guard for dirty forms (audit 2026-10-27, A14): blocks the Android
 * hardware back button while `isDirty` is true and asks before discarding.
 * Returns `confirmDiscard` so in-app back buttons route through the same
 * confirm instead of exiting silently, plus `dialog` — render it once in the
 * screen's tree so the confirm uses the designed themed dialog (the plain
 * system Alert looked foreign here, same finding as the delete confirm).
 *
 * Callers pass the navigation completion in `onDiscard` (e.g.
 * `() => router.back()`), so the guard works identically for stack screens
 * and modal close paths. (Web keeps its own beforeunload guard — W9.)
 */
export function useDiscardGuard(
  isDirty: boolean,
  onDiscard: () => void,
  title?: string,
  message?: string,
): { confirmDiscard: () => void; dialog: ReactNode } {
  const { t } = useLanguage();
  const [guardOpen, setGuardOpen] = useState(false);
  const onDiscardRef = useRef(onDiscard);

  useEffect(() => {
    onDiscardRef.current = onDiscard;
  }, [onDiscard]);

  const confirmDiscard = useCallback(() => setGuardOpen(true), []);

  useEffect(() => {
    if (!isDirty) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmDiscard();
      return true;
    });
    return () => sub.remove();
  }, [isDirty, confirmDiscard]);

  const dialog = (
    <ConfirmDialog
      visible={guardOpen}
      title={title ?? (t('discard_title') || 'Discard changes?')}
      message={message ?? (t('discard_message') || 'You have unsaved changes.')}
      confirmLabel={t('common_discard') || 'Discard'}
      cancelLabel={t('discard_keep_editing') || 'Keep editing'}
      onCancel={() => setGuardOpen(false)}
      onConfirm={() => {
        setGuardOpen(false);
        onDiscardRef.current();
      }}
    />
  );

  return { confirmDiscard, dialog };
}
