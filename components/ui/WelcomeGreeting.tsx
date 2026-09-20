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
import { ArrowRight, Check, Moon, Plus, Sun, X } from "lucide-react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";

const STORAGE_KEY = "@spendflow_welcome_greeting";

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

  const slot = useMemo(() => getSlot(new Date().getHours()), []);
  const userId = profile?.id ?? session?.user?.id ?? "";
  const storageKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;

  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const shownRef = useRef(false);

  const rawName =
    profile?.display_name?.trim() ||
    profile?.email?.split("@")[0]?.trim() ||
    "friend";
  const displayName = capitalize(rawName);

  const isMorning = slot === "morning";

  const accent = isMorning ? (isDark ? "#FBBF24" : "#B45309") : isDark ? "#A5B4FC" : "#4F46E5";
  const accentSoft = isMorning
    ? isDark
      ? "rgba(251, 191, 36, 0.14)"
      : "rgba(180, 83, 9, 0.10)"
    : isDark
      ? "rgba(165, 180, 252, 0.14)"
      : "rgba(79, 70, 229, 0.10)";
  const topBar: [string, string] = isMorning
    ? ["#FCD34D", "#F59E0B"]
    : ["#818CF8", "#7C3AED"];

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
    if (!slot) return;
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
    scale.setValue(0.92);
    translateY.setValue(20);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.back(1.15)),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
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
          toValue: 0.95,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVisible(false);
        onClose?.();
      });
    },
    [onClose, opacity, persistClose, scale],
  );

  useEffect(() => {
    if (!slot || shownRef.current) return;
    shownRef.current = true;
    let cancelled = false;
    (async () => {
      const stored = await readStored();
      if (cancelled) return;
      if (stored.dontShowAgain) return;
      if (stored[slot] === todayKey()) return;
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
          <LinearGradient
            colors={topBar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topBar}
          />

          <View style={styles.content}>
            <View style={styles.headerRow}>
              <View style={[styles.iconChip, { backgroundColor: accentSoft }]}>
                <SlotIcon size={15} color={accent} strokeWidth={2.4} />
              </View>
              <Text style={[styles.dateLabel, { color: colors.faint }]} numberOfLines={1}>
                {dateLabel}
              </Text>
              <View style={styles.headerSpacer} />
              <Pressable
                onPress={() => close(true)}
                style={[styles.closeButton, { backgroundColor: colors.surfaceElevated }]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t("welcome_dismiss")}
              >
                <X size={15} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.eyebrow, { color: accent }]}>{t("welcome_back")}</Text>
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {title},{"\n"}
              <Text style={{ color: accent }}>{displayName}</Text>
            </Text>
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
                <ActionIcon size={17} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.primaryButtonText}>{actionLabel}</Text>
              </LinearGradient>
            </Pressable>

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
                {dontShowAgain && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
              </View>
              <Text style={[styles.optOutLabel, { color: colors.faint }]}>
                {t("welcome_dont_show")}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
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
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 36,
    elevation: 20,
  },
  topBar: {
    height: 4,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 22,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dateLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  headerSpacer: {
    flex: 1,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    marginTop: 22,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  message: {
    marginTop: 10,
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: "500",
  },
  primaryButton: {
    marginTop: 22,
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryGradient: {
    paddingVertical: 15,
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
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: "#FFFFFF",
  },
  optOutRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 6,
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