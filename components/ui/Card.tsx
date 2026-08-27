import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export function Card({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  const theme = useTheme();
  return (
    <View
      {...props}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md }, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 16,
    width: '100%',
  },
});
