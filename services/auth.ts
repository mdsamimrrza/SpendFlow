import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { UserProfile } from '@/types';
import { ONBOARDING_CURRENCY_KEY } from '@/constants/app';
import { supabase } from '@/utils/supabase';
import { seedDefaultCategories } from './categories';
import { deleteUserReceipts } from './receipts';
import { ensureUserSettingsBaseline, recordUserSettingsChange } from './settingsHistory';

WebBrowser.maybeCompleteAuthSession();

/**
 * Removes this user's financial data from device storage. Called on sign-out
 * so a shared device never keeps the previous user's expense/account caches on
 * disk. Non-sensitive device preferences (theme, language, biometric flag,
 * onboarding state) are intentionally kept.
 */
async function clearUserCaches(userId: string | null): Promise<void> {
  const keys = ['@spendflow_cached_profile'];
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
  return data;
}

export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return data;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
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

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    throw new Error('Google sign-in was cancelled.');
  }

  const returnedUrl = result.url;

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
  const cachedRaw = await AsyncStorage.getItem('@spendflow_cached_profile').catch(() => null);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as UserProfile;
      if (cached.id === userId) {
        await AsyncStorage.setItem(
          '@spendflow_cached_profile',
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

  const extension = asset.fileName?.split('.').pop()?.toLowerCase() || 'jpg';
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
  // Best-effort removal of the stored avatar objects (per-user folder).
  try {
    const { data } = await supabase.storage.from('avatars').list(user.id, { limit: 100 });
    const files = (data ?? []).map((item) => `${user.id}/${item.name}`);
    if (files.length > 0) await supabase.storage.from('avatars').remove(files);
  } catch {
    // Storage cleanup is best-effort; the URL is cleared below regardless.
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
}

export async function sendEmailChangeOtp(currentEmail: string): Promise<{ rateLimited?: boolean }> {
  return sendDeleteAccountOtp(currentEmail);
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
    const cached = await AsyncStorage.getItem('@spendflow_cached_profile').catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as UserProfile;
      } catch {
        // Ignore JSON error
      }
    }
    throw new Error('No authenticated user found.');
  }

  // When the device is offline the users table cannot be read. Preserve the last
  // locally selected profile values (especially currency) instead of falling back
  // to NPR and visually converting every INR transaction.
  let cachedProfile: UserProfile | null = null;
  const cachedProfileRaw = await AsyncStorage.getItem('@spendflow_cached_profile').catch(() => null);
  if (cachedProfileRaw) {
    try {
      const parsed = JSON.parse(cachedProfileRaw) as UserProfile;
      if (parsed.id === user.id) cachedProfile = parsed;
    } catch {
      // Ignore invalid cached profile data.
    }
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
  await AsyncStorage.setItem('@spendflow_cached_profile', JSON.stringify(result)).catch(() => {});

  // Seed the append-only settings history once so past dates always resolve
  // (best-effort: history failure must never block profile loading)
  void ensureUserSettingsBaseline(user.id, {
    monthly_budget: finalBudget ?? null,
    budget_currency: result.budget_currency,
    cycle_start_day: cycleStartDay,
    cycle_end_day: cycleEndDay,
  }).catch(() => undefined);

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
  const localBudgetCurrencyKey = `@spendflow_budget_currency_${user.id}`;
  if (input.budget_currency !== undefined && input.budget_currency) {
    await AsyncStorage.setItem(localBudgetCurrencyKey, input.budget_currency).catch(() => {});
  }

  // ── Sync cycle window and currency to Supabase Cloud Auth Metadata ──
  // budget_currency goes to metadata (freeform JSON — always accepted), NEVER
  // to the users table: sending a column the remote DB doesn't have makes
  // PostgREST reject the entire row update, which silently rolled back budget
  // saves. The DB column from the migration stays optional.
  await supabase.auth.updateUser({
    data: {
      cycle_start_day: resolvedCycle,
      cycle_end_day: resolvedCycleEnd,
      preferred_currency: resolvedCurrency,
      ...(input.budget_currency !== undefined ? { budget_currency: input.budget_currency } : {}),
    },
  }).catch(() => undefined);

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

    const { data: updated } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', user.id)
      .select('*')
      .single();

    if (updated) {
      dbProfile = updated as UserProfile;

      if (
        input.monthly_budget !== undefined ||
        input.budget_currency !== undefined ||
        input.cycle_start_day !== undefined ||
        input.cycle_end_day !== undefined
      ) {
        // budget_currency lives in AsyncStorage + auth metadata, not users table
        const effectiveBudgetCurrency = input.budget_currency ?? 
          (await AsyncStorage.getItem(`@spendflow_budget_currency_${user.id}`).catch(() => null)) ??
          resolvedCurrency;
        void recordUserSettingsChange(user.id, {
          monthly_budget: dbProfile.monthly_budget ?? null,
          budget_currency: effectiveBudgetCurrency,
          cycle_start_day: resolvedCycle,
          cycle_end_day: resolvedCycleEnd,
        }).catch(() => undefined);
      }
    }
  } catch {
    // Database table column fallback
  }

  const localBudgetRaw = await AsyncStorage.getItem(`@spendflow_monthly_budget_${user.id}`).catch(() => null);
  const localBudget = localBudgetRaw ? Number(localBudgetRaw) : null;

  const localBudgetCurrency = await AsyncStorage.getItem(localBudgetCurrencyKey).catch(() => null);

  // Preserve the budget's own currency when this save didn't touch it —
  // falling back to the display currency here used to silently rewrite
  // budget_currency on every plain currency change, which killed the
  // budget_currency → preferred_currency conversion in getMonthlyBudget.
  let cachedBudgetCurrency: string | null | undefined;
  try {
    const cachedRaw = await AsyncStorage.getItem('@spendflow_cached_profile');
    const cached = cachedRaw ? (JSON.parse(cachedRaw) as UserProfile) : null;
    if (cached?.id === user.id) cachedBudgetCurrency = cached.budget_currency ?? undefined;
  } catch {
    // Ignore invalid cached profile data
  }

  const result: UserProfile = {
    id: user.id,
    email: user.email ?? '',
    display_name: dbProfile?.display_name ?? input.display_name ?? null,
    avatar_url: dbProfile?.avatar_url ?? null,
    preferred_currency: resolvedCurrency,
    theme_preference: dbProfile?.theme_preference ?? input.theme_preference ?? 'system',
    monthly_budget: dbProfile?.monthly_budget ?? input.monthly_budget ?? localBudget,
    budget_currency: input.budget_currency ?? localBudgetCurrency ?? cachedBudgetCurrency ?? resolvedCurrency,
    cycle_start_day: resolvedCycle,
    cycle_end_day: resolvedCycleEnd,
    created_at: dbProfile?.created_at ?? new Date().toISOString(),
    updated_at: dbProfile?.updated_at ?? new Date().toISOString(),
  };

  await AsyncStorage.setItem('@spendflow_cached_profile', JSON.stringify(result)).catch(() => {});
  if (result.monthly_budget !== null && result.monthly_budget !== undefined) {
    await AsyncStorage.setItem(`@spendflow_monthly_budget_${user.id}`, String(result.monthly_budget)).catch(() => {});
  }

  return result;
}

