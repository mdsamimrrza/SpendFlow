import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, View } from 'react-native';
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

// ── Multi-host arbitration ───────────────────────────────────────────────────
// Screens presented with presentation:'modal' (Export, Transfer, Profit & Loss,
// expense/add) live in their own native window on Android, which renders ABOVE
// the app-root ToastHost — a toast fired from there would be invisible. Those
// screens therefore mount their own <ToastHost />; only the most recently
// mounted (topmost) host actually renders, so a toast never shows twice and
// the root host takes over again once the modal screen unmounts.
const hostStack: number[] = [];
const hostRefreshers = new Set<() => void>();
let nextHostId = 1;

function useTopmostHost(): boolean {
  const idRef = useRef<number>(0);
  if (!idRef.current) idRef.current = nextHostId++;
  const [, refresh] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    hostStack.push(idRef.current);
    hostRefreshers.add(refresh);
    // Let every host (this one included) re-evaluate who is topmost.
    hostRefreshers.forEach((r) => r());
    return () => {
      hostRefreshers.delete(refresh);
      const idx = hostStack.indexOf(idRef.current);
      if (idx >= 0) hostStack.splice(idx, 1);
      hostRefreshers.forEach((r) => r());
    };
  }, [refresh]);

  return hostStack[hostStack.length - 1] === idRef.current;
}

/**
 * Fire-and-forget toast rendered top-center by the single <ToastHost /> mounted
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

/** Slide-in distance from above (px). */
const ENTER_OFFSET = 60;

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
  const translateY = useRef(new Animated.Value(-ENTER_OFFSET)).current;

  const accent =
    toast.type === 'success'
      ? theme.colors.income
      : toast.type === 'error'
        ? theme.colors.danger
        : theme.colors.primary;
  const Icon = TOAST_ICONS[toast.type];

  // Drop in from the top edge, then start the auto-dismiss countdown.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => onRequestDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast, onRequestDismiss, opacity, translateY]);

  // Slide back up and only then report removal so the card unmounts smoothly.
  useEffect(() => {
    if (!exiting) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, {
        toValue: -ENTER_OFFSET,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onDismissed(toast.id);
    });
  }, [exiting, toast, onDismissed, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
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
          // Solid accent fill — impossible to miss at a glance.
          backgroundColor: accent,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.25)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
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
            backgroundColor: 'rgba(255,255,255,0.24)',
          }}
        >
          <Icon size={17} color="#FFFFFF" strokeWidth={2.4} />
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
            color: '#FFFFFF',
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
  const isTop = useTopmostHost();
  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;

  useEffect(() => {
    const listener: ToastListener = (toast) => {
      // Only the topmost visible host renders — a background modal host or
      // the root host under an open modal screen must stay silent so the
      // toast never paints twice.
      if (!isTopRef.current) return;
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

  // Losing the topmost seat (a modal screen mounted its own host) means any
  // toast still queued here would double-render with the new host's on iOS —
  // hand the queue over by clearing it.
  useEffect(() => {
    if (!isTop) setToasts([]);
  }, [isTop]);

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

  if (!isTop || toasts.length === 0) return null;

  // The toast stack. On Android it renders directly in the view hierarchy —
  // a transparent Modal there swallows ALL touches behind it on the New
  // Architecture (pointerEvents="box-none" is not honored inside Modals),
  // freezing the screen while a toast is visible. iOS keeps the Modal so
  // toasts still float above native modals.
  const toastStack = (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 30,
        left: 24,
        right: 24,
        gap: 8,
        alignItems: 'center',
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
  );

  if (Platform.OS === 'ios') {
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
          {toastStack}
        </View>
      </Modal>
    );
  }

  return toastStack;
}
