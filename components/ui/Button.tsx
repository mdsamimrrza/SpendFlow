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
  const background =
    variant === 'primary' ? theme.colors.primary : variant === 'destructive' ? theme.colors.danger : variant === 'secondary' ? theme.colors.surfaceElevated : 'transparent';
  const color = variant === 'primary' || variant === 'destructive' ? '#FFFFFF' : theme.colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, borderRadius: theme.radius.md, opacity: pressed || disabled ? 0.72 : 1 },
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={color} /> : Icon ? <Icon size={18} color={color} /> : null}
      <Text variant="label" style={{ color }}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
