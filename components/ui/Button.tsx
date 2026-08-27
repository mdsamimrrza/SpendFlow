import React from 'react';
import { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';

export function Button({
  title,
  variant = 'primary',
  loading = false,
  icon: Icon,
  style,
  disabled,
  ...props
}: Omit<PressableProps, 'style'> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  const isPrimary = variant === 'primary';
  const isDestructive = variant === 'destructive';
  const isSecondary = variant === 'secondary';

  const background = isPrimary
    ? theme.colors.primary
    : isDestructive
    ? theme.colors.danger
    : isSecondary
    ? theme.colors.surfaceElevated
    : 'transparent';

  const color = isPrimary
    ? theme.isDark
      ? '#0B0F19'
      : '#FFFFFF'
    : isDestructive
    ? '#FFFFFF'
    : theme.colors.text;

  return (
    <PressableScale
      accessibilityRole="button"
      disabled={disabled || loading}
      activeScale={0.96}
      style={[
        styles.base,
        {
          backgroundColor: background,
          borderRadius: theme.radius.md,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={color} /> : Icon ? <Icon size={18} color={color} /> : null}
      <Text variant="label" style={{ color, fontWeight: '700' }}>
        {title}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    paddingHorizontal: 16,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8,
  },
});
