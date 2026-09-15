import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, radius, spacing, ThemeColors, typography } from '@/constants/theme';
import { updateProfile } from '@/services/auth';
import { ThemePreference } from '@/types';
import { AuthContext } from './AuthContext';

const THEME_STORAGE_KEY = '@spendflow_theme_preference';

interface AppTheme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  isDark: boolean;
  themePreference: ThemePreference;
  toggleTheme: () => Promise<void>;
  setThemePreference: (pref: ThemePreference) => Promise<void>;
}

export const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const auth = useContext(AuthContext);
  const system = useColorScheme();
  const [overrideTheme, setOverrideTheme] = useState<ThemePreference | null>(null);

  // Theme is DEVICE-LOCAL (same philosophy as the per-device currency): a
  // fresh install follows the phone's own scheme and never flips when an old
  // account preference arrives from the server — field bug: install on a dark
  // phone showed dark, then auto-shifted to light from a stale server value.
  // The user's explicit choice is stored locally (instant on every launch)
  // and mirrored to the server profile for reference.
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setOverrideTheme(stored as ThemePreference);
        }
      })
      .catch(() => undefined);
  }, []);

  const preference = overrideTheme ?? 'system';
  const isDark = preference === 'dark' || (preference === 'system' && system === 'dark');

  const setThemePreference = useCallback(
    async (pref: ThemePreference) => {
      setOverrideTheme(pref);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, pref).catch(() => undefined);
      if (auth?.profile) {
        try {
          await updateProfile({ theme_preference: pref });
          await auth.refreshProfile(true);
        } catch {
          // offline fallback — the local value already applied
        }
      }
    },
    [auth],
  );

  const toggleTheme = useCallback(async () => {
    const nextPref: ThemePreference = isDark ? 'light' : 'dark';
    await setThemePreference(nextPref);
  }, [isDark, setThemePreference]);

  const value = useMemo<AppTheme>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      spacing,
      radius,
      typography,
      isDark,
      themePreference: preference,
      toggleTheme,
      setThemePreference,
    }),
    [isDark, preference, setThemePreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
