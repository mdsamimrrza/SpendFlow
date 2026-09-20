import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { UserProfile } from '@/types';
import { CURRENCIES, ONBOARDING_CURRENCY_KEY } from '@/constants/app';
import { supabase } from '@/utils/supabase';
import { beginPendingAuthFlow, endPendingAuthFlow, isTrustedAuthUrl } from '@/utils/authFlow';
import { seedDefaultCategories } from './categories';
import { ensureUserSettingsBaseline, recordUserSettingsChange } from './settingsHistory';
import { savePasswordToManager } from '@/utils/credentialManager';

WebBrowser.maybeCompleteAuthSession();

/**
 * The cached profile is keyed per user so account switching on a shared
 * device can never paint the previous user's identity/budget. All reads pass
 * through this key. Migration: the legacy global key is consumed (adopted if
 * it matches the current user, then removed) on first read.
 */
const PROFILE_CACHE_PREFIX = '@spendflow_cached_profile_';
const LEGACY_PROFILE_CACHE_KEY = '@spendflow_cached_profile';

function profileCacheKey(userId: string): string {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

/** One-time migration from the pre-multi-user global key. Returns the stored profile ONLY if it belongs to userId. */
async function readLegacyProfileIfOwned(userId: string): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_PROFILE_CACHE_KEY).catch(() => null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    await AsyncStorage.removeItem(LEGACY_PROFILE_CACHE_KEY).catch(() => {});
    return parsed?.id === userId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Removes this user's financial data from device storage. Called on sign-out
 * so a shared device never keeps the previous user's expense/account caches on
 * disk. Non-sensitive device preferences (theme, language, biometric flag,
 * onboarding state) are intentionally kept.
 */
async function clearUserCaches(userId: string | null): Promise<void> {
  // Also remove the legacy pre-multi-user global profile key.
  const keys = [LEGACY_PROFILE_CACHE_KEY];
  if (userId) {
    keys.push(
      `${'@spendflow_expense_cache_'}${userId}`,
      `${'@spendflow_cached_accounts_'}${userId}`,
      `${'@spendflow_cached_transfers_'}${userId}`,
      `${'@spendflow_cached_recurring_rules_'}${userId}`,
      `${'@spendflow_categories_'}${userId}`,
      `@spendflow_monthly_budget_${userId}`,
      `@spendflow_budget_currency_${userId}`,
      `@spendflow_currency_${userId}`,
      `@spendflow_cycle_start_day_${userId}`,
      `@spendflow_cycle_end_day_${userId}`,
      `@spendflow_accounts_seeded_${userId}`,
    );
  }
  await AsyncStorage.multiRemove(keys).catch(() => {});
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  // Offer to save password to system password manager (Google Password Manager, Bitwarden, etc.)
  // Fire-and-forget: don't block auth flow if the prompt fails or user cancels
  void savePasswordToManager(email, password).catch(() => undefined);

  return data;
}

export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;

  // Offer to save password to system password manager (Google Password Manager, Bitwarden, etc.)
  // Fire-and-forget: don't block auth flow if the prompt fails or user cancels
  void savePasswordToManager(email, password).catch(() => undefined);

  return data;
}

export type ResetOutcome = 'sent' | 'no_account' | 'cooldown' | 'invalid' | 'failed';

/**
 * Forgot-password request via the send-password-reset Edge Function
 * (2026-09-15). The broker answers whether the account exists (owner-requested
 * UX), enforces a DB-backed 60s cooldown per email for found AND not-found
 * attempts alike, and only then sends the recovery mail. Redirect targets:
 * spendflow://callback on native (AuthContext's deep-link listener consumes
 * the recovery session and raises the set-new-password prompt) or the caller's
 * own origin + /auth/callback on the web export — GoTrue's URL allowlist stays
 * the second gate, so a spoofed origin can never capture a link.
 */
