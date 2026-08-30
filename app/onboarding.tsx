import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowRight, Coins, ShieldCheck, Target, Wallet } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { SpendFlowSealLogo } from '@/components/ui/SpendFlowSealLogo';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { useOnboarding } from '@/store/OnboardingContext';

const LANGS: { key: 'en' | 'hi' | 'ne'; flag: string; label: string }[] = [
  { key: 'en', flag: '🇺🇸', label: 'EN' },
  { key: 'hi', flag: '🇮🇳', label: 'HI' },
  { key: 'ne', flag: '🇳🇵', label: 'NE' },
];


export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { completeOnboarding } = useOnboarding();

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Feature rows built with translated strings
  const features = [
    { icon: Wallet, title: t('onboarding_feature_offline'),   sub: t('onboarding_feature_offline_sub')   },
    { icon: Target, title: t('onboarding_feature_budget'),    sub: t('onboarding_feature_budget_sub')    },
    { icon: Coins,  title: t('onboarding_feature_analytics'), sub: t('onboarding_feature_analytics_sub') },
  ];

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 2200, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  function handleLanguageSelect(lang: 'en' | 'hi' | 'ne') {
    void Haptics.selectionAsync();
    setLanguage(lang);
  }

  async function finish() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await completeOnboarding();
    router.replace(session ? '/(tabs)' : '/(auth)');
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingHorizontal: 22,
        paddingTop: 16,
        paddingBottom: 36,
        justifyContent: 'space-between',
      }}
    >
      {/* ── Top bar: language pill + theme toggle ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Compact language pill */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: 99,
            padding: 3,
            borderWidth: 1,
            borderColor: theme.colors.border,
            gap: 2,
          }}
        >
          {LANGS.map(({ key, flag, label }) => (
            <Pressable
              key={key}
              onPress={() => handleLanguageSelect(key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 11,
                paddingVertical: 6,
                borderRadius: 99,
                backgroundColor: language === key ? theme.colors.primary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13 }}>{flag}</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: language === key ? '#FFFFFF' : theme.colors.textMuted }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ThemeToggle />
      </View>

      {/* ── Hero ── */}
      <View style={{ alignItems: 'center', gap: 14, marginTop: 8 }}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <SpendFlowSealLogo size={84} isDark={theme.isDark} />
        </Animated.View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 30, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.6, textAlign: 'center' }}>
            {t('onboarding_welcome')}
          </Text>
          <Text style={{ fontSize: 14, color: theme.colors.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
            {t('onboarding_tagline')}
          </Text>
        </View>
      </View>

      {/* ── Feature strip ── */}
      <View style={{ gap: 8 }}>
        {features.map(({ icon: Icon, title, sub }) => (
          <View
            key={title}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 11,
              borderRadius: 14,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: theme.isDark ? 'rgba(52,211,153,0.12)' : theme.colors.primaryLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 13, color: theme.colors.text }}>
                {title}
              </Text>
              <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 15, marginTop: 1 }} numberOfLines={1}>
                {sub}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── CTA ── */}
      <View style={{ gap: 10, marginTop: 4 }}>
        <Button
          title={t('onboarding_get_started')}
          onPress={finish}
          icon={ArrowRight}
          style={{
            height: 52,
            borderRadius: 16,
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 4,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <ShieldCheck size={13} color={theme.colors.primary} />
          <Text style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' }}>
            {t('settings_cloud_synced')}
          </Text>
        </View>
      </View>
    </View>
  );
}
