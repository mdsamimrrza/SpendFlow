import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/utils/supabase';

// Remote push is unsupported inside Expo Go since SDK 53 — degrade gracefully there.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/**
 * Registers this device's Expo push token under the signed-in user.
 * Safe to call repeatedly — upserts the same token idempotently.
 */
export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[Push] Skipped: web platform');
    return;
  }
  if (isExpoGo) {
    console.log('[Push] Skipped: Expo Go does not support push tokens (SDK 53+). Build a standalone APK to test cross-device push.');
    return;
  }
  if (!Device.isDevice) {
    console.log('[Push] Skipped: not a physical device (emulator/simulator)');
    return;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') {
      console.warn('[Push] Permission denied — token not registered');
      return;
    }

    const projectId =
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
      'db912006-55b7-4be4-9a0a-42f8935bbf17';

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    if (!token) {
      console.warn('[Push] No token returned from Expo');
      return;
    }

    const { error } = await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: token,
        platform: Platform.OS,
        device_name: Device.deviceName ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'expo_push_token' },
    );

    if (error) {
      console.warn('[Push] Supabase upsert failed:', error.message);
    } else {
      console.log('[Push] Token registered successfully:', token.slice(0, 20) + '...');
    }
  } catch (err) {
    console.warn('[Push] Token registration failed:', err);
  }
}

/** Removes this device's token (call on sign-out). */
export async function unregisterPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const projectId =
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
      'db912006-55b7-4be4-9a0a-42f8935bbf17';
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('device_tokens').delete().match({
      user_id: userId,
      expo_push_token: tokenResponse.data,
    });
  } catch {
    // best-effort cleanup
  }
}

interface CrossDevicePushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Sends a push notification to ALL of the user's other devices.
 * Fire-and-forget — failures are logged, never thrown.
 */
export async function notifyOtherDevices(payload: CrossDevicePushPayload): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;

  try {
    const projectId =
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
      'db912006-55b7-4be4-9a0a-42f8935bbf17';

    // Our own token — exclude the sending device so it doesn't notify itself
    let ownToken: string | null = null;
    try {
      const own = await Notifications.getExpoPushTokenAsync({ projectId });
      ownToken = own.data;
    } catch {
      ownToken = null;
    }

    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('expo_push_token')
      .eq('user_id', payload.userId);

    if (error) {
      console.warn('[Push] Failed to fetch device tokens:', error.message);
      return;
    }
    if (!tokens?.length) {
      console.log('[Push] No device tokens found for user');
      return;
    }

    const messages = tokens
      .map((row) => row.expo_push_token as string)
      .filter((token) => token && token !== ownToken)
      .map((token) => ({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }));

    if (!messages.length) {
      console.log('[Push] No other devices to notify (only this device registered)');
      return;
    }

    console.log(`[Push] Sending to ${messages.length} device(s)...`);

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const result = await response.json().catch(() => null);
    console.log('[Push] Expo response:', JSON.stringify(result));
  } catch (err) {
    console.warn('[Push] Cross-device notify failed:', err);
  }
}
