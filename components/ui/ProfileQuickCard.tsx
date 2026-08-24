import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  BarChart3,
  Download,
  Fingerprint,
  Globe,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Target,
  Wallet,
  X,
} from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
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
  const theme = useTheme();
  const router = useRouter();

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.cardContainer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Close Button */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={16} color={theme.colors.primary} />
              <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Account Profile
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {/* User Info Section */}
          <View style={styles.profileHero}>
            <View style={{ position: 'relative' }}>
              <Avatar uri={profile?.avatar_url} name={displayName} size={54} />
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: theme.colors.success,
                  borderWidth: 2,
                  borderColor: theme.colors.surface,
                }}
              />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h2" numberOfLines={1}>
                {displayName}
              </Text>
              <Text variant="caption" muted numberOfLines={1}>
                {profile?.email}
              </Text>
            </View>
          </View>

          {/* Key Quick Metrics Strip */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={[styles.statBox, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="caption" muted style={{ fontSize: 10 }}>
                CURRENCY
              </Text>
              <Text variant="label" style={{ fontWeight: '800' }}>
                {currency}
              </Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="caption" muted style={{ fontSize: 10 }}>
                TARGET BUDGET
              </Text>
              <Text variant="label" style={{ fontWeight: '800' }} numberOfLines={1}>
                {monthlyBudget > 0 ? formatMoney(monthlyBudget, currency) : 'No Limit'}
              </Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="caption" muted style={{ fontSize: 10 }}>
                APP LOCK
              </Text>
              <Text
                variant="label"
                style={{
                  fontWeight: '800',
                  color: isBiometricEnabled ? theme.colors.success : theme.colors.textMuted,
                  fontSize: 11,
                }}
                numberOfLines={1}
              >
                {isBiometricEnabled ? biometricTypeName : 'Disabled'}
              </Text>
            </View>
          </View>

          {/* Navigation Action Buttons */}
          <View style={{ gap: 6 }}>
            <Pressable
              onPress={() => handleNavigate('/(tabs)/settings')}
              style={[styles.menuItem, { backgroundColor: theme.colors.surfaceElevated }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Settings size={18} color={theme.colors.primary} />
                <Text variant="label" style={{ fontWeight: '600' }}>
                  {t('settings_title')} & Preferences
                </Text>
              </View>
              <ArrowRight size={14} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => handleNavigate('/(tabs)/analytics')}
              style={[styles.menuItem, { backgroundColor: theme.colors.surfaceElevated }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <BarChart3 size={18} color="#10B981" />
                <Text variant="label" style={{ fontWeight: '600' }}>
                  {t('tab_analytics')} & Reports
                </Text>
              </View>
              <ArrowRight size={14} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => handleNavigate('/export')}
              style={[styles.menuItem, { backgroundColor: theme.colors.surfaceElevated }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Download size={18} color="#F59E0B" />
                <Text variant="label" style={{ fontWeight: '600' }}>
                  {t('settings_export_excel')} & CSV
                </Text>
              </View>
              <ArrowRight size={14} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {/* Footer Action: Sign Out */}
          <View style={{ paddingTop: 4 }}>
            <Button
              title={t('settings_sign_out')}
              variant="secondary"
              icon={LogOut}
              onPress={() => {
                onClose();
                setTimeout(() => void signOut(), 200);
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
});
