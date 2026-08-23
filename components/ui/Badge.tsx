import { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }>) {
  const theme = useTheme();
  const color = tone === 'neutral' ? theme.colors.surfaceElevated : theme.colors[tone];
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: theme.radius.full, backgroundColor: color, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text variant="caption" style={{ color: tone === 'neutral' ? theme.colors.text : '#FFFFFF' }}>
        {children}
      </Text>
    </View>
  );
}