export async function resetPassword(email: string): Promise<ResetOutcome> {
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
  const body = isWeb
    ? { email, channel: 'web', origin: window.location.origin }
    : { email, channel: 'native' };
  const { data, error } = await supabase.functions.invoke('send-password-reset', { body });
  if (error) return 'failed';
  const res = data as { success?: boolean; code?: string } | null;
  if (res?.success) return 'sent';
  switch (res?.code) {
    case 'no_account':
      return 'no_account';
    case 'cooldown_active':
      return 'cooldown';
    case 'invalid_email':
      return 'invalid';
    default:
      return 'failed';
  }
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) throw error;
    // The page is about to leave for the IdP and come back on OUR origin with
    // a code/hash; the returning callback (AuthContext listener) must be able
    // to prove this client started the flow even across the page reload.
    await beginPendingAuthFlow();
    return data;
  }

  const redirectTo = AuthSession.makeRedirectUri({ scheme: 'spendflow' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in could not start.');

  await beginPendingAuthFlow();
  try {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') {
      throw new Error('Google sign-in was cancelled.');
    }

    const returnedUrl = result.url;
    // On Android the pinned expo-web-browser polyfill resolves on a bare
    // 'spendflow://' prefix match against ANY Linking url event — another app
    // can deliver 'spendflow://probe#...' mid-flow. Apply the same trust gate
    // the deep-link door uses before reading tokens out of the result URL.
    if (!isTrustedAuthUrl(returnedUrl)) {
      throw new Error('Google sign-in returned an untrusted redirect.');
    }

    // 1. Check hash fragment (Implicit token flow)
    const hashMatch = returnedUrl.match(/#(.+)/);
    if (hashMatch) {
      const hashParams = new URLSearchParams(hashMatch[1]);
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      if (access_token && refresh_token) {
        const sessionResult = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionResult.error) throw sessionResult.error;
        return sessionResult.data;
      }
    }

    // 2. Check query params (Authorization code flow)
    const queryMatch = returnedUrl.match(/\?([^#]+)/);
    if (queryMatch) {
      const queryParams = new URLSearchParams(queryMatch[1]);
      const code = queryParams.get('code');
      if (code) {
        const exchanged = await supabase.auth.exchangeCodeForSession(code);
        if (exchanged.error) throw exchanged.error;
        return exchanged.data;
      }
    }

    // 3. Check if session was already set
    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession?.session) {
      return currentSession;
    }

    throw new URLSearchParams(returnedUrl).get('error_description')
      ? new Error(new URLSearchParams(returnedUrl).get('error_description')!)
      : new Error('Google sign-in did not return authentication tokens.');
  } finally {
    endPendingAuthFlow();
  }
}

/**
 * Native Sign in with Apple (iOS 13+, required alongside Google sign-in by
 * App Store Guideline 4.8). Apple's ASAuthorization issues an identity JWT
 * that Supabase verifies via signInWithIdToken — no browser redirect
 * round-trip like Google. A random nonce is hashed with SHA-256 and handed
 * to Apple; the RAW nonce goes to Supabase, which re-hashes and compares it
 * against the nonce embedded in the JWT (replay protection).
 */
export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only available on iOS.');
  }

  const rawNonce = Array.from(Crypto.getRandomBytes(32))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Apple sign-in was cancelled.');
    }
    throw err;
  }

  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  // Apple only ever reveals the real name on the FIRST authorization —
  // persist it immediately or it is lost forever.
  const fullName = [
    credential.fullName?.givenName,
    credential.fullName?.familyName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fullName) {
    await supabase.auth
      .updateUser({ data: { display_name: fullName } })
      .catch(() => undefined);
  }

  return data;
}

export async function signOut() {
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  await clearUserCaches(user?.id ?? null);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signOutAllDevices() {
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  await clearUserCaches(user?.id ?? null);
  // scope 'global' revokes every refresh token issued for this account,
  // signing this device AND any other device out of Supabase Auth.
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) throw error;
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  // Remove possible data URL prefix (e.g. data:image/jpeg;base64,)
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function persistAvatarUrl(userId: string, avatarUrl: string | null) {
  try {
    await supabase
      .from('users')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch {
    // users table fallback — auth metadata below still carries the URL
  }

  // Metadata syncs the avatar across every device of the account
  await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } }).catch(() => undefined);

  // Merge into the cached profile so the next cold start shows the new avatar
  const cachedRaw = await AsyncStorage.getItem(profileCacheKey(userId)).catch(() => null);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as UserProfile;
      if (cached.id === userId) {
        await AsyncStorage.setItem(
          profileCacheKey(userId),
          JSON.stringify({ ...cached, avatar_url: avatarUrl }),
        ).catch(() => {});
      }
    } catch {
      // Ignore invalid cached profile data
    }
  }
}

