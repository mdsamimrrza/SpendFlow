import { Pressable, ScrollView, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

export function Select<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { label: string; value: T }[]; onChange: (value: T) => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => onChange(option.value)}
              style={{
                minHeight: 44,
                borderRadius: theme.radius.full,
                paddingHorizontal: theme.spacing.lg,
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.sm,
                backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceElevated,
              }}
            >
              {selected ? <Check size={16} color="#FFFFFF" /> : null}
              <Text variant="label" style={{ color: selected ? '#FFFFFF' : theme.colors.text }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
