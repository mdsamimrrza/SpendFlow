import React from 'react';
import { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from './Button';
import { Text } from './Text';

export function EmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 14,
        paddingVertical: 36,
        paddingHorizontal: 24,
        borderRadius: 20,
        backgroundColor: theme.colors.surface,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        marginVertical: 12,
        shadowColor: '#000000',
        shadowOpacity: theme.isDark ? 0.2 : 0.04,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: theme.colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 2,
        }}
      >
        <Icon size={30} color={theme.colors.primary} />
      </View>

      <View style={{ alignItems: 'center', gap: 4, maxWidth: 280 }}>
        <Text variant="h3" style={{ textAlign: 'center', fontWeight: '800', color: theme.colors.text }}>
          {title}
        </Text>
        <Text muted style={{ textAlign: 'center', fontSize: 13, lineHeight: 18, color: theme.colors.textMuted }}>
          {message}
        </Text>
      </View>

      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          style={{
            marginTop: 4,
            paddingHorizontal: 24,
            height: 44,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.primary,
          }}
        />
      ) : null}
    </View>
  );
}
