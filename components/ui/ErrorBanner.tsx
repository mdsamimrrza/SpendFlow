import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CloudOff, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Shared "couldn't load your data" banner (audit 2026-10-27, A9): rendered
 * instead of — or above — empty states when a fetch fails, so a network or
 * server error is never mistaken for "no data". Tap retries via the optional
 * onRetry callback.
 */
export function ErrorBanner({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: theme.isDark ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.08)', borderColor: theme.colors.danger },
      ]}
    >
      <CloudOff size={16} color={theme.colors.danger} />
      <Text numberOfLines={2} style={[styles.text, { color: theme.colors.text }]}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.6 : 1, borderColor: theme.colors.danger }]}
        >
          <RefreshCw size={12} color={theme.colors.danger} />
          <Text style={[styles.retryText, { color: theme.colors.danger }]}>{retryLabel ?? 'Retry'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: { fontSize: 12, fontWeight: '600', flex: 1 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  retryText: { fontSize: 11, fontWeight: '800' },
});
