import { View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from './Button';
import { Text } from './Text';

export function Snackbar({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        bottom: theme.spacing['2xl'],
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.text,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
      }}
    >
      <Text style={{ color: theme.colors.background, flex: 1 }}>{message}</Text>
      {actionLabel && onAction ? <Button title={actionLabel} variant="ghost" onPress={onAction} /> : null}
    </View>
  );
}
