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
  sm: 6,
  md: 10,
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

// THEME 1: INDIGO SAPPHIRE (LINEAR & VERCEL STYLE)
const semantic = {
  primary: '#4F46E5',
  primaryStrong: '#4338CA',
  primaryLight: '#E0E7FF',
  accent: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#0EA5E9',
};

export const lightColors = {
  ...semantic,
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#F1F5F9',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  input: '#FFFFFF',
  tab: '#FFFFFF',
  accentBg: 'rgba(99, 102, 241, 0.08)',
  cardHighlight: '#EFF6FF',
};

export const darkColors = {
  ...semantic,
  primary: '#818CF8',
  primaryStrong: '#A5B4FC',
  primaryLight: 'rgba(129, 140, 248, 0.18)',
  background: '#0B0F19',
  surface: '#151D2A',
  surfaceElevated: '#1E293B',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  border: '#273549',
  input: '#151D2A',
  tab: '#151D2A',
  accentBg: 'rgba(129, 140, 248, 0.18)',
  cardHighlight: '#1E293B',
};

export type ThemeColors = typeof lightColors;
