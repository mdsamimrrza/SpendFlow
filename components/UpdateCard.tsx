// Update card for the SpendFlow APK. Mounted once in the (tabs) layout.
// On mount it fetches the published release and compares it with this build:
//   - at or past latest_version      -> render nothing
//   - behind latest_version          -> dismissible card above the tabs
//   - below min_version (if set)     -> blocking modal, no dismissal
// The check reruns on every app open because the layout remounts.

import React, { useEffect, useState } from 'react';
import { Linking, Modal as RNModal, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './ui/Text';
import { Button } from './ui/Button';
import {
  compareVersions,
  currentAppVersion,
  fetchLatestRelease,
  type AppRelease,
} from '@/utils/updateCheck';

export function UpdateCard() {
  const theme = useTheme();
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const latest = await fetchLatestRelease();
      if (!active || !latest) return;
      if (compareVersions(currentAppVersion(), latest.latest_version) < 0) {
        setRelease(latest);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!release) return null;

  const hardBlock =
    !!release.min_version &&
    compareVersions(currentAppVersion(), release.min_version) < 0;
  if (!hardBlock && dismissed) return null;

  const download = () => {
    if (release.apk_url) void Linking.openURL(release.apk_url);
  };

  const body = (
    <View style={[styles.card]}>
      <Text variant="h3">Version {release.latest_version} available</Text>
      {release.notes ? (
        <Text muted style={styles.notes}>
          {release.notes}
        </Text>
      ) : null}
      <Text muted style={styles.notes}>
        {hardBlock
          ? 'This version is no longer supported - you must update to continue.'
          : `You are running ${currentAppVersion()}.`}
      </Text>
      <Button title="Download update" onPress={download} />
      {!hardBlock ? (
        <Button title="Later" variant="ghost" onPress={() => setDismissed(true)} />
      ) : null}
    </View>
  );

  if (hardBlock) {
    return (
      <RNModal visible transparent animationType="fade" statusBarTranslucent>
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <View style={[styles.modalBody, { backgroundColor: theme.colors.surface }]}>
            {body}
          </View>
        </View>
      </RNModal>
    );
  }

  return <View style={styles.wrapper}>{body}</View>;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    zIndex: 50,
  },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.35)',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalBody: {
    gap: 8,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  notes: {
    marginTop: -4,
  },
});