export async function uploadAvatar(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  base64?: string | null;
}): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user found.');

  // Match the avatars bucket's server-side limits (2 MiB, image MIME only —
  // see 20260908000000_security_hardening.sql) so oversized/invalid files
  // fail fast client-side with a clear message instead of a bucket error.
  const normalizedMime = asset.mimeType?.toLowerCase().split(';')[0] ?? null;
  const avatarMimes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  if (normalizedMime && !avatarMimes.has(normalizedMime)) {
    throw new Error('Profile photo must be an image (JPEG, PNG, WebP or HEIC).');
  }
  if (asset.base64) {
    const encoded = asset.base64.includes(',') ? asset.base64.split(',')[1] : asset.base64;
    if (Math.floor(encoded.length * 0.75) > 2 * 1024 * 1024) {
      throw new Error('Profile photo is too large (max 2 MB).');
    }
  }

  // Strict extension allowlist (mirrors sanitizeExtension in receipts.ts):
  // the extension becomes part of the storage path, so a crafted filename
  // like "avatar.php" must never reach it.
  const rawExt = asset.fileName?.split('.').pop()?.toLowerCase() ?? '';
  const extension = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(rawExt) ? rawExt : 'jpg';
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;
  const contentType = asset.mimeType || (extension === 'png' ? 'image/png' : 'image/jpeg');

  let fileData: ArrayBuffer | Blob;
  if (asset.base64) {
    // 1. base64 already provided by ImagePicker
    fileData = decodeBase64ToArrayBuffer(asset.base64);
  } else if (Platform.OS === 'web') {
    // 2. Web browser: fetch blob
    const response = await fetch(asset.uri);
    fileData = await response.blob();
  } else {
    // 3. Android / iOS: read local file URI
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
    fileData = decodeBase64ToArrayBuffer(base64);
  }

  // The avatars bucket is the only target. The old fallback into the public
  // `receipts` bucket was removed — that bucket is now private and its
  // objects can no longer be served via public URLs.
  const { error } = await supabase.storage.from('avatars').upload(path, fileData, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Avatar upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = data.publicUrl;

  await persistAvatarUrl(user.id, publicUrl);
  return publicUrl;
}

export async function removeAvatar(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user found.');

  // Storage first — the DB/auth reference is only cleared when the objects are
  // verifiably gone (converging pagination: re-list until the folder is empty).
  // If storage deletion fails we throw, so the profile never claims the photo
  // was removed while the object still exists in the public avatars bucket.
  for (let round = 0; round < 50; round++) {
    const { data: files, error: listError } = await supabase.storage
      .from('avatars')
      .list(user.id, { limit: 100 });
    if (listError) throw new Error('Could not remove the profile photo. Please try again.');
    const names = (files ?? []).map((item) => `${user.id}/${item.name}`);
    if (names.length === 0) break;

    const { error: removeError } = await supabase.storage.from('avatars').remove(names);
    if (removeError) throw new Error('Could not remove the profile photo. Please try again.');

    if (names.length < 100) {
      const { data: recheck } = await supabase.storage.from('avatars').list(user.id, { limit: 1 });
      if (!recheck || recheck.length === 0) break;
    }
  }

  await persistAvatarUrl(user.id, null);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('No authenticated user found.');

  // Verify the current password first — updateUser({ password }) alone would
  // let any unlocked device silently reset the credential.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    throw new Error(verifyError.message === 'Invalid login credentials'
      ? 'Current password is incorrect.'
      : verifyError.message);
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;

  // Offer to update the saved password in system password manager
  void savePasswordToManager(user.email, newPassword).catch(() => undefined);
}

export async function sendEmailChangeOtp(currentEmail: string): Promise<{ rateLimited?: boolean }> {
  return sendDeleteAccountOtp(currentEmail, 'email_change');
}

async function applyEmailChange(newEmail: string): Promise<{ confirmationPending: boolean }> {
  const { data, error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  if (error) throw error;
  // When "Confirm email changes" is enabled server-side, Supabase keeps the
  // old address active and reports the pending one via new_email.
  const confirmationPending = Boolean((data.user as { new_email?: string } | null)?.new_email);
  return { confirmationPending };
}

/**
 * Two-step email change: an OTP is first sent to the CURRENT address and must
 * be verified here before the new address is submitted to Supabase. Only after
 * the owner proves control of the old inbox does updateUser({ email }) run.
 */
export async function verifyEmailChangeOtpAndChangeEmail(
  currentEmail: string,
  token: string,
  newEmail: string,
): Promise<{ confirmationPending: boolean }> {
  const cleanEmail = currentEmail.trim();
  const cleanToken = token.trim();

  // 1. Standard email OTP verification
  try {
    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });
    if (!error) {
      return await applyEmailChange(newEmail);
    }
  } catch {
    // Continue fallback
  }

  // 2. Magiclink verification fallback
  try {
    const { error: recoveryError } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'magiclink',
    });
    if (!recoveryError) {
      return await applyEmailChange(newEmail);
    }
  } catch {
    // Continue fallback
  }

  throw new Error('Invalid or expired OTP code. Please try again.');
}


