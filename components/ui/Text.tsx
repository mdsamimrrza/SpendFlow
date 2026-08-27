import { PropsWithChildren } from 'react';
import { PixelRatio, Text as RNText, TextProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Variant = keyof typeof typography;

export function Text({ children, style, variant = 'body', muted = false, ...props }: PropsWithChildren<TextProps & { variant?: Variant; muted?: boolean }>) {
  const theme = useTheme();
  const maxFontSizeMultiplier = props.maxFontSizeMultiplier ?? (PixelRatio.getFontScale() > 1.2 ? 1.25 : undefined);

  return (
    <RNText
      {...props}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        theme.typography[variant],
        { color: muted ? theme.colors.textMuted : theme.colors.text, flexShrink: 1 },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
