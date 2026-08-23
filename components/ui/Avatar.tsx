import { Image, View } from 'react-native';
import { User } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

export function Avatar({ uri, name }: { uri?: string | null; name?: string | null }) {
  const theme = useTheme();
  const initials = name?.slice(0, 2).toUpperCase();
  return (
    <View style={{ width: 56, height: 56, borderRadius: theme.radius.full, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: 56, height: 56 }} /> : initials ? <Text variant="h3">{initials}</Text> : <User size={24} color={theme.colors.textMuted} />}
    </View>
  );
}
