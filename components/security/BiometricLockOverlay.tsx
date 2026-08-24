import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { Fingerprint, Lock, LogOut, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useSecurity } from '@/hooks/useSecurity';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui/Text';

export function BiometricLockOverlay() {
  const { isLocked, authenticate, biometricTypeName } = useSecurity();
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Auto trigger authentication when overlay appears
  useEffect(() => {
    if (isLocked) {
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
  }, [authenticate, isLocked, pulseAnim]);

  if (!isLocked) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: '#0B0F19' }]}>
      <View style={styles.content}>
        {/* App Logo */}
        <View style={styles.logoWrapper}>
          <Image source={require('@/assets/icon.png')} style={styles.logo} resizeMode="cover" />
        </View>

        {/* Lock Title & Subtitle */}
        <View style={styles.textWrapper}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Lock size={22} color="#818CF8" />
            <Text variant="h2" style={{ color: '#F8FAFC', fontWeight: '800' }}>
              {t('security_unlock_title')}
            </Text>
          </View>
          <Text variant="caption" style={{ color: '#94A3B8', textAlign: 'center', maxWidth: 280 }}>
            {t('security_unlock_subtitle')}
          </Text>
        </View>

        {/* Pulsing Fingerprint Trigger Button */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }], marginTop: 12 }}>
          <Pressable
            onPress={() => void authenticate()}
            style={({ pressed }) => [
              styles.unlockButton,
              {
                backgroundColor: pressed ? '#4338CA' : '#4F46E5',
                shadowColor: '#6366F1',
              },
            ]}
          >
            <Fingerprint size={42} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
        </Animated.View>

        <Pressable onPress={() => void authenticate()} hitSlop={12} style={{ marginTop: 8 }}>
          <Text variant="label" style={{ color: '#A5B4FC', fontWeight: '700' }}>
            {t('security_unlock_btn')} ({biometricTypeName})
          </Text>
        </Pressable>
      </View>

      {/* Footer: Fallback Sign Out */}
      <View style={styles.footer}>
        <Pressable
          onPress={() => void signOut()}
          hitSlop={12}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.8 }}
        >
          <LogOut size={15} color="#94A3B8" />
          <Text variant="caption" style={{ color: '#94A3B8' }}>
            {t('settings_sign_out')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  logoWrapper: {
    width: 88,
    height: 88,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(129, 140, 248, 0.4)',
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
    marginBottom: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  textWrapper: {
    alignItems: 'center',
    gap: 6,
  },
  unlockButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    alignItems: 'center',
  },
});
