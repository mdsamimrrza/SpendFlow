import React from 'react';
import { Pressable, ViewStyle } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';

interface PrivacyEyeButtonProps {
  style?: ViewStyle;
}

export function PrivacyEyeButton({ style }: PrivacyEyeButtonProps) {
  const theme = useTheme();
  const { isPrivacyMode, togglePrivacy } = usePrivacy();

  return (
    <Pressable
      onPress={() => void togglePrivacy()}
      accessibilityRole="button"
      accessibilityLabel={isPrivacyMode ? 'Show balances' : 'Hide balances'}
      style={({ pressed }) => [
        {
          width: 40,
          height: 40,
          borderRadius: theme.radius.full,
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
        <EyeOff size={19} color={theme.colors.primary} />
      ) : (
        <Eye size={19} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}
