import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Blocks screenshots and screen recording (Android FLAG_SECURE; iOS
 * replay/rebroadcast protection) while the calling financial screen is
 * mounted. Deliberately scoped screen-by-screen — onboarding, settings and
 * support flows stay unaffected. The shared key reference-counts stacked
 * screens, so the first unmount doesn't re-enable capture while another
 * financial screen is still mounted.
 *
 * A true no-op on web (the native module doesn't exist there — calling it
 * logged an "not available on web" warning on every mount).
 */

// Per-key mount counters: prevent on first mount, allow only on the last
// unmount (mirrors expo-screen-capture's internal reference counting).
const keyCounts = new Map<string, number>();

export function usePrivacyScreen(key = 'spendflow-financial-screen'): void {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const count = (keyCounts.get(key) ?? 0) + 1;
    keyCounts.set(key, count);
    if (count === 1) {
      void ScreenCapture.preventScreenCaptureAsync(key).catch(() => undefined);
    }

    return () => {
      const remaining = (keyCounts.get(key) ?? 1) - 1;
      if (remaining > 0) {
        keyCounts.set(key, remaining);
        return;
      }
      keyCounts.delete(key);
      void ScreenCapture.allowScreenCaptureAsync().catch(() => undefined);
    };
  }, [key]);
}
