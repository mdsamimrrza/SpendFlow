import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { loadNotificationsModule } from '@/services/notificationsModule';
import { supabase } from '@/utils/supabase';

// Remote push is unsupported inside Expo Go since SDK 53 — degrade gracefully there.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Null inside Expo Go (the module throws on import there) — guards below no-op.
const Notifications = loadNotificationsModule();

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
  if (!Notifications) {
    console.log('[Push] Skipped: expo-notifications unavailable in this runtime');
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

    // A physical device gets ONE Expo token, but the signed-in user changes.
    // audit run-1: claim via the SECURITY DEFINER RPC (migration
    // 20260916120000) — one atomic statement re-points a token row still
    // owned by a previous account on this install to the current user, so
    // the old account's financial pushes stop arriving here and the new
    // account is never silently denied registration by the UNIQUE token.
    // Falls back to the owner-scoped delete+insert when the RPC is not in
    // the deployed database yet (this project has documented migration lag);
    // the fallback surfaces the cross-account conflict as a warning rather
    // than hijacking the row.
    const claim = await supabase.rpc('claim_device_token', {
      p_expo_push_token: token,
      p_platform: Platform.OS,
      p_device_name: Device.deviceName ?? null,
    });
    if (claim.error?.code === 'PGRST202' /* undefined function */ || claim.error?.code === '42883') {
      await supabase.from('device_tokens').delete().eq('expo_push_token', token);
      const { error } = await supabase.from('device_tokens').insert({
        user_id: userId,
        expo_push_token: token,
        platform: Platform.OS,
        device_name: Device.deviceName ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.warn('[Push] Supabase token insert failed (previous account may still hold this device token):', error.message);
      }
    } else if (claim.error) {
      console.warn('[Push] Supabase token claim failed:', claim.error.message);
    }
  } catch (err) {
    console.warn('[Push] Token registration failed:', err instanceof Error ? err.message : err);
  }
}

/** Removes this device's token (call on sign-out). */
export async function unregisterPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo || !Notifications) return;
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
  if (Platform.OS === 'web' || isExpoGo || !Notifications) return;

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

    // Only the delivery status is logged — never the Expo response payload,
    // which echoes device push tokens.
    if (!response.ok) {
      console.warn('[Push] Expo delivery failed with HTTP', response.status);
    }
  } catch (err) {
    console.warn('[Push] Cross-device notify failed:', err instanceof Error ? err.message : err);
  }
}
