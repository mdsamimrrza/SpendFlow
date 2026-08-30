import '@/utils/polyfills';
import 'react-native-url-polyfill/auto';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider } from '@/store/AuthContext';
import { LanguageProvider } from '@/store/LanguageContext';
import { OnboardingProvider, useOnboarding } from '@/store/OnboardingContext';
import { ThemeProvider } from '@/store/ThemeContext';
import { deactivateKeepAwake } from 'expo-keep-awake';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui/Text';
import { AnimatedSplashScreen } from '@/components/ui/AnimatedSplashScreen';
import { isSupabaseConfigured } from '@/utils/supabase';

import { SecurityProvider } from '@/store/SecurityContext';
import { PrivacyProvider } from '@/store/PrivacyContext';
import { BiometricLockOverlay } from '@/components/security/BiometricLockOverlay';
import { initNotifications } from '@/services/notifications';
import { registerPushToken } from '@/services/pushNotifications';

function RootNavigator() {
  const { session, loading } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { completed: onboardingDone } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();
  const segmentKey = segments.join('/');
  const isLoading = loading || onboardingDone === null;

  // SafeAreaProvider already accounts for each device's status bar and cutout.
  const topPadding = Platform.OS === 'web' ? 0 : insets.top;

  useEffect(() => {
    void initNotifications().catch(() => {});
  }, []);

  // Register this device's push token so OTHER devices of the same account can notify it
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid) void registerPushToken(uid).catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    if (isLoading || !isSupabaseConfigured) return;

    const inAuthGroup = segmentKey.includes('(auth)') || segmentKey.includes('auth');
    const inOnboarding = segmentKey === 'onboarding';

    if (session) {
      if (inAuthGroup || inOnboarding || segmentKey === '' || segmentKey === '(auth)') {
        router.replace('/(tabs)');
      }
    } else {
      if (!onboardingDone && !inOnboarding) {
        router.replace('/onboarding');
      } else if (onboardingDone && !inAuthGroup) {
        router.replace('/(auth)');
      }
    }
  }, [isLoading, onboardingDone, router, segmentKey, session]);

  if (!isSupabaseConfigured) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.colors.background }}>
        <Text variant="h2">SpendFlow configuration missing</Text>
        <Text muted style={{ marginTop: 12, textAlign: 'center' }}>
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY to the EAS production environment, then rebuild.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: topPadding }}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="expense/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/[id]" />
        <Stack.Screen name="export" options={{ presentation: 'modal' }} />
        <Stack.Screen name="bullion" />
      </Stack>
      <AnimatedSplashScreen visible={isLoading} />
      <BiometricLockOverlay />
    </View>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <SecurityProvider>
            <ThemeProvider>
              <PrivacyProvider>
                <OnboardingProvider>
                  <RootNavigator />
                </OnboardingProvider>
              </PrivacyProvider>
            </ThemeProvider>
          </SecurityProvider>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

