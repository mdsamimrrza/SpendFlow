import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/useTheme';

export type AlertModalVariant = 'error' | 'warning' | 'success' | 'info';

interface AlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  variant?: AlertModalVariant;
  onClose: () => void;
}

const CONFIG: Record<
  AlertModalVariant,
  { icon: React.ElementType; color: string; bgDark: string; bgLight: string; borderDark: string; borderLight: string }
> = {
  error:   { icon: AlertCircle,   color: '#EF4444', bgDark: 'rgba(239,68,68,0.14)',   bgLight: 'rgba(239,68,68,0.07)',   borderDark: 'rgba(239,68,68,0.32)',   borderLight: 'rgba(239,68,68,0.22)'   },
  warning: { icon: AlertTriangle, color: '#F59E0B', bgDark: 'rgba(245,158,11,0.14)',  bgLight: 'rgba(245,158,11,0.07)',  borderDark: 'rgba(245,158,11,0.32)',  borderLight: 'rgba(245,158,11,0.22)'  },
  success: { icon: CheckCircle2,  color: '#10B981', bgDark: 'rgba(16,185,129,0.14)',  bgLight: 'rgba(16,185,129,0.07)',  borderDark: 'rgba(16,185,129,0.32)',  borderLight: 'rgba(16,185,129,0.22)'  },
  info:    { icon: Info,          color: '#6366F1', bgDark: 'rgba(99,102,241,0.14)',  bgLight: 'rgba(99,102,241,0.07)',  borderDark: 'rgba(99,102,241,0.32)',  borderLight: 'rgba(99,102,241,0.22)'  },
};

export function AlertModal({ visible, title, message, variant = 'error', onClose }: AlertModalProps) {
  const theme = useTheme();
  const cfg = CONFIG[variant];
  const Icon = cfg.icon;
  const iconBg     = theme.isDark ? cfg.bgDark    : cfg.bgLight;
  const iconBorder = theme.isDark ? cfg.borderDark : cfg.borderLight;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 340,
            backgroundColor: theme.colors.surface,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: theme.colors.border,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.28,
            shadowRadius: 20,
            elevation: 24,
          }}
        >
          {/* Coloured top strip */}
          <View style={{ height: 3, backgroundColor: cfg.color }} />

          <View style={{ padding: 18, gap: 14 }}>
            {/* Icon + title + close — all on one row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: iconBg,
                  borderWidth: 1,
                  borderColor: iconBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={20} color={cfg.color} />
              </View>

              <Text
                style={{ flex: 1, fontSize: 15, fontWeight: '800', color: theme.colors.text, lineHeight: 20 }}
                numberOfLines={2}
              >
                {title}
              </Text>

              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <X size={14} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: theme.colors.border }} />

            {/* Message */}
            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.colors.textMuted, lineHeight: 19 }}>
              {message}
            </Text>

            {/* Got it button */}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                height: 42,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: cfg.color,
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
