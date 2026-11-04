import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CloudOff } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '@/hooks/useTheme';

/**
 * Offline indicator (audit 2026-10-27, A10): mounted at the app root so a
 * dropped connection is never mistaken for "no data" — the screens keep
 * painting their cached data underneath. NetInfo was already a dependency
 * (Supabase requirement) and is now finally put to work.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // isInternetReachable is null while detecting — only flag a definite "no".
      setOffline(state.isInternetReachable === false);
    });
    return () => unsub();
  }, []);

  if (!offline) return null;
  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.danger }]}>
      <CloudOff size={13} color="#FFFFFF" />
      <Text style={styles.text}>You're offline — showing saved data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  text: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});