export async function ensureProfile(): Promise<UserProfile> {
  // Check active session first to avoid network 403 Forbidden errors when logged out
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const user = sessionData?.session?.user;

  if (!user || !user.email) {
    if (!user) throw new Error('No authenticated user found.');
    // Session without email (rare) — serve only this user's own cached profile.
    const cached = await AsyncStorage.getItem(profileCacheKey(user.id)).catch(() => null);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as UserProfile;
        if (parsed?.id === user.id) return parsed;
      } catch {
        // Ignore JSON error
      }
    }
    const legacy = await readLegacyProfileIfOwned(user.id);
    if (legacy) return legacy;
    throw new Error('No authenticated user found.');
  }

  // When the device is offline the users table cannot be read. Preserve the last
  // locally selected profile values (especially currency) instead of falling back
  // to NPR and visually converting every INR transaction.
  let cachedProfile: UserProfile | null = null;
  const cachedProfileRaw = await AsyncStorage.getItem(profileCacheKey(user.id)).catch(() => null);
  if (cachedProfileRaw) {
    try {
      const parsed = JSON.parse(cachedProfileRaw) as UserProfile;
      if (parsed.id === user.id) cachedProfile = parsed;
    } catch {
      // Ignore invalid cached profile data.
    }
  }
  if (!cachedProfile) {
    cachedProfile = await readLegacyProfileIfOwned(user.id);
  }

  let dbProfile: UserProfile | null = null;
  try {
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (existing) {
      dbProfile = existing as UserProfile;
    } else {
      const profilePayload = {
        id: user.id,
        email: user.email,
        display_name: (user.user_metadata.display_name as string | undefined) ?? (user.user_metadata.full_name as string | undefined) ?? null,
        avatar_url: (user.user_metadata.avatar_url as string | undefined) ?? null,
        monthly_budget: null,
      };

      const { data: upsertedData } = await supabase
        .from('users')
        .upsert(profilePayload, { onConflict: 'id' })
        .select('*')
        .single();
      if (upsertedData) dbProfile = upsertedData as UserProfile;
    }
  } catch {
    // Offline or table fallback
  }

  await seedDefaultCategories(user.id).catch(() => []);

  // ── Device-local currency (per-device, never synced to Supabase) ──────────
  const localCurrencyKey = `@spendflow_currency_${user.id}`;
  let localCurrency = await AsyncStorage.getItem(localCurrencyKey).catch(() => null);
  // First login from this device: adopt the currency chosen during onboarding
  // so the country picked before signing up sticks for this device.
  if (!localCurrency) {
    const onboardingCurrency = await AsyncStorage.getItem(ONBOARDING_CURRENCY_KEY).catch(() => null);
    if (onboardingCurrency) {
      localCurrency = onboardingCurrency;
      await AsyncStorage.setItem(localCurrencyKey, onboardingCurrency).catch(() => {});
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // 1. Check user_metadata (Supabase Auth cloud metadata synced on every device)
  const metaBudgetRaw = user.user_metadata?.monthly_budget;
  const metaBudget = metaBudgetRaw !== undefined && metaBudgetRaw !== null && Number(metaBudgetRaw) > 0
    ? Number(metaBudgetRaw)
    : null;

  // 2. Check local budget cache
  const localBudgetRaw = await AsyncStorage.getItem(`@spendflow_monthly_budget_${user.id}`).catch(() => null);
  const localBudget = localBudgetRaw ? Number(localBudgetRaw) : null;

  // 3. Resolve authoritative budget (DB > Auth Metadata > Local Cache)
  const finalBudget = dbProfile?.monthly_budget !== undefined && dbProfile?.monthly_budget !== null && Number(dbProfile.monthly_budget) > 0
    ? Number(dbProfile.monthly_budget)
    : metaBudget !== null
    ? metaBudget
    : localBudget;

  if (finalBudget !== null && finalBudget !== undefined && finalBudget > 0) {
    await AsyncStorage.setItem(`@spendflow_monthly_budget_${user.id}`, String(finalBudget)).catch(() => {});
  }

  // ── Month-cycle window (local storage + cloud metadata fallback) ──
  const cycleKey = `@spendflow_cycle_start_day_${user.id}`;
  const cycleEndKey = `@spendflow_cycle_end_day_${user.id}`;
  const localCycleRaw = await AsyncStorage.getItem(cycleKey).catch(() => null);
  const localCycleEndRaw = await AsyncStorage.getItem(cycleEndKey).catch(() => null);
  const metaCycleStart = user.user_metadata?.cycle_start_day;
  const metaCycleEnd = user.user_metadata?.cycle_end_day;
  const dbCycle = dbProfile?.cycle_start_day ?? metaCycleStart;
  const cycleStartDay = Number(localCycleRaw) > 0
    ? Number(localCycleRaw)
    : Number(dbCycle) > 0
    ? Number(dbCycle)
    : 1;
  const localCycleEnd = Number(localCycleEndRaw);
  const dbCycleEnd = Number(dbProfile?.cycle_end_day ?? metaCycleEnd);
  const cycleEndDay = localCycleEnd >= 1 && localCycleEnd <= 31
    ? localCycleEnd
    : dbCycleEnd >= 1 && dbCycleEnd <= 31
    ? dbCycleEnd
    : null;

  const resolvedPreferredCurrency = localCurrency ?? cachedProfile?.preferred_currency ?? dbProfile?.preferred_currency ?? (user.user_metadata?.preferred_currency as string | undefined) ?? 'NPR';
  const result: UserProfile = {
    id: user.id,
    email: user.email,
    display_name: dbProfile?.display_name ?? cachedProfile?.display_name ?? (user.user_metadata.display_name as string | undefined) ?? (user.user_metadata.full_name as string | undefined) ?? null,
    avatar_url: dbProfile?.avatar_url ?? cachedProfile?.avatar_url ?? (user.user_metadata.avatar_url as string | undefined) ?? null,
    preferred_currency: resolvedPreferredCurrency,
    theme_preference: dbProfile?.theme_preference ?? cachedProfile?.theme_preference ?? (user.user_metadata?.theme_preference as any) ?? 'system',
    monthly_budget: finalBudget,
    budget_currency: dbProfile?.budget_currency ?? cachedProfile?.budget_currency ?? (user.user_metadata?.budget_currency as string | undefined) ?? resolvedPreferredCurrency,
    cycle_start_day: cycleStartDay,
    cycle_end_day: cycleEndDay,
    created_at: dbProfile?.created_at ?? new Date().toISOString(),
    updated_at: dbProfile?.updated_at ?? new Date().toISOString(),
  };

  // Cache latest profile
  await AsyncStorage.setItem(profileCacheKey(result.id), JSON.stringify(result)).catch(() => {});

  // Seed the append-only settings history once so past dates always resolve
  // (best-effort: history failure must never block profile loading)
  void ensureUserSettingsBaseline(user.id, {
    monthly_budget: finalBudget ?? null,
    budget_currency: result.budget_currency,
    cycle_start_day: cycleStartDay,
    cycle_end_day: cycleEndDay,
  // audit run-1: best-effort (never blocks profile load) but a swallowed
  // failure silently degrades the append-only audit trail — log it.
  }).catch((error: unknown) => {
    console.warn('[settings-history] baseline seed failed:', error instanceof Error ? error.message : error);
  });

  return result;
}

export async function updateProfile(input: Partial<Pick<UserProfile, 'display_name' | 'preferred_currency' | 'theme_preference' | 'monthly_budget' | 'budget_currency' | 'cycle_start_day' | 'cycle_end_day'>>): Promise<UserProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user found.');

  if (input.monthly_budget !== undefined) {
    if (input.monthly_budget === null || input.monthly_budget <= 0) {
      await AsyncStorage.removeItem(`@spendflow_monthly_budget_${user.id}`).catch(() => {});
    } else {
      await AsyncStorage.setItem(`@spendflow_monthly_budget_${user.id}`, String(input.monthly_budget)).catch(() => {});
    }
  }

  // ── Month-cycle window is device-local (start 1–31; end 1–31 or null = dynamic last day) ──
  const cycleKey = `@spendflow_cycle_start_day_${user.id}`;
  const cycleEndKey = `@spendflow_cycle_end_day_${user.id}`;
  if (input.cycle_start_day !== undefined) {
    const day = Number(input.cycle_start_day);
    if (!day || day < 2 || day > 31) {
      await AsyncStorage.removeItem(cycleKey).catch(() => {});
    } else {
      await AsyncStorage.setItem(cycleKey, String(day)).catch(() => {});
    }
  }
  if (input.cycle_end_day !== undefined) {
    const end = input.cycle_end_day;
    if (end == null || !(end >= 1 && end <= 31)) {
      await AsyncStorage.removeItem(cycleEndKey).catch(() => {});
    } else {
      await AsyncStorage.setItem(cycleEndKey, String(end)).catch(() => {});
    }
  }
  const storedStartRaw = await AsyncStorage.getItem(cycleKey).catch(() => null);
  const storedEndRaw = await AsyncStorage.getItem(cycleEndKey).catch(() => null);
  const resolvedCycle = Number(storedStartRaw) >= 2 && Number(storedStartRaw) <= 31 ? Number(storedStartRaw) : 1;
  const resolvedCycleEndRaw = Number(storedEndRaw);
  const resolvedCycleEnd = resolvedCycleEndRaw >= 1 && resolvedCycleEndRaw <= 31 ? resolvedCycleEndRaw : null;

  // ── Currency is device-local — save to local key, never sync to Supabase ──
  const localCurrencyKey = `@spendflow_currency_${user.id}`;
  if (input.preferred_currency !== undefined) {
    await AsyncStorage.setItem(localCurrencyKey, input.preferred_currency).catch(() => {});
  }
  const resolvedCurrency = input.preferred_currency
    ?? (await AsyncStorage.getItem(localCurrencyKey).catch(() => null))
    ?? 'NPR';

  // ── Budget currency travels with the budget figure (device-local mirror) ──
  // audit run-1: user_metadata is freeform JSON that escapes every DB CHECK —
  // and user_settings_history.budget_currency's ^[A-Z]{3}$ rule rejects
  // divergent codes, silently stalling the append-only audit. Normalize to a
  // supported CURRENCIES code (upper-case) before ANY of the three stores
  // (mirror, metadata, history) sees it; clear the mirror on the null path so
  // a removed budget cannot resurrect a stale currency.
  const localBudgetCurrencyKey = `@spendflow_budget_currency_${user.id}`;
  const budgetCurrencyNormalized =
    input.budget_currency === undefined
      ? undefined
      : (CURRENCIES as readonly string[]).includes(String(input.budget_currency).trim().toUpperCase())
        ? String(input.budget_currency).trim().toUpperCase()
        : null;
  if (budgetCurrencyNormalized !== undefined) {
    if (budgetCurrencyNormalized === null) {
      await AsyncStorage.removeItem(localBudgetCurrencyKey).catch(() => {});
    } else {
      await AsyncStorage.setItem(localBudgetCurrencyKey, budgetCurrencyNormalized).catch(() => {});
    }
  }

  // ── Sync cycle window and currency to Supabase Cloud Auth Metadata ──
  // metadata stays a durable cross-device mirror (freeform JSON — always
  // accepted); the users-table column (migration 20260916180000) is the
  // queryable source of truth. DB reads it first, metadata second.
  await supabase.auth.updateUser({
    data: {
      cycle_start_day: resolvedCycle,
      cycle_end_day: resolvedCycleEnd,
      preferred_currency: resolvedCurrency,
      ...(budgetCurrencyNormalized !== undefined ? { budget_currency: budgetCurrencyNormalized } : {}),
    },
  }).catch(() => undefined);

  // Effective budget currency for THIS save, in priority order: caller's
  // change → device mirror → last-known profile cache → display currency
  // (only when no budget has ever carried its own currency). The same value
  // is written to the users table AND the settings-history append so the
  // stores can never disagree — a plain display-currency change must NOT
  // rewrite the budget's own currency (getMonthlyBudget converts from it).
  let cachedBudgetCurrency: string | null | undefined;
  try {
    const cachedRaw = await AsyncStorage.getItem(profileCacheKey(user.id));
    const cached = cachedRaw ? (JSON.parse(cachedRaw) as UserProfile) : null;
    if (cached?.id === user.id) cachedBudgetCurrency = cached.budget_currency ?? undefined;
  } catch {
    // Ignore invalid cached profile data
  }
  const localBudgetCurrency = await AsyncStorage.getItem(localBudgetCurrencyKey).catch(() => null);
  const effectiveBudgetCurrency =
    budgetCurrencyNormalized ?? localBudgetCurrency ?? cachedBudgetCurrency ?? resolvedCurrency;

  // cycle_start_day and cycle_end_day now also go to the DB (not stripped)
  let dbProfile: UserProfile | null = null;
  try {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (input.display_name !== undefined) updatePayload.display_name = input.display_name;
    if (input.theme_preference !== undefined) updatePayload.theme_preference = input.theme_preference;
    if (input.monthly_budget !== undefined) updatePayload.monthly_budget = input.monthly_budget;
    if (input.preferred_currency !== undefined) updatePayload.preferred_currency = input.preferred_currency;
    if (input.cycle_start_day !== undefined) updatePayload.cycle_start_day = resolvedCycle;
    if (input.cycle_end_day !== undefined) updatePayload.cycle_end_day = resolvedCycleEnd;
    if (input.monthly_budget !== undefined || input.budget_currency !== undefined) {
      updatePayload.budget_currency = effectiveBudgetCurrency;
    }

    let { data: updated, error: updateError } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', user.id)
      .select('*')
      .single();

    if (updateError && /budget_currency/i.test(updateError.message)) {
      // Migration not applied on this remote yet — an unknown column rejects
      // the ENTIRE row. Retry without it so budget saves never roll back.
      delete updatePayload.budget_currency;
      ({ data: updated } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', user.id)
        .select('*')
        .single());
    }

    if (updated) {
      dbProfile = updated as UserProfile;

      if (
        input.monthly_budget !== undefined ||
        input.budget_currency !== undefined ||
        input.cycle_start_day !== undefined ||
        input.cycle_end_day !== undefined
      ) {
        void recordUserSettingsChange(user.id, {
          monthly_budget: dbProfile.monthly_budget ?? null,
          budget_currency: effectiveBudgetCurrency,
          cycle_start_day: resolvedCycle,
          cycle_end_day: resolvedCycleEnd,
        // audit run-1: still non-blocking, but a rejected append silently kills
        // the "one row per real change" P&L guarantee — surface it to logs.
        }).catch((error: unknown) => {
          console.warn('[settings-history] change append failed:', error instanceof Error ? error.message : error);
        });
      }
    }
  } catch {
    // Database table column fallback
  }

  const localBudgetRaw = await AsyncStorage.getItem(`@spendflow_monthly_budget_${user.id}`).catch(() => null);
  const localBudget = localBudgetRaw ? Number(localBudgetRaw) : null;

  const result: UserProfile = {
    id: user.id,
    email: user.email ?? '',
    display_name: dbProfile?.display_name ?? input.display_name ?? null,
    avatar_url: dbProfile?.avatar_url ?? null,
    preferred_currency: resolvedCurrency,
    theme_preference: dbProfile?.theme_preference ?? input.theme_preference ?? 'system',
    monthly_budget: dbProfile?.monthly_budget ?? input.monthly_budget ?? localBudget,
    budget_currency: effectiveBudgetCurrency,
    cycle_start_day: resolvedCycle,
    cycle_end_day: resolvedCycleEnd,
    created_at: dbProfile?.created_at ?? new Date().toISOString(),
    updated_at: dbProfile?.updated_at ?? new Date().toISOString(),
  };

  await AsyncStorage.setItem(profileCacheKey(result.id), JSON.stringify(result)).catch(() => {});
  if (result.monthly_budget !== null && result.monthly_budget !== undefined) {
    await AsyncStorage.setItem(`@spendflow_monthly_budget_${user.id}`, String(result.monthly_budget)).catch(() => {});
  }

  return result;
}

