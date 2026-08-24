import { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
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
}: Omit<PressableProps, 'style'> & { title: string; variant?: Variant; loading?: boolean; icon?: LucideIcon; style?: StyleProp<ViewStyle> }) {
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

  // Crystal clear high-contrast text color:
  // In Dark mode, primary background is bright mint (#2DD4BF), so use dark text (#06201D) instead of invisible white!
  const color = isPrimary
    ? theme.isDark
      ? '#06201D'
      : '#FFFFFF'
    : isDestructive
    ? '#FFFFFF'
    : theme.colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, borderRadius: theme.radius.md, opacity: pressed || disabled ? 0.75 : 1 },
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={color} /> : Icon ? <Icon size={18} color={color} /> : null}
      <Text variant="label" style={{ color, fontWeight: '700' }}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
