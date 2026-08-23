import { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from './Button';
import { Text } from './Text';

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction }: { icon: LucideIcon; title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing['3xl'] }}>
      <Icon size={42} color={theme.colors.primary} />
      <Text variant="h3" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text muted style={{ textAlign: 'center' }}>
        {message}
      </Text>
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