/**
 * Deterministic account deletion.
 *
 * The trusted `delete-account` Edge Function is the SOLE deletion orchestrator:
 * it verifies the caller's JWT, requires that JWT to be FRESH (minted by the
 * OTP verification within its short window — a long-lived session cannot
 * delete the account), removes every user-owned row in one transactional RPC,
 * purges receipts/{uid}/** and avatars/{uid}/** from storage (paginated,
 * fail-closed), and deletes the Auth identity LAST.
 *
 * The client only requests deletion and reacts to the verified result:
 *   - success  → clear local caches, sign out (the UI then shows success)
 *   - anything else → throw with a clear message. NOTHING is deleted locally
 *     on failure — no row deletes, no storage deletes, no sign-out, no success
 *     UI. The account stays fully intact and the flow is retryable.
 *
 * @param otpFreshToken Access token minted by the just-completed OTP verify.
 *   Falls back to the current session ONLY when the caller is the OTP flow's
 *   legacy path; the Edge Function still rejects stale tokens regardless.
 */
export async function deleteAccount(otpFreshToken?: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user found.');

  let accessToken = otpFreshToken;
  if (!accessToken) {
    const { data: sessionData } = await supabase.auth.getSession().catch(() => ({
      data: { session: null as null },
    }));
    accessToken = sessionData.session?.access_token;
  }
  if (!accessToken) {
    throw new Error('Your session has expired. Please sign in again and retry the deletion.');
  }

  const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`;

  // No user_id is sent — the Edge Function derives the target exclusively
  // from the authenticated JWT (self-delete only by construction).
  let ok = false;
  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.ok) {
      const result = (await res.json().catch(() => null)) as { success?: boolean } | null;
      ok = result?.success === true;
    }
  } catch {
    // Network-level failure — nothing happened on the server; retry is safe.
    ok = false;
  }

  if (!ok) {
    throw new Error(
      'Account deletion could not be completed. Nothing was deleted. Please try again.',
    );
  }

  // Verified server-side success → clear ALL local state and sign out.
  try {
    await AsyncStorage.clear();
  } catch (e) {
    console.warn('AsyncStorage clear error:', e);
  }
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('SignOut error:', e);
  }
}

/**
 * Sends the security-OTP email (account deletion / email change) through the
 * send-security-otp Edge Function instead of calling signInWithOtp directly.
 *
 * Server-side guarantees the direct call lacked:
 *   - per-user, per-purpose 60s cooldown in the database (send-spam/cost
 *     protection — verify-attempt limits only protect the code, not the send)
 *   - recipient resolved from the caller's JWT, so a client can never make
 *     the server email arbitrary addresses
 *
 * Still surfaces Supabase's own hosted rate limit (429 → rateLimited) when
 * the project-wide OTP budget is exhausted.
 */
export async function sendDeleteAccountOtp(
  email: string,
  purpose: 'account_deletion' | 'email_change' = 'account_deletion',
): Promise<{ rateLimited?: boolean }> {
  void email; // recipient is resolved server-side from the session; kept for API compat

  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({
    data: { session: null as null },
  }));
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-security-otp`;
  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ purpose }),
    });

    if (res.status === 429) {
      return { rateLimited: true };
    }
    if (!res.ok) {
      const result = (await res.json().catch(() => null)) as { error?: string } | null;
      if (result?.error === 'cooldown_active') {
        return { rateLimited: true };
      }
      throw new Error('Failed to send the security code. Please try again.');
    }
    return { rateLimited: false };
  } catch (err) {
    if (err instanceof Error && /session has expired/i.test(err.message)) throw err;
    throw new Error('Failed to send the security code. Please try again.');
  }
}

