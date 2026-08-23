import { PropsWithChildren } from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Variant = keyof typeof typography;

export function Text({ children, style, variant = 'body', muted = false, ...props }: PropsWithChildren<TextProps & { variant?: Variant; muted?: boolean }>) {
  const theme = useTheme();
  return (
    <RNText {...props} style={[theme.typography[variant], { color: muted ? theme.colors.textMuted : theme.colors.text }, style]}>
      {children}
    </RNText>
  );
}
