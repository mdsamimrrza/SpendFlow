import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  /** How long the toast stays on screen before auto-dismissing (ms). */
  duration?: number;
}

interface ToastData {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

type ToastListener = (toast: ToastData) => void;

const toastListeners = new Set<ToastListener>();
let nextToastId = 1;

/**
 * Fire-and-forget toast rendered top-right by the single <ToastHost /> mounted
 * at the app root. Safe to call from anywhere — screens, handlers, services.
 * The host renders through a transparent Modal that only mounts while toasts
 * are visible, so toasts also appear above screens presented as modals and
 * above open in-page Modals (later-mounted native windows stack on top).
 */
export function showToast({ message, type = 'success', duration = 3200 }: ToastOptions) {
  const trimmed = message.trim();
  if (!trimmed) return;
  const toast: ToastData = { id: nextToastId++, type, message: trimmed, duration };
  toastListeners.forEach((listener) => listener(toast));
}

const TOAST_ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

/** Slide-in distance from the right edge (px). */
const ENTER_OFFSET = 140;

function ToastCard({
  toast,
  exiting,
  onRequestDismiss,
  onDismissed,
}: {
  toast: ToastData;
  exiting: boolean;
  onRequestDismiss: (id: number) => void;
  onDismissed: (id: number) => void;
}) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(ENTER_OFFSET)).current;

  const accent =
    toast.type === 'success'
      ? theme.colors.income
      : toast.type === 'error'
        ? theme.colors.danger
        : theme.colors.primary;
  const Icon = TOAST_ICONS[toast.type];

  // Slide in from the right edge, then start the auto-dismiss countdown.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => onRequestDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast, onRequestDismiss, opacity, translateX]);

  // Slide back out and only then report removal so the card unmounts smoothly.
  useEffect(() => {
    if (!exiting) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateX, {
        toValue: ENTER_OFFSET,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onDismissed(toast.id);
    });
  }, [exiting, toast, onDismissed, opacity, translateX]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toast.message}
        onPress={() => onRequestDismiss(toast.id)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 11,
          paddingLeft: 12,
          paddingRight: 18,
          borderRadius: 18,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.22,
          shadowRadius: 16,
          elevation: 14,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${accent}${theme.isDark ? '2E' : '1A'}`,
          }}
        >
          <Icon size={17} color={accent} strokeWidth={2.4} />
        </View>
        <Text
          numberOfLines={3}
          style={{
            // flexShrink (not flex:1): on Android, flex:1 inside a shrink-to-fit
            // row collapses the message to zero width — only the icon rendered.
            flexShrink: 1,
            fontSize: 12.5,
            lineHeight: 17,
            fontWeight: '800',
            color: theme.colors.text,
            includeFontPadding: false,
          }}
        >
          {toast.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const listener: ToastListener = (toast) => {
      // Cap concurrent toasts so a rapid burst never stacks off-screen.
      setToasts((current) => {
        const next = [...current, toast];
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });
    };
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  const beginExit = useCallback((id: number) => {
    setExitingIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const finishExit = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    setExitingIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <Modal
      transparent
      visible
      hardwareAccelerated
      statusBarTranslucent
      pointerEvents="box-none"
      onRequestClose={() => toasts.forEach((t) => beginExit(t.id))}
    >
      <View pointerEvents="box-none" style={{ flex: 1 }}>
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 14,
            // Bounded width so long messages wrap to 3 lines instead of
            // stretching the stack to the screen edge.
            left: 84,
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          {toasts.map((toast) => (
            <ToastCard
              key={toast.id}
              toast={toast}
              exiting={exitingIds.has(toast.id)}
              onRequestDismiss={beginExit}
              onDismissed={finishExit}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
}
