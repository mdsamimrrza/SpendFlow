import { Pressable, ScrollView, View, Modal } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

export function Select<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { label: string; value: T }[]; onChange: (value: T) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? 'Select an option';

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 48,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          backgroundColor: theme.colors.input,
        }}
      >
        <Text variant="label">{selectedLabel}</Text>
        <ChevronDown size={18} color={theme.colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.lg, backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
          <Pressable onPress={() => undefined} style={{ maxHeight: '80%', borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.sm }}>
            <ScrollView>
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={{ minHeight: 48, paddingHorizontal: theme.spacing.md, alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm, backgroundColor: selected ? theme.colors.surfaceElevated : 'transparent' }}
                  >
                    {selected ? <Check size={16} color={theme.colors.primary} /> : <View style={{ width: 16 }} />}
                    <Text variant="label">{option.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
