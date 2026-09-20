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

const STARS: { top: number; left: `${number}%`; size: number; alpha: number }[] = [
  { top: 26, left: "12%", size: 3, alpha: 0.8 },
  { top: 52, left: "80%", size: 4, alpha: 0.55 },
  { top: 98, left: "9%", size: 2.5, alpha: 0.5 },
  { top: 34, left: "90%", size: 2.5, alpha: 0.65 },
  { top: 112, left: "82%", size: 3, alpha: 0.45 },
  { top: 72, left: "38%", size: 2, alpha: 0.5 },
];

interface WelcomeGreetingProps {
  onClose?: () => void;
}

export function WelcomeGreeting({ onClose }: WelcomeGreetingProps) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile, session } = useAuth();
  const router = useRouter();

  const slot = useMemo(() => getSlot(new Date().getHours()), []);
  const userId = profile?.id ?? session?.user?.id ?? "";
  const storageKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;

  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const glowPulse = useRef(new Animated.Value(0.35)).current;

  const rawName =
    profile?.display_name?.trim() ||
    profile?.email?.split("@")[0]?.trim() ||
    "friend";
  const displayName = capitalize(rawName);

  const isMorning = slot === "morning";

  const heroColors: [string, string, string] = isMorning
    ? ["#FCD34D", "#F59E0B", "#EA580C"]
    : ["#312E81", "#4C1D95", "#7C3AED"];

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
        onClose?.();
      });
    },
    [onClose, opacity, persistClose, scale],
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.85,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.35,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glowPulse]);

  useEffect(() => {
    if (!slot) return;
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
              borderColor: colors.border,
              opacity,
              transform: [{ translateY }, { scale }],
            },
          ]}
        >
          <LinearGradient
            colors={heroColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.hero}
          >
            {!isMorning &&
              STARS.map((s, i) => (
                <View
                  key={i}
                  style={[
                    styles.star,
                    { top: s.top, left: s.left, width: s.size, height: s.size, opacity: s.alpha },
                  ]}
                />
              ))}

            <View style={styles.iconWrap}>
              <Animated.View style={[styles.glow, { opacity: glowPulse }]} />
              <View style={styles.iconRing}>
                <View style={styles.iconCore}>
                  <SlotIcon size={34} color="#FFFFFF" strokeWidth={2} />
                </View>
              </View>
            </View>

            <Text style={styles.heroEyebrow}>{t("welcome_back")}</Text>
            <Text
              style={styles.heroTitle}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {title}, {displayName}
            </Text>
            {dateLabel !== "" && <Text style={styles.heroDate}>{dateLabel}</Text>}

            <Pressable
              onPress={() => close(true)}
              style={styles.closeButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("welcome_dismiss")}
            >
              <X size={15} color="#FFFFFF" />
            </Pressable>
          </LinearGradient>

          <View style={[styles.body, { backgroundColor: colors.surface }]}>
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
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
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
    borderRadius: 30,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.35,
    shadowRadius: 48,
    elevation: 24,
  },
  hero: {
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: "center",
    overflow: "hidden",
  },
  star: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  closeButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  iconWrap: {
    width: 116,
    height: 116,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.4)",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCore: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255, 255, 255, 0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: {
    marginTop: 12,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.8)",
  },
  heroTitle: {
    marginTop: 5,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
    color: "#FFFFFF",
    includeFontPadding: false,
    paddingHorizontal: 20,
  },
  heroDate: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.78)",
    letterSpacing: 0.3,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: "center",
  },
  message: {
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: "500",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 18,
    width: "100%",
    borderRadius: 16,
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
  secondaryButton: {
    marginTop: 4,
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
    marginTop: 8,
    marginBottom: 12,
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
