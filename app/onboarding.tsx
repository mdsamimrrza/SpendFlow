import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarChart3, Check, ShieldCheck, Target, Wallet } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SpendFlowSealLogo } from '@/components/ui/SpendFlowSealLogo';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { useOnboarding } from '@/store/OnboardingContext';

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { completeOnboarding } = useOnboarding();

  async function finish() {
    await completeOnboarding();
    router.replace(session ? '/(tabs)' : '/(auth)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: theme.spacing.xl,
          paddingTop: 48,
          paddingBottom: 48,
          gap: theme.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Controls Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: theme.colors.surfaceElevated,
              borderRadius: theme.radius.full,
              padding: 3,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Pressable
              onPress={() => setLanguage('en')}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: theme.radius.full,
                backgroundColor: language === 'en' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'en' ? '#FFFFFF' : theme.colors.textMuted }}>
                🇺🇸 EN
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLanguage('hi')}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: theme.radius.full,
                backgroundColor: language === 'hi' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'hi' ? '#FFFFFF' : theme.colors.textMuted }}>
                🇮🇳 HI
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLanguage('ne')}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: theme.radius.full,
                backgroundColor: language === 'ne' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'ne' ? '#FFFFFF' : theme.colors.textMuted }}>
                🇳🇵 NE
              </Text>
            </Pressable>
          </View>

          <ThemeToggle />
        </View>

        {/* Hero Section with SpendFlow Seal */}
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <SpendFlowSealLogo size={84} isDark={theme.isDark} />

          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text variant="h1" style={{ fontSize: 30, lineHeight: 36, textAlign: 'center', fontWeight: '800' }}>
              {t('onboarding_welcome')}
            </Text>
            <Text muted style={{ textAlign: 'center', fontSize: 14, lineHeight: 20, maxWidth: 300 }}>
              {t('onboarding_tagline')}
            </Text>
          </View>
        </View>

        {/* 1. UPFRONT 3-WAY LANGUAGE PICKER CARD */}
        <Card style={{ padding: theme.spacing.lg, gap: theme.spacing.md, borderColor: theme.colors.primary, borderWidth: 1.5 }}>
          <View style={{ gap: 4 }}>
            <Text variant="label" style={{ fontWeight: '700', fontSize: 15 }}>
              🌐 {t('onboarding_select_lang')}
            </Text>
            <Text variant="caption" muted>
              Choose your preferred language / भाषा छान्नुहोस्
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            {/* English Option */}
            <Pressable
              onPress={() => setLanguage('en')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: theme.radius.md,
                backgroundColor: language === 'en' ? (theme.isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF') : theme.colors.surfaceElevated,
                borderWidth: 1.5,
                borderColor: language === 'en' ? theme.colors.primary : theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>🇺🇸</Text>
                <View>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: theme.colors.text }}>English</Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>International standard</Text>
                </View>
              </View>
              {language === 'en' && <Check size={18} color={theme.colors.primary} />}
            </Pressable>

            {/* Hindi Option */}
            <Pressable
              onPress={() => setLanguage('hi')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: theme.radius.md,
                backgroundColor: language === 'hi' ? (theme.isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF') : theme.colors.surfaceElevated,
                borderWidth: 1.5,
                borderColor: language === 'hi' ? theme.colors.primary : theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>🇮🇳</Text>
                <View>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: theme.colors.text }}>हिंदी (Hindi)</Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>भारतीय रुपया (₹) और हिंदी इंटरफ़ेस</Text>
                </View>
              </View>
              {language === 'hi' && <Check size={18} color={theme.colors.primary} />}
            </Pressable>

            {/* Nepali Option */}
            <Pressable
              onPress={() => setLanguage('ne')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: theme.radius.md,
                backgroundColor: language === 'ne' ? (theme.isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF') : theme.colors.surfaceElevated,
                borderWidth: 1.5,
                borderColor: language === 'ne' ? theme.colors.primary : theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>🇳🇵</Text>
                <View>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: theme.colors.text }}>नेपाली (Nepali)</Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>नेपाली रुपैयाँ (रू) र स्थानीय भाषा</Text>
                </View>
              </View>
              {language === 'ne' && <Check size={18} color={theme.colors.primary} />}
            </Pressable>
          </View>
        </Card>

        {/* 2. VALUE PROPOSITION FEATURE CARDS */}
        <View style={{ gap: theme.spacing.md }}>
          {/* Feature 1 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.sm }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={22} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ fontWeight: '700' }}>
                {t('onboarding_feature_offline')}
              </Text>
              <Text variant="caption" muted numberOfLines={2}>
                {t('onboarding_feature_offline_sub')}
              </Text>
            </View>
          </View>

          {/* Feature 2 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.sm }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <Target size={22} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ fontWeight: '700' }}>
                {t('onboarding_feature_budget')}
              </Text>
              <Text variant="caption" muted numberOfLines={2}>
                {t('onboarding_feature_budget_sub')}
              </Text>
            </View>
          </View>

          {/* Feature 3 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.sm }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <BarChart3 size={22} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ fontWeight: '700' }}>
                {t('onboarding_feature_analytics')}
              </Text>
              <Text variant="caption" muted numberOfLines={2}>
                {t('onboarding_feature_analytics_sub')}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. GET STARTED ACTION BUTTON */}
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          <Button
            title={t('onboarding_get_started')}
            onPress={finish}
            style={{ height: 52, borderRadius: theme.radius.md }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
            <ShieldCheck size={14} color={theme.colors.success} />
            <Text variant="caption" muted style={{ fontSize: 12 }}>
              {t('settings_cloud_synced')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