export async function deleteAccount() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // 0. Purge private storage (receipts + avatars) before row deletion
      try {
        await deleteUserReceipts(user.id);
      } catch (e) {
        console.warn('Could not delete receipt files:', e);
      }
      try {
        const { data: avatarFiles } = await supabase.storage.from('avatars').list(user.id, { limit: 100 });
        const files = (avatarFiles ?? []).map((item) => `${user.id}/${item.name}`);
        if (files.length > 0) await supabase.storage.from('avatars').remove(files);
      } catch {
        // best-effort
      }

      // 1. Delete user transactions
      try {
        await supabase.from('expenses').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete expenses:', e);
      }

      // 2. Delete recurring rules
      try {
        await supabase.from('recurring_rules').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete recurring_rules:', e);
      }

      // 2b. Delete transfers, bank accounts, device tokens, notifications and
      // settings history — previously left orphaned after account deletion.
      try {
        await supabase.from('transfers').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete transfers:', e);
      }
      try {
        await supabase.from('bank_accounts').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete bank_accounts:', e);
      }
      try {
        await supabase.from('device_tokens').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete device_tokens:', e);
      }
      try {
        await supabase.from('notifications').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete notifications:', e);
      }
      try {
        await supabase.from('user_settings_history').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete user_settings_history:', e);
      }
      try {
        await supabase.from('category_budget_history').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete category_budget_history:', e);
      }

      // 3. Delete user categories
      try {
        await supabase.from('categories').delete().eq('user_id', user.id);
      } catch (e) {
        console.warn('Could not delete categories:', e);
      }

      // 4. Delete user profile
      try {
        await supabase.from('users').delete().eq('id', user.id);
      } catch (e) {
        console.warn('Could not delete user profile:', e);
      }
    }
  } finally {
    // 5. Clear all local AsyncStorage data completely
    try {
      await AsyncStorage.clear();
    } catch (e) {
      console.warn('AsyncStorage clear error:', e);
    }

    // 6. Sign out from Supabase Auth
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('SignOut error:', e);
    }
  }
}

export async function sendDeleteAccountOtp(email: string): Promise<{ rateLimited?: boolean }> {
  const cleanEmail = email.trim();
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: false,
      },
    });
    if (error) {
      const isRateLimit = error.message?.toLowerCase().includes('rate limit') || (error as any).status === 429;
      if (isRateLimit) {
        return { rateLimited: true };
      }

      // Fallback: retry standard OTP send without shouldCreateUser constraint
      const { error: retryError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
      });
      if (retryError) {
        const isRetryRateLimit = retryError.message?.toLowerCase().includes('rate limit') || (retryError as any).status === 429;
        if (isRetryRateLimit) {
          return { rateLimited: true };
        }
        throw retryError;
      }
    }
    return { rateLimited: false };
  } catch (err: any) {
    const isRateLimit = err?.message?.toLowerCase().includes('rate limit') || err?.status === 429;
    if (isRateLimit) {
      return { rateLimited: true };
    }
    throw err;
  }
}

export async function verifyDeleteAccountOtpAndWipe(email: string, token: string) {
  const cleanEmail = email.trim();
  const cleanToken = token.trim();

  // 1. Try standard email OTP verification
  try {
    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });
    if (!error) {
      await deleteAccount();
      return;
    }
  } catch {
    // Continue fallback
  }

  // 2. Try magiclink verification
  try {
    const { error: recoveryError } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'magiclink',
    });
    if (!recoveryError) {
      await deleteAccount();
      return;
    }
  } catch {
    // Continue fallback
  }

  throw new Error('Invalid or expired OTP code. Please try again.');
}
