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

export const lightColors = {
  primary: '#0F5C4D',         // Teal (progress bar, active states, chart line)
  primaryStrong: '#0A453A',   // Deep Teal
  primaryLight: '#DCE9E3',    // Teal tint (light backgrounds for teal chips/icons)
  accent: '#A8791F',          // Brass (highlights, badge percentages)
  success: '#0F5C4D',         // Teal / Green
  income: '#047857',          // Deep emerald — income amounts (dark enough for parchment bg)
  warning: '#A8791F',         // Brass
  danger: '#A5442B',          // Rust ("up" spending chip, alerts)
  info: '#2A6F86',            // Deep Aqua / Slate
  background: '#EDEAE0',      // Warm parchment paper
  surface: '#F7F5EC',         // Paper-raised card
  surfaceElevated: '#E5E2D6', // Elevated parchment
  text: '#17241F',            // Primary ink (near-black)
  textMuted: '#4B5C55',       // Soft ink (muted grey-green)
  faint: '#8B978F',           // Faint ink (labels, timestamps)
  border: '#CFCABA',          // Rule lines (dotted/dashed dividers)
  input: '#F7F5EC',           // Paper raised
  tab: '#F7F5EC',             // Paper raised
  accentBg: '#DCE9E3',        // Teal tint
  cardHighlight: '#DCE9E3',   // Highlight tint
  brass: '#A8791F',           // Brass
  brassTint: '#F0E3C8',       // Brass tint
  rust: '#A5442B',            // Rust
  rustTint: '#F1DCD3',        // Rust tint
};

export const darkColors = {
  primary: '#7D8DFF',         // Vivid indigo — glows on deep slate
  primaryStrong: '#B3BEFF',
  primaryLight: 'rgba(125, 141, 255, 0.24)',
  accent: '#9D7BFF',
  success: '#10B981',
  income: '#10B981',          // Income amounts (bright emerald reads well on dark)
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#38BDF8',
  background: '#070B16',      // Richer, deeper slate-black
  surface: '#101827',
  surfaceElevated: '#1B2542',
  text: '#F4F7FC',
  textMuted: '#9DACC6',
  faint: '#6B7C99',
  border: '#2A3A57',
  input: '#101827',
  tab: '#0D1424',
  accentBg: 'rgba(125, 141, 255, 0.24)',
  cardHighlight: '#1B2542',
  brass: '#FBBF24',
  brassTint: 'rgba(251, 191, 36, 0.16)',
  rust: '#F87171',
  rustTint: 'rgba(248, 113, 113, 0.16)',
};

export type ThemeColors = typeof lightColors;
