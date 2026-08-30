import React, { useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  Download,
  Fingerprint,
  Globe,
  Layers,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Wallet,
  X,
} from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useSecurity } from '@/hooks/useSecurity';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/format';

interface ProfileQuickCardProps {
  visible: boolean;
  onClose: () => void;
}

export function ProfileQuickCard({ visible, onClose }: ProfileQuickCardProps) {
  const { profile, signOut } = useAuth();
  const { isBiometricEnabled, biometricTypeName } = useSecurity();
  const { language, setLanguage, t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const theme = useTheme();
  const router = useRouter();

  // Animation values
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    if (visible) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      translateYAnim.setValue(40);
    }
  }, [visible]);

  // Swipe Down to Dismiss PanResponder Gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 10 && Math.abs(gestureState.dx) < 20;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 90 || gestureState.vy > 0.6) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          Animated.timing(translateYAnim, {
            toValue: 300,
            duration: 180,
            useNativeDriver: true,
          }).start(() => onClose());
        } else {
          Animated.spring(translateYAnim, {
            toValue: 0,
            friction: 7,
            tension: 50,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  if (!visible) return null;

  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'SpendFlow User';
  const currency = profile?.preferred_currency ?? 'NPR';
  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;

  function handleNavigate(path: string) {
    onClose();
    setTimeout(() => {
      router.push(path as any);
    }, 150);
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.cardContainer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
            },
          ]}
        >
          {/* Drag Indicator Pill */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: -4 }} />

          {/* ── 1. HEADER ROW ── */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={18} color={theme.colors.primary} />
              </View>
              <View>
                <Text variant="label" style={{ color: theme.colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
                  SpendFlow Profile
                </Text>
                <Text variant="caption" muted style={{ fontSize: 10 }}>
                  Account & Security Hub
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <X size={18} color={theme.colors.text} />
            </Pressable>
          </View>

          {/* ── 2. HERO PROFILE BANNER ── */}
          <View
            style={[
              styles.profileHeroBanner,
              {
                backgroundColor: theme.isDark ? '#111827' : theme.colors.cardHighlight,
                borderColor: theme.colors.primary,
              },
            ]}
          >
            <View style={{ position: 'relative' }}>
              <Avatar uri={profile?.avatar_url} name={displayName} size={66} />
              <View
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: theme.colors.success,
                  borderWidth: 3,
                  borderColor: theme.colors.surface,
                }}
              />
            </View>

            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="h2" style={{ fontSize: 20, fontWeight: '900' }} numberOfLines={1}>
                {displayName}
              </Text>
              <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 12 }}>
                {profile?.email}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <ShieldCheck size={13} color={theme.colors.success} />
                <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '700', fontSize: 11 }}>
                  Verified Cloud Account
                </Text>
              </View>
            </View>
          </View>

          {/* ── 3. KEY METRICS MATRIX ── */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={[styles.statBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
              <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Currency
              </Text>
              <Text variant="label" style={{ fontWeight: '900', fontSize: 16, color: theme.colors.primary, marginTop: 2 }}>
                {currency}
              </Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
              <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Target Limit
              </Text>
              <Text variant="label" style={{ fontWeight: '900', fontSize: 14, color: theme.colors.text, marginTop: 2 }} numberOfLines={1}>
                {monthlyBudget > 0 ? formatMoney(monthlyBudget, currency) : 'No Limit'}
              </Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
              <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                App Lock
              </Text>
              <Text
                variant="label"
                style={{
                  fontWeight: '900',
                  color: isBiometricEnabled ? theme.colors.success : theme.colors.textMuted,
                  fontSize: 13,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {isBiometricEnabled ? biometricTypeName : 'Off'}
              </Text>
            </View>
          </View>

          {/* ── 4. EXECUTIVE NAVIGATION ACTION MENU ── */}
          <View style={{ gap: 8 }}>
            <Pressable
              onPress={() => handleNavigate('/(tabs)/settings')}
              style={({ pressed }) => [
                styles.menuItem,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Settings size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.text }}>
                    {t('settings_title') || 'Settings'} & Preferences
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Currency, Theme, Security & Language
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => handleNavigate('/(tabs)/analytics')}
              style={({ pressed }) => [
                styles.menuItem,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BarChart3 size={18} color="#10B981" />
                </View>
                <View>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.text }}>
                    {t('tab_analytics') || 'Analytics'} & Diagnostics
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Health Score, Trends & Categories
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => handleNavigate('/export')}
              style={({ pressed }) => [
                styles.menuItem,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Download size={18} color="#F59E0B" />
                </View>
                <View>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.text }}>
                    Export Statement Hub
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Download PDF, Excel & CSV
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {/* ── 5. LOG OUT BUTTON ── */}
          <View style={{ paddingTop: 4 }}>
            <Button
              title={t('settings_sign_out') || 'Sign Out'}
              variant="secondary"
              icon={LogOut}
              onPress={() => {
                onClose();
                setTimeout(() => void signOut(), 200);
              }}
              style={{ height: 46 }}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 22,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileHeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  statBox: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
});
