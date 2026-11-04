import { useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler } from 'react-native';

/**
 * Discard guard for dirty forms (audit 2026-10-27, A14): blocks the Android
 * hardware back button while `isDirty` is true and asks before discarding.
 * Returns `confirmDiscard` so in-app back buttons route through the same
 * confirm instead of exiting silently.
 *
 * Callers pass the navigation completion in `onDiscard` (e.g.
 * `() => router.back()`), so the guard works identically for stack screens
 * and modal close paths. (Web keeps its own beforeunload guard — W9.)
 */
export function useDiscardGuard(
  isDirty: boolean,
  onDiscard: () => void,
  title = 'Discard changes?',
  message = 'You have unsaved changes.',
): () => void {
  const discardRef = useRef<() => void>(null);
  const onDiscardRef = useRef(onDiscard);

  useEffect(() => {
    onDiscardRef.current = onDiscard;
  }, [onDiscard]);

  const confirmDiscard = useCallback(() => {
    Alert.alert(title, message, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => onDiscardRef.current() },
    ]);
  }, [title, message]);

  useEffect(() => {
    if (!isDirty) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmDiscard();
      return true;
    });
    return () => sub.remove();
  }, [isDirty, confirmDiscard]);

  return confirmDiscard;
}
