import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * One-time binding for auth-callback token intake (audit run-1 fix).
 *
 * The exported `spendflow://` scheme identifies the RECEIVER, never the
 * sender — any installed app or tapped link can deliver a callback URL with
 * tokens to this device. `isTrustedAuthUrl` (kept here, shared by the
 * deep-link listener and the Google browser-result door) pins origin/scheme,
 * but a scheme-only match cannot stop a hostile same-scheme link. This module
 * records that THIS client instance actually started an auth flow, so the
 * intake path only accepts foreign-candidate sessions while a flow is live.
 *
 * On web the OAuth redirect reloads the page, so the marker is persisted to
 * AsyncStorage (timestamp-only, non-secret) to survive the round-trip.
 */

const PENDING_KEY = '@spendflo…auth';
const PENDING_TTL_MS = 5 * 60 * 1000;

let memoryUntil = 0;

export async function beginPendingAuthFlow(): Promise<void> {
  memoryUntil = Date.now() + PENDING_TTL_MS;
  // Awaited write: on web the caller navigates to the IdP immediately after,
  // and the persisted marker must survive the page unload.
  try {
    await AsyncStorage.setItem(PENDING_KEY, String(memoryUntil));
  } catch {
    // Marker stays memory-only for this session; the callback then falls back
    // to the same-user ownership rule.
  }
}

export function endPendingAuthFlow(): void {
  memoryUntil = 0;
  void AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
}

/** True while this client has an auth flow whose callback may complete a session. */
export async function isPendingAuthFlow(): Promise<boolean> {
  const now = Date.now();
  if (memoryUntil > now) return true;
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= now) {
      void AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Consume the web-persisted marker once a callback has been accepted. */
export function consumePendingAuthFlow(): void {
  memoryUntil = 0;
  void AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UrlDecode(input: string): string {
  // Minimal dependency-free base64url decoder (JWT payload: no padding, '-'/'_' alphabet).
  let clean = input.replace(/-/g, '+').replace(/_/g, '/');
  while (clean.length % 4 !== 0) clean += '=';
  let bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = B64_CHARS.indexOf(clean[i + 2]);
    const c3 = B64_CHARS.indexOf(clean[i + 3]);
    const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  if (clean.endsWith('==')) bytes = bytes.slice(0, -2);
  else if (clean.endsWith('=')) bytes = bytes.slice(0, -1);
  // UTF-8 decode without TextDecoder assumptions.
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b1 = bytes[i];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
      i += 1;
    } else if (b1 < 0xe0) {
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b1 < 0xf0) {
      out += String.fromCharCode(((b1 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      const cp =
        (((b1 & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f)) -
        0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      i += 4;
    }
  }
  return out;
}

/** Unverified claim read for OWNERSHIP comparison only — never trust anything else in the payload. */
export function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Trust gate for auth-callback URLs (moved from store/AuthContext so BOTH
 * token-intake doors share one implementation — the audit found the Google
 * browser-result door consuming result.url with no equivalent check).
 *
 * Trusted shapes:
 *   - https://<project>.supabase.co/... — the project's own hosted origin
 *   - same-origin on the web export
 *   - spendflow:// (host-less) / spendflow://callback — the app's own scheme
 * Anything else — spendflow://evil.com, spendflow://probe, other https hosts
 * — is dropped. NOTE: a custom scheme is reachable by every sender on the
 * device; combine with isPendingAuthFlow()/session ownership for intake.
 */
export function isTrustedAuthUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      if (!projectUrl) return false;
      if (parsed.host === new URL(projectUrl).host) return true;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && parsed.origin === window.location.origin) {
        return true;
      }
      return false;
    }
    if (parsed.protocol === 'spendflow:') {
      return parsed.host === '' || parsed.host === 'callback';
    }
    return false;
  } catch {
    return false;
  }
}
