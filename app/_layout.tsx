import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider } from '@/store/AuthContext';
import { OnboardingProvider, useOnboarding } from '@/store/OnboardingContext';
import { ThemeProvider } from '@/store/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

function RootNavigator() {
  const { session, loading } = useAuth();
  const theme = useTheme();
  const { completed: onboardingDone } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();
  const segmentKey = segments.join('/');
  const isLoading = loading || onboardingDone === null;

  useEffect(() => {
    if (isLoading) return;

    if (!onboardingDone && segmentKey !== 'onboarding') {
      router.replace('/onboarding');
      return;
    }
    if (onboardingDone && segmentKey === 'onboarding') {
      router.replace(session ? '/(tabs)' : '/(auth)');
      return;
    }
    if (session && segmentKey.startsWith('(auth)')) {
      router.replace('/(tabs)');
      return;
    }
    if (!session && !segmentKey.startsWith('(auth)') && segmentKey !== 'onboarding') {
      router.replace('/(auth)');
    }
  }, [isLoading, onboardingDone, router, segmentKey, session]);

  return (
    <>
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
    </>
  );
}

export default function Layout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <OnboardingProvider>
          <RootNavigator />
        </OnboardingProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
