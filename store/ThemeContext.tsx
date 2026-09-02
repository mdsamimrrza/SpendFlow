import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, spacing, ThemeColors, typography } from '@/constants/theme';
import { updateProfile } from '@/services/auth';
import { ThemePreference } from '@/types';
import { AuthContext } from './AuthContext';

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

  const preference = overrideTheme ?? auth?.profile?.theme_preference ?? 'system';
  const isDark = preference === 'dark' || (preference === 'system' && system === 'dark');

  const setThemePreference = useCallback(
    async (pref: ThemePreference) => {
      setOverrideTheme(pref);
      if (auth?.profile) {
        try {
          await updateProfile({ theme_preference: pref });
          await auth.refreshProfile(true);
        } catch {
          // offline fallback
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
