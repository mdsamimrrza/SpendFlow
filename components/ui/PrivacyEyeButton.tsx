import React from 'react';
import { Pressable, ViewStyle } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';

interface PrivacyEyeButtonProps {
  style?: ViewStyle;
  size?: number;
  iconSize?: number;
}

export function PrivacyEyeButton({ style, size = 40, iconSize }: PrivacyEyeButtonProps) {
  const theme = useTheme();
  const { isPrivacyMode, togglePrivacy } = usePrivacy();
  const resolvedIconSize = iconSize ?? (size <= 24 ? 18 : size <= 32 ? 20 : Math.round(size * 0.60));

  return (
    <Pressable
      onPress={() => void togglePrivacy()}
      accessibilityRole="button"
      accessibilityLabel={isPrivacyMode ? 'Show balances' : 'Hide balances'}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: isPrivacyMode ? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {isPrivacyMode ? (
        <EyeOff size={resolvedIconSize} color={theme.colors.primary} />
      ) : (
        <Eye size={resolvedIconSize} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}
