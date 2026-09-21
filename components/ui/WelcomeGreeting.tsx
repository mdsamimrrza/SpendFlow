import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowRight,
  Check,
  Moon,
  Plus,
  Sparkles,
  Star,
  Sun,
  X,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";

const STORAGE_KEY = "@spendflow_welcome_greeting";

/** Set to true only for local popup testing (fires every refresh, any hour). */
const TEST_SHOW_EVERY_REFRESH = false;

type Slot = "morning" | "evening";

interface StoredState {
  dontShowAgain?: boolean;
  morning?: string;
  evening?: string;
}

function getSlot(hour: number): Slot | null {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 17 && hour < 22) return "evening";
  return null;
}

function todayKey(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

function capitalize(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface WelcomeGreetingProps {
  onClose?: () => void;
}

export function WelcomeGreeting({ onClose }: WelcomeGreetingProps) {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguage();
  const { profile, session } = useAuth();
  const router = useRouter();

  // TESTING: with the flag on, the slot locks to morning outside
  // 5–12 / 17–22 so the popup fires at any hour. Flag off → real clock.
  const slot = useMemo(() => {
    const real = getSlot(new Date().getHours());
    if (real) return real;
    return TEST_SHOW_EVERY_REFRESH ? ('morning' as Slot) : null;
  }, []);
  const userId = profile?.id ?? session?.user?.id ?? "";
  const storageKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;

  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const shownRef = useRef(false);
  // Re-entrancy guard: profile/expense refreshes re-run this effect — never
  // re-pop while already visible or after dismissing within one mount.
  const activeRef = useRef(false);

  const rawName =
    profile?.display_name?.trim() ||
    profile?.email?.split("@")[0]?.trim() ||
    "friend";
  const displayName = capitalize(rawName);

  const isMorning = slot === "morning";

  const accent = isMorning ? (isDark ? "#FBBF24" : "#B45309") : isDark ? "#A5B4FC" : "#4F46E5";
  const accentSoft = isMorning
    ? isDark
      ? "rgba(251, 191, 36, 0.16)"
      : "rgba(180, 83, 9, 0.12)"
    : isDark
      ? "rgba(165, 180, 252, 0.16)"
      : "rgba(79, 70, 229, 0.12)";
  const halo: [string, string] = isMorning
    ? isDark
      ? ["#F59E0B", "#B45309"]
      : ["#FCD34D", "#F59E0B"]
    : isDark
      ? ["#818CF8", "#4C1D95"]
      : ["#A5B4FC", "#6366F1"];

  const title = isMorning ? t("welcome_morning_title") : t("welcome_evening_title");
  const message = isMorning ? t("welcome_morning_message") : t("welcome_evening_message");
  const actionLabel = isMorning ? t("welcome_morning_action") : t("welcome_evening_action");
  const ActionIcon = isMorning ? Plus : ArrowRight;
  const SlotIcon = isMorning ? Sun : Moon;

  const dateLabel = useMemo(() => {
    const locale = language === "ne" ? "ne-NP" : language === "hi" ? "hi-IN" : "en-US";
    try {
      return new Date().toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return "";
    }
  }, [language]);

  const readStored = useCallback(async (): Promise<StoredState> => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) return (JSON.parse(raw) as StoredState) ?? {};
      // Honor opt-outs saved under the legacy global key.
      const legacy = await AsyncStorage.getItem(STORAGE_KEY);
      if (legacy) return (JSON.parse(legacy) as StoredState) ?? {};
    } catch {
      // Corrupt storage → treat as never shown.
    }
    return {};
  }, [storageKey]);

  const persistClose = useCallback(async () => {
    if (!slot || TEST_SHOW_EVERY_REFRESH) return;
    try {
      const prev = await readStored();
      const next: StoredState = {
        ...prev,
        [slot]: todayKey(),
        dontShowAgain: dontShowAgain || prev.dontShowAgain === true,
      };
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Non-credential UI state — safe to ignore write failures.
    }
  }, [dontShowAgain, readStored, slot, storageKey]);

  const playEnter = useCallback(() => {
    opacity.setValue(0);
    scale.setValue(0.9);
    translateY.setValue(24);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale, translateY]);

  const close = useCallback(
    (persist: boolean) => {
      if (persist) void persistClose();
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.93,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVisible(false);
        activeRef.current = false;
        onClose?.();
      });
    },
    [onClose, opacity, persistClose, scale],
  );

  useEffect(() => {
    if (!slot || activeRef.current) return;
    activeRef.current = true;
    // TESTING ONLY — bypasses the twice-a-day lock so the popup shows on
    // every refresh. The Fast Refresh state guard is bypassed too.
    if (!TEST_SHOW_EVERY_REFRESH) {
      if (shownRef.current) return;
      shownRef.current = true;
    }
    let cancelled = false;
    (async () => {
      if (!TEST_SHOW_EVERY_REFRESH) {
        const stored = await readStored();
        if (cancelled) return;
        if (stored.dontShowAgain || stored[slot] === todayKey()) {
          activeRef.current = false;
          return;
        }
      }
      if (cancelled) return;
      setVisible(true);
      playEnter();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [playEnter, readStored, slot]);

  const handleAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    close(true);
    const target = isMorning ? "/expense/add" : "/history";
    setTimeout(() => {
      router.push(target as never);
    }, 240);
  }, [close, isMorning, router]);

  const toggleOptOut = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setDontShowAgain((v) => !v);
  }, []);

  if (!slot) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => close(true)}
    >
      <View style={styles.overlay}>
        {/* Click-outside dismissal layer */}
        <Pressable
          style={styles.backdrop}
          onPress={() => close(true)}
          accessibilityLabel={t("welcome_dismiss")}
        />
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity,
              transform: [{ translateY }, { scale }],
            },
          ]}
        >
          {/* Decorative art header */}
          <View pointerEvents="none" style={styles.art}>
            <LinearGradient
              colors={[accentSoft, "transparent"]}
              style={styles.wash}
            />
            <View style={[styles.blob, styles.blobLeft, { backgroundColor: accentSoft }]} />
            <View style={[styles.blob, styles.blobRight, { backgroundColor: accentSoft }]} />
          </View>

          <View style={styles.topRow}>
            <View style={[styles.datePill, { backgroundColor: accentSoft }]}>
              <SlotIcon size={12} color={accent} strokeWidth={2.5} />
              <Text style={[styles.datePillText, { color: accent }]}>{dateLabel}</Text>
            </View>
            <Pressable
              onPress={() => close(true)}
              style={[styles.closeButton, { backgroundColor: colors.surfaceElevated }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("welcome_dismiss")}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.haloWrap}>
            <LinearGradient colors={halo} style={styles.halo}>
              <View style={[styles.haloInner, { backgroundColor: colors.surface }]}>
                <SlotIcon size={36} color={accent} strokeWidth={2.2} />
              </View>
            </LinearGradient>
            <View
              style={[
                styles.sparkleBadge,
                styles.sparkleLeft,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Sparkles size={13} color={accent} />
            </View>
            <View
              style={[
                styles.sparkleBadge,
                styles.sparkleRight,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Star size={12} color={accent} />
            </View>
          </View>

          <Text style={[styles.eyebrow, { color: accent }]}>{t("welcome_back")}</Text>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {title}, {displayName}
          </Text>
          <LinearGradient colors={halo} style={styles.rule} />
          <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>

          <Pressable
            onPress={handleAction}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryStrong]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryGradient}
            >
              <ActionIcon size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.primaryButtonText}>{actionLabel}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => close(true)}
            style={styles.secondaryButton}
            hitSlop={6}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>
              {t("welcome_dismiss")}
            </Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={toggleOptOut}
            style={styles.optOutRow}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowAgain }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: dontShowAgain ? colors.primary : colors.border,
                  backgroundColor: dontShowAgain ? colors.primary : "transparent",
                },
              ]}
            >
              {dontShowAgain && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
            </View>
            <Text style={[styles.optOutLabel, { color: colors.textMuted }]}>
              {t("welcome_dont_show")}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.32,
    shadowRadius: 40,
    elevation: 20,
  },
  art: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  wash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 190,
  },
  blob: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  blobLeft: {
    top: -48,
    left: -48,
  },
  blobRight: {
    top: -34,
    right: -56,
  },
  topRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 9999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  datePillText: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  haloWrap: {
    marginTop: 18,
    marginBottom: 16,
    width: 150,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  haloInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleBadge: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleLeft: {
    left: 2,
    top: 8,
  },
  sparkleRight: {
    right: 2,
    bottom: 8,
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 8,
    fontSize: 26,
    lineHeight: 33,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
    includeFontPadding: false,
  },
  rule: {
    marginTop: 12,
    width: 52,
    height: 5,
    borderRadius: 3,
  },
  message: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 20,
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  primaryGradient: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pressed: {
    opacity: 0.88,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: "#FFFFFF",
  },
  secondaryButton: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  divider: {
    width: "100%",
    height: 1,
    opacity: 0.7,
    marginTop: 12,
    marginBottom: 14,
  },
  optOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  optOutLabel: {
    fontSize: 12.5,
    fontWeight: "600",
  },
});

export default WelcomeGreeting;