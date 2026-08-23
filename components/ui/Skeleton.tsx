import { View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export function Skeleton({ height = 80 }: { height?: number }) {
  const theme = useTheme();
  return <View style={{ height, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceElevated, marginBottom: theme.spacing.md }} />;
}