export async function verifyDeleteAccountOtpAndWipe(email: string, token: string) {
  const cleanEmail = email.trim();
  const cleanToken = token.trim();

  // Once an OTP verify SUCCEEDS, any later failure is a deletion failure and
  // must propagate as-is — falling through to the second verify attempt would
  // burn the already-consumed code and surface a misleading "invalid OTP".
  // The flag distinguishes verify-level failures (fall through, second method
  // is legitimately retryable with the same code) from post-verify failures
  // (throw, no retry loop). Network/auth errors inside deleteAccount therefore
  // surface honestly instead of being masked as bad codes.
  let otpVerified = false;

  // 1. Try standard email OTP verification
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });
    if (!error) {
      otpVerified = true;
      // The OTP verification mints a FRESH session — its access token is the
      // proof-of-OTP the Edge Function requires (it rejects tokens whose amr
      // shows no recent OTP verification). A pre-existing stolen session
      // cannot pass that check, so the deletion gate is enforced server-side.
      const freshToken = data.session?.access_token;
      if (!freshToken) {
        // No session minted (e.g. verifyOtp config returns sessionless) —
        // refuse to proceed: the server would reject the stale token anyway.
        throw new Error('Verification did not produce a session. Please try again.');
      }
      await deleteAccount(freshToken);
      return;
    }
  } catch (err) {
    if (otpVerified) throw err; // post-verify failure — propagate honestly
  }

  // 2. Try magiclink verification (only reached when the email verify itself
  // failed — a genuine wrong/expired code).
  otpVerified = false;
  try {
    const { data, error: recoveryError } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'magiclink',
    });
    if (!recoveryError) {
      otpVerified = true;
      const freshToken = data.session?.access_token;
      if (!freshToken) {
        throw new Error('Verification did not produce a session. Please try again.');
      }
      await deleteAccount(freshToken);
      return;
    }
  } catch (err) {
    if (otpVerified) throw err; // post-verify failure — propagate honestly
  }

  throw new Error('Invalid or expired OTP code. Please try again.');
}
