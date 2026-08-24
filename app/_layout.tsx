import 'react-native-url-polyfill/auto';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider } from '@/store/AuthContext';
import { OnboardingProvider, useOnboarding } from '@/store/OnboardingContext';
import { ThemeProvider } from '@/store/ThemeContext';
import { deactivateKeepAwake } from 'expo-keep-awake';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

function RootNavigator() {
  const { session, loading } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { completed: onboardingDone } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();
  const segmentKey = segments.join('/');
  const isLoading = loading || onboardingDone === null;

  // Ensure plenty of safe clearance from status bar / camera punch hole on mobile
  const topPadding = Platform.OS === 'web' ? 0 : Math.max(insets.top, Platform.OS === 'android' ? 38 : 0);

  useEffect(() => {
    void deactivateKeepAwake().catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segmentKey.includes('(auth)') || segmentKey.includes('auth');
    const inOnboarding = segmentKey === 'onboarding';

    if (session) {
      if (inAuthGroup || inOnboarding || segmentKey === '') {
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
      </Stack>
      {isLoading ? (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.background,
          }}
        >
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}
    </View>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <OnboardingProvider>
            <RootNavigator />
          </OnboardingProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

