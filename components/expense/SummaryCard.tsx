import { View } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/useTheme';

export function SummaryCard({ title, value, detail, icon: Icon }: { title: string; value: string; detail?: string; icon: LucideIcon }) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" muted>
          {title}
        </Text>
        <Icon size={18} color={theme.colors.primary} />
      </View>
      <Text variant="h3" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {value}
      </Text>
      {detail ? (
        <Text variant="caption" muted>
          {detail}
        </Text>
      ) : null}
    </Card>
  );
}
