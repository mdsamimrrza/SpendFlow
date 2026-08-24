import { Moon, Sun } from 'lucide-react-native';
import { Pressable, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface ThemeToggleProps {
  style?: ViewStyle;
}

export function ThemeToggle({ style }: ThemeToggleProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => void theme.toggleTheme()}
      accessibilityRole="button"
      accessibilityLabel="Toggle light/dark theme"
      style={({ pressed }) => [
        {
          width: 40,
          height: 40,
          borderRadius: theme.radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {theme.isDark ? (
        <Sun size={20} color="#F59E0B" />
      ) : (
        <Moon size={20} color={theme.colors.text} />
      )}
    </Pressable>
  );
}
