"use client";

import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing } from "react-native";
import { Sun, Moon, X, Sparkles, CheckCircle2 } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@spendflow_welcome_greeting";

interface WelcomeGreetingProps {
  onClose?: () => void;
}

export function WelcomeGreeting({ onClose }: WelcomeGreetingProps) {
  const { isDark, colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [anim, setAnim] = useState({ 
    opacity: new Animated.Value(0), 
    translateY: new Animated.Value(50),
    scale: new Animated.Value(0.9)
  });

  const displayName = profile?.display_name || profile?.email?.split("@")[0] || "there";
  const currentHour = new Date().getHours();
  
  // Determine greeting period
  const isMorning = currentHour >= 5 && currentHour < 12;
  const isEvening = currentHour >= 17 && currentHour < 22;
  const shouldShow = isMorning || isEvening;

  const greetingData = isMorning ? {
    icon: Sun,
    iconBg: "rgba(245, 158, 11, 0.15)",
    iconColor: "#F59E0B",
    title: t("welcome_morning_title") || "Good Morning! ☀️",
    message: t("welcome_morning_message") || "Start your day by tracking every rupee. Small habits build big wealth.",
    actionLabel: t("welcome_morning_action") || "Add First Expense",
  } : {
    icon: Moon,
    iconBg: "rgba(129, 140, 248, 0.15)",
    iconColor: "#818CF8",
    title: t("welcome_evening_title") || "Good Evening! 🌙",
    message: t("welcome_evening_message") || "How did your spending go today? Log any missing expenses before you relax.",
    actionLabel: t("welcome_evening_action") || "Review Today",
  };

  useEffect(() => {
    if (!shouldShow) {
      if (onClose) onClose();
      return;
    }

    // Check if user dismissed for today
    const checkDismissed = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          const today = new Date().toISOString().split("T")[0];
          // Check if dismissed for this period today
          if (data.dismissed === today && data.period === (isMorning ? "morning" : "evening")) {
            if (onClose) onClose();
            return;
          }
          // Check global don't show again
          if (data.dontShowAgain) {
            if (onClose) onClose();
            return;
          }
        }
        setVisible(true);
        // Auto-hide after 15 seconds
        setTimeout(() => {
          if (visible) handleClose(false);
        }, 15000);
      } catch {
        setVisible(true);
      }
    };
    checkDismissed();
  }, [shouldShow, isMorning, visible, onClose]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(anim.opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(anim.translateY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(anim.scale, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = async (setDismissed: boolean) => {
    Animated.parallel([
      Animated.timing(anim.opacity, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(anim.translateY, { toValue: -50, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(anim.scale, { toValue: 0.9, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      if (onClose) onClose();
    });

    if (setDismissed) {
      try {
        const today = new Date().toISOString().split("T")[0];
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
          dismissed: today,
          period: isMorning ? "morning" : "evening",
          dontShowAgain,
        }));
      } catch {}
    }
  };

  if (!visible || !shouldShow) return null;

  return (
    <Animated.View
style={[
          styles.overlay,
          { backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)" }
        ]}
    >
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: colors.surface },
          {
            opacity: anim.opacity,
            transform: [
              { translateY: anim.translateY },
              { scale: anim.scale },
            ],
          },
        ]}
      >
        {/* Header with icon */}
        <View style={styles.header}>
          <Animated.View
            style={[
              styles.iconWrapper,
              { backgroundColor: greetingData.iconBg },
            ]}
          >
            <greetingData.icon size={28} color={greetingData.iconColor} />
          </Animated.View>
          
          <Pressable
            onPress={() => handleClose(false)}
            style={styles.closeButton}
            hitSlop={12}
          >
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Greeting content */}
        <View style={styles.content}>
          <Text style={[
            styles.greeting,
            { color: colors.text },
          ]}>
            {greetingData.title}
          </Text>
          
          <Text style={[
            styles.message,
            { color: colors.textMuted },
          ]}>
            {displayName.charAt(0).toUpperCase() + displayName.slice(1)}, {greetingData.message}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              handleClose(false);
              // Navigate based on action
            }}
            style={[
              styles.primaryAction,
              { backgroundColor: colors.primary },
            ]}
          >
            <Sparkles size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.actionText}>{greetingData.actionLabel}</Text>
          </Pressable>

          <Pressable
            onPress={() => handleClose(true)}
            style={styles.secondaryAction}
          >
            <Text style={[
              styles.secondaryActionText,
              { color: colors.textMuted },
            ]}>
              {t("welcome_dismiss") || "Not now"}
            </Text>
          </Pressable>
        </View>

        {/* Don't show again checkbox */}
        <Pressable
          onPress={() => setDontShowAgain(!dontShowAgain)}
          style={styles.checkboxWrapper}
        >
          <Animated.View
            style={[
              styles.checkbox,
              { 
                backgroundColor: dontShowAgain ? colors.primary : "transparent",
                borderColor: dontShowAgain ? colors.primary : colors.border,
              },
            ]}
          >
            {dontShowAgain && <CheckCircle2 size={16} color="#FFFFFF" />}
          </Animated.View>
          <Text style={[
            styles.checkboxLabel,
            { color: colors.textMuted },
          ]}>
            {t("welcome_dont_show") || "Don't show this again"}
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 1000,
  },
  container: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    gap: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    gap: 8,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  primaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryAction: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  checkboxWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
});

export default WelcomeGreeting;