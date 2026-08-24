import React from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarChart3, Check, CloudLightning, ShieldCheck, Sparkles, Target, Wallet } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
          padding: theme.spacing.xl,
          paddingTop: 48,
          paddingBottom: 48,
          gap: theme.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header with Theme Toggle */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary }} />
            <Text variant="caption" muted style={{ fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
              SpendFlow
            </Text>
          </View>
          <ThemeToggle />
        </View>

        {/* Brand Hero */}
        <View style={{ alignItems: 'center', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 24,
              backgroundColor: theme.isDark ? '#141E33' : '#EEF2FF',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: theme.colors.primary,
              shadowColor: theme.colors.primary,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 8,
              overflow: 'hidden',
            }}
          >
            <Image
              source={require('@/assets/icon.png')}
              style={{ width: 88, height: 88 }}
              resizeMode="cover"
            />
          </View>

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
              {t('onboarding_select_lang_sub')}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {/* English Tile */}
            <Pressable
              onPress={() => setLanguage('en')}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: 6,
                borderRadius: theme.radius.md,
                borderWidth: 2,
                borderColor: language === 'en' ? theme.colors.primary : theme.colors.border,
                backgroundColor: language === 'en' ? (theme.isDark ? 'rgba(129, 140, 248, 0.18)' : 'rgba(79, 70, 229, 0.10)') : theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                position: 'relative',
              }}
            >
              {language === 'en' ? (
                <View style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={10} color="#FFFFFF" strokeWidth={3} />
                </View>
              ) : null}
              <Text style={{ fontSize: 22 }}>🇺🇸</Text>
              <Text variant="caption" style={{ fontWeight: '700', color: language === 'en' ? theme.colors.primary : theme.colors.text }}>
                English
              </Text>
            </Pressable>

            {/* Hindi Tile */}
            <Pressable
              onPress={() => setLanguage('hi')}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: 6,
                borderRadius: theme.radius.md,
                borderWidth: 2,
                borderColor: language === 'hi' ? theme.colors.primary : theme.colors.border,
                backgroundColor: language === 'hi' ? (theme.isDark ? 'rgba(129, 140, 248, 0.18)' : 'rgba(79, 70, 229, 0.10)') : theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                position: 'relative',
              }}
            >
              {language === 'hi' ? (
                <View style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={10} color="#FFFFFF" strokeWidth={3} />
                </View>
              ) : null}
              <Text style={{ fontSize: 22 }}>🇮🇳</Text>
              <Text variant="caption" style={{ fontWeight: '700', color: language === 'hi' ? theme.colors.primary : theme.colors.text }}>
                हिंदी
              </Text>
            </Pressable>

            {/* Nepali Tile */}
            <Pressable
              onPress={() => setLanguage('ne')}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: 6,
                borderRadius: theme.radius.md,
                borderWidth: 2,
                borderColor: language === 'ne' ? theme.colors.primary : theme.colors.border,
                backgroundColor: language === 'ne' ? (theme.isDark ? 'rgba(129, 140, 248, 0.18)' : 'rgba(79, 70, 229, 0.10)') : theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                position: 'relative',
              }}
            >
              {language === 'ne' ? (
                <View style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={10} color="#FFFFFF" strokeWidth={3} />
                </View>
              ) : null}
              <Text style={{ fontSize: 22 }}>🇳🇵</Text>
              <Text variant="caption" style={{ fontWeight: '700', color: language === 'ne' ? theme.colors.primary : theme.colors.text }}>
                नेपाली
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* 2. THREE KEY PRODUCT HIGHLIGHTS */}
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.isDark ? '#1E293B' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
              <CloudLightning size={22} color={theme.colors.primary} />
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.isDark ? '#1E293B' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.isDark ? '#1E293B' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
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
