import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ArrowRight, Coins, Globe2, ShieldCheck, Target, Wallet, MapPin } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { SpendFlowSealLogo } from '@/components/ui/SpendFlowSealLogo';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ONBOARDING_CURRENCY_KEY } from '@/constants/app';
import { WIZARD_COUNTRIES } from '@/constants/countries';
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
  const { height } = useWindowDimensions();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [selectedCurrency, setSelectedCurrency] = useState('NPR');

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

  async function handleLanguageSelect(lang: 'en' | 'hi' | 'ne') {
    void Haptics.selectionAsync();
    await setLanguage(lang);
  }

  function handleCountrySelect(currency: string) {
    void Haptics.selectionAsync();
    setSelectedCurrency(currency);
  }

  async function finish() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem(ONBOARDING_CURRENCY_KEY, selectedCurrency).catch(() => {});
    await completeOnboarding();
    router.replace(session ? '/(tabs)' : '/(auth)');
  }

  // Compact sizing — always single-page, no ScrollView needed
  const isCompact = height < 400;
  const padH = isCompact ? 14 : 16;
  const padT = isCompact ? 8 : 12;
  const padB = isCompact ? 10 : 14;
  const logoSize = isCompact ? 52 : 60;
  const titleSize = isCompact ? 20 : 24;
  const tagSize = isCompact ? 11 : 12;
  const sectionGap = isCompact ? 8 : 12;
  const chipPadH = isCompact ? 10 : 12;
  const chipPadV = isCompact ? 8 : 10;
  const chipFont = isCompact ? 10.5 : 11.5;
  const featFont = isCompact ? 10.5 : 11.5;

  const selectedCountry = WIZARD_COUNTRIES.find(c => c.currency === selectedCurrency);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingHorizontal: padH,
        paddingTop: padT,
        paddingBottom: padB,
        justifyContent: 'space-between',
      }}
    >
      {/* ── Top bar ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: 99,
            padding: 2,
            borderWidth: 1,
            borderColor: theme.colors.border,
            gap: 1,
          }}
        >
          {LANGS.map(({ key, flag, label }) => (
            <Pressable
              key={key}
              onPress={() => handleLanguageSelect(key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: isCompact ? 8 : 10,
                paddingVertical: isCompact ? 4 : 5,
                borderRadius: 99,
                backgroundColor: language === key ? theme.colors.primary : 'transparent',
                minWidth: isCompact ? 40 : 44,
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: isCompact ? 10 : 11 }}>{flag}</Text>
              <Text style={{ fontSize: isCompact ? 10 : 11, fontWeight: '800', color: language === key ? '#FFFFFF' : theme.colors.textMuted }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ThemeToggle style={{ width: isCompact ? 30 : 36, height: isCompact ? 30 : 36 }} />
      </View>

      {/* ── Hero ── */}
      <View style={{ alignItems: 'center', gap: isCompact ? 4 : 6, marginTop: isCompact ? 2 : 4 }}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <SpendFlowSealLogo size={logoSize} isDark={theme.isDark} />
        </Animated.View>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: titleSize, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5, textAlign: 'center' }}>
            {t('onboarding_welcome')}
          </Text>
          <Text style={{ fontSize: tagSize, color: theme.colors.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 14, maxWidth: 240 }}>
            {t('onboarding_tagline')}
          </Text>
        </View>
      </View>

      {/* ── Country picker — horizontal scroll, always fits ── */}
      <View
        style={{
          borderRadius: 14,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: isCompact ? 8 : 10,
          paddingHorizontal: isCompact ? 10 : 12,
          gap: isCompact ? 6 : 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : theme.colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MapPin size={12} color={theme.colors.primary} />
          </View>
          <Text style={{ fontWeight: '800', fontSize: isCompact ? 12 : 13, color: theme.colors.text }}>
            {t('onboarding_country_title') || 'Choose Country'}
          </Text>
          {selectedCountry && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: theme.colors.primaryLight,
            }}>
              <Text style={{ fontSize: 11 }}>{selectedCountry.flag}</Text>
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: theme.colors.primary }}>
                {selectedCountry.currency}
              </Text>
            </View>
          )}
        </View>

        {/* Horizontal row of currency chips — flag + code only, always fits */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isCompact ? 5 : 6 }}>
          {WIZARD_COUNTRIES.map((country) => {
            const isSelected = selectedCurrency === country.currency;
            return (
              <Pressable
                key={country.code}
                onPress={() => handleCountrySelect(country.currency)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  paddingHorizontal: chipPadH,
                  paddingVertical: chipPadV,
                  borderRadius: 99,
                  borderWidth: 1.5,
                  borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: isSelected
                    ? (theme.isDark ? 'rgba(129, 140, 248, 0.2)' : theme.colors.primaryLight)
                    : theme.colors.surfaceElevated,
                }}
              >
                <Text style={{ fontSize: isCompact ? 12 : 13 }}>{country.flag}</Text>
                <Text
                  style={{
                    fontSize: chipFont,
                    fontWeight: isSelected ? '800' : '600',
                    color: isSelected ? theme.colors.primary : theme.colors.text,
                  }}
                >
                  {country.currency}
                </Text>
                {isSelected && (
                  <Text style={{ fontSize: 8, color: theme.colors.primary, fontWeight: '900' }}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: isCompact ? 8.5 : 9, color: theme.colors.textMuted, textAlign: 'center', marginTop: -2 }}>
          {t('onboarding_country_hint') || 'Sets your currency, accounts & bullion market'}
        </Text>
      </View>

      {/* ── Feature strip ── */}
      <View style={{ gap: isCompact ? 5 : 6 }}>
        {features.map(({ icon: Icon, title, sub }) => (
          <View
            key={title}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: isCompact ? 6 : 8,
              paddingHorizontal: 9,
              borderRadius: 10,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View
              style={{
                width: isCompact ? 28 : 32,
                height: isCompact ? 28 : 32,
                borderRadius: 8,
                backgroundColor: theme.isDark ? 'rgba(52,211,153,0.12)' : theme.colors.primaryLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={isCompact ? 13 : 15} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '800', fontSize: featFont, color: theme.colors.text, lineHeight: isCompact ? 13 : 15 }} numberOfLines={1}>
                {title}
              </Text>
              <Text style={{ fontSize: isCompact ? 9 : 9.5, color: theme.colors.textMuted, lineHeight: isCompact ? 11 : 12, marginTop: 0 }} numberOfLines={1}>
                {sub}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── CTA ── */}
      <View style={{ gap: isCompact ? 6 : 7, marginTop: isCompact ? 0 : 2 }}>
        <Button
          title={t('onboarding_get_started')}
          onPress={finish}
          icon={ArrowRight}
          style={{
            height: isCompact ? 44 : 48,
            borderRadius: 13,
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 3,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <ShieldCheck size={isCompact ? 10 : 11} color={theme.colors.primary} />
          <Text style={{ fontSize: isCompact ? 9 : 10, color: theme.colors.textMuted, fontWeight: '600' }}>
            {t('settings_cloud_synced')}
          </Text>
        </View>
      </View>
    </View>
  );
}