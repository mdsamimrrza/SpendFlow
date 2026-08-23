import { PropsWithChildren } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export function BottomSheet({ visible, onClose, children }: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radius.lg,
          borderTopRightRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        {children}
      </View>
    </Modal>
  );
}
