import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { AlertTriangle, X } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/useTheme';

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.68)' }}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ width: '100%', maxWidth: 420, backgroundColor: theme.colors.surface, borderRadius: 24, padding: 20, gap: 18, borderWidth: 1, borderColor: theme.colors.border, elevation: 28, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)' }}>
              <AlertTriangle size={21} color={theme.colors.danger} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="h3" style={{ fontWeight: '800' }}>{title}</Text>
              <Text muted style={{ lineHeight: 20 }}>{message}</Text>
            </View>
            <Pressable onPress={onCancel} hitSlop={8}><X size={19} color={theme.colors.textMuted} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            <Button title="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1, minWidth: 0, height: 50 }} />
            <Button title={confirmLabel} variant="destructive" loading={loading} onPress={onConfirm} style={{ flex: 1, minWidth: 0, height: 50 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
