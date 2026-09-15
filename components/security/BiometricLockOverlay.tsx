import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Fingerprint, KeyRound, Lock, ScanFace, ShieldCheck } from 'lucide-react-native';
import { SpendFlowSealLogo } from '@/components/ui/SpendFlowSealLogo';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useSecurity } from '@/hooks/useSecurity';
import { useTheme } from '@/hooks/useTheme';

export function BiometricLockOverlay() {
  const { isLocked, authenticate, biometricTypeName } = useSecurity();
  const { session, lockToLogin } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Auto trigger authentication when overlay appears — but ONLY when the
  // overlay is actually visible (a live session behind it). While soft-locked
  // the login page is the gate and fires its own prompt; a stray auto-prompt
  // here would occupy the authenticator's re-entry guard and silently
  // swallow the login page's prompt.
  useEffect(() => {
    if (isLocked && session) {
      void authenticate();

      // Continuous subtle breathing animation on the lock glyph
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }
  }, [authenticate, isLocked, pulseAnim, session]);

  // The overlay gates a LIVE session. No session (soft-locked to the login
  // page, or signed out) → the login page itself is the gate; never cover it.
  if (!isLocked || !session) return null;

  const isFaceId = biometricTypeName.toLowerCase().includes('face');

  return (
    <View style={[styles.overlay, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 1.5,
            shadowColor: '#000000',
            shadowOpacity: theme.isDark ? 0.4 : 0.08,
          },
        ]}
      >
        {/* SpendFlow Seal Brand Logo */}
        <View style={{ marginBottom: 4 }}>
          <SpendFlowSealLogo size={84} isDark={theme.isDark} />
        </View>

        {/* Lock Title & Subtitle */}
        <View style={styles.textWrapper}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Lock size={19} color={theme.colors.primary} />
            <Text variant="h2" style={{ color: theme.colors.text, fontWeight: '800', letterSpacing: -0.3 }}>
              {t('security_unlock_title')}
            </Text>
          </View>
          <Text
            variant="caption"
            style={{
              color: theme.colors.textMuted,
              textAlign: 'center',
              maxWidth: 270,
              lineHeight: 18,
            }}
          >
            {t('security_unlock_subtitle')}
          </Text>
        </View>

        {/* Pulsing Biometric Sensor Trigger Button */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }], marginTop: 10 }}>
          <Pressable
            onPress={() => void authenticate()}
            style={({ pressed }) => [
              styles.unlockButton,
              {
                backgroundColor: theme.isDark
                  ? (pressed ? '#1E293B' : '#161B22')
                  : (pressed ? theme.colors.primaryStrong : theme.colors.primary),
                borderColor: theme.isDark ? theme.colors.primary : '#A8791F',
                borderWidth: 2,
                shadowColor: theme.colors.primary,
              },
            ]}
          >
            {isFaceId ? (
              <ScanFace size={40} color={theme.isDark ? theme.colors.primary : '#FFFFFF'} strokeWidth={2.2} />
            ) : (
              <Fingerprint size={40} color={theme.isDark ? theme.colors.primary : '#FFFFFF'} strokeWidth={2.2} />
            )}
          </Pressable>
        </Animated.View>

        <Pressable
          onPress={() => void authenticate()}
          hitSlop={12}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}
        >
          <ShieldCheck size={15} color={theme.colors.primary} />
          <Text variant="label" style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 13 }}>
            {t('security_unlock_btn')} ({biometricTypeName})
          </Text>
        </Pressable>
      </View>

      {/* Footer: Fall back to the login page — the session stays remembered
          on this device, so biometric quick login is offered there too. */}
      <View style={styles.footer}>
        <Pressable
          onPress={() => void lockToLogin()}
          hitSlop={14}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <KeyRound size={14} color={theme.colors.textMuted} />
          <Text variant="caption" style={{ color: theme.colors.textMuted, fontWeight: '600' }}>
            {t('security_use_password')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...(StyleSheet.absoluteFill as any),
    zIndex: 99999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 24,
    gap: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
  },
  textWrapper: {
    alignItems: 'center',
    gap: 6,
  },
  unlockButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 42,
    alignItems: 'center',
  },
});
