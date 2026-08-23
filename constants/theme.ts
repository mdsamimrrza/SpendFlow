export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
  '5xl': 64,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 42, fontWeight: '800' as const },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '700' as const },
} as const;

const semantic = {
  primary: '#0F9F8E',
  primaryStrong: '#087C71',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#2563EB',
};

export const lightColors = {
  ...semantic,
  background: '#F6F8FA',
  surface: '#FFFFFF',
  surfaceElevated: '#F0F5F4',
  text: '#111827',
  textMuted: '#607080',
  border: '#D9E2E7',
  input: '#FFFFFF',
  tab: '#F9FBFB',
};

export const darkColors = {
  ...semantic,
  primary: '#2DD4BF',
  primaryStrong: '#14B8A6',
  background: '#111316',
  surface: '#1B2024',
  surfaceElevated: '#252C31',
  text: '#F3F7F7',
  textMuted: '#A8B5BA',
  border: '#344047',
  input: '#20262B',
  tab: '#171B1F',
};

export type ThemeColors = typeof lightColors;
