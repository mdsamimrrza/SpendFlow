import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Trash2, X, ZoomIn } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/useTheme';

interface ImageViewerModalProps {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
  onRemove?: () => void;
}

export function ImageViewerModal({
  visible,
  imageUrl,
  onClose,
  onRemove,
}: ImageViewerModalProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();

  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Background backdrop */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        <SafeAreaView style={styles.safeArea}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ZoomIn size={20} color="#FFFFFF" />
              <Text style={styles.title}>Receipt Full View</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {onRemove ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove receipt"
                  onPress={() => {
                    onRemove();
                    onClose();
                  }}
                  hitSlop={8}
                  style={styles.iconBtn}
                >
                  <Trash2 size={20} color={theme.colors.danger} />
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close image viewer"
                onPress={onClose}
                hitSlop={8}
                style={styles.iconBtn}
              >
                <X size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          {/* Full Screen Image */}
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.fullImage, { width, height: height * 0.75 }]}
              resizeMode="contain"
            />
          </View>

          {/* Bottom Hint */}
          <View style={styles.bottomBar}>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Tap anywhere outside or the X button to close
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
  },
  backdrop: {
    ...(StyleSheet.absoluteFillObject as any),
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'android' ? 44 : 16,
    zIndex: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  fullImage: {},
  bottomBar: {
    alignItems: 'center',
    paddingBottom: 24,
  },
});
