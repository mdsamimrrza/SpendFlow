import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// ─────────────────────────────────────────────────────────────────────────────
// Auth session storage.
//
// Native: encrypted device storage (iOS Keychain / Android Keystore via
// expo-secure-store). The session JSON holds the access + refresh tokens and
// must never sit in plaintext AsyncStorage. Values are chunked because
// secure-storage backends can impose per-entry byte caps; 2000 stays under
// every known limit (the historical Android 2048-byte Keystore truncation
// included, which is why this app originally used AsyncStorage).
//
// Web: AsyncStorage (localStorage) — expo-secure-store has no web target and
// browser storage is the platform's own boundary.
// ─────────────────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 2000;

function chunkString(source: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < source.length; i += CHUNK_SIZE) {
    chunks.push(source.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

const chunkCountKey = (key: string) => `${key}-chunkCount`;
const chunkKey = (key: string, index: number) => `${key}-${index}`;

// Raw chunk helpers — they NEVER call migrateLegacySession (the migration
// itself writes through them, and awaiting its own in-flight promise would
// deadlock).
async function readChunks(key: string): Promise<string | null> {
  const count = await SecureStore.getItemAsync(chunkCountKey(key)).catch(() => null);
  if (count === null) return null;
  // A corrupt/non-numeric count is an unusable entry, not an empty session —
  // fail closed to null (drop session, re-auth) instead of '' (audit run-1
  // hardening: make the intent explicit; Number('abc') previously looped zero
  // times and returned '' which supabase-js then failed to JSON.parse).
  const total = Number(count);
  if (!Number.isFinite(total) || total < 0) return null;
  let value = '';
  for (let i = 0; i < total; i++) {
    const chunk = await SecureStore.getItemAsync(chunkKey(key, i)).catch(() => null);
    if (chunk === null) return null; // partial entry is unusable
    value += chunk;
  }
  return value;
}

async function writeChunks(key: string, value: string): Promise<void> {
  const chunks = chunkString(value);
  const previous = await SecureStore.getItemAsync(chunkCountKey(key)).catch(() => null);
  // A shorter re-write (session shrank after token refresh) must not leave
  // stale trailing chunks behind — they'd never be cleaned by removeItem.
  const previousCount = previous !== null ? Number(previous) : 0;
  for (let i = chunks.length; i < previousCount; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
  }
  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
  }
  await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length));
}

async function deleteChunks(key: string): Promise<void> {
  const count = await SecureStore.getItemAsync(chunkCountKey(key)).catch(() => null);
  if (count === null) return;
  for (let i = 0; i < Number(count); i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
  }
  await SecureStore.deleteItemAsync(chunkCountKey(key)).catch(() => {});
}

const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    await migrateLegacySession();
    return readChunks(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    await migrateLegacySession();
    await writeChunks(key, value);
  },

  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(chunkCountKey(key)).catch(() => null);
    if (count === null) return;
    for (let i = 0; i < Number(count); i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
    }
    await SecureStore.deleteItemAsync(chunkCountKey(key)).catch(() => {});
  },
};

// One-time move of the plaintext session (written by older app versions into
// AsyncStorage under supabase-js's default key) into the secure store. Runs
// inside every adapter method BEFORE any read/write so the client's very first
// getItem resolves the migrated session, and so a concurrent setItem can never
// race the copy (both await the same single-flight promise).
let legacyMigration: Promise<void> | null = null;

function migrateLegacySession(): Promise<void> {
  if (Platform.OS === 'web' || !supabaseUrl) return Promise.resolve();
  if (!legacyMigration) {
    legacyMigration = (async () => {
      // Same derivation supabase-js uses for its default storageKey.
      const sessionKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
      const alreadyMigrated = await SecureStore.getItemAsync(chunkCountKey(sessionKey)).catch(
        () => null,
      );
      if (alreadyMigrated !== null) return;
      const raw = await AsyncStorage.getItem(sessionKey).catch(() => null);
      if (raw === null) return;
      await writeChunks(sessionKey, raw);
      await AsyncStorage.removeItem(sessionKey).catch(() => {});
    })().catch(() => {
      // Never let migration trouble break auth: the adapter simply finds no
      // session and the user signs in again.
    });
  }
  return legacyMigration;
}

const authStorage = Platform.OS === 'web' ? AsyncStorage : secureStoreAdapter;

export const supabase = createClient(
  supabaseUrl || 'https://missing-supabase-config.invalid',
  supabaseKey || 'missing-supabase-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
