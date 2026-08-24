import { Image, View } from 'react-native';
import { User } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

export function Avatar({ uri, name, size = 48 }: { uri?: string | null; name?: string | null; size?: number }) {
  const theme = useTheme();
  const initials = name?.slice(0, 2).toUpperCase();
  const fontSize = size > 40 ? 'h3' : 'label';

  return (
    <View style={{ width: size, height: size, borderRadius: theme.radius.full, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} /> : initials ? <Text variant={fontSize}>{initials}</Text> : <User size={size * 0.45} color={theme.colors.textMuted} />}
    </View>
  );
}
