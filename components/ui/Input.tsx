import { TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

export function Input({ label, error, ...props }: TextInputProps & { label?: string; error?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={{
          minHeight: 48,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          backgroundColor: theme.colors.input,
          color: theme.colors.text,
          paddingHorizontal: theme.spacing.lg,
          fontSize: 16,
        }}
        {...props}
      />
      {error ? (
        <Text variant="caption" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
