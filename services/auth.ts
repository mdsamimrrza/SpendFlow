import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { UserProfile } from '@/types';
import { supabase } from '@/utils/supabase';
import { seedDefaultCategories } from './categories';
import { ensureUserSettingsBaseline, recordUserSettingsChange } from './settingsHistory';

WebBrowser.maybeCompleteAuthSession();

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
  await AsyncStorage.multiRemove([
    '@spendflow_cached_profile',
  ]).catch(() => {});
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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
  const localCurrency = await AsyncStorage.getItem(localCurrencyKey).catch(() => null);
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

  const result: UserProfile = {
    id: user.id,
    email: user.email,
    display_name: dbProfile?.display_name ?? cachedProfile?.display_name ?? (user.user_metadata.display_name as string | undefined) ?? (user.user_metadata.full_name as string | undefined) ?? null,
    avatar_url: dbProfile?.avatar_url ?? cachedProfile?.avatar_url ?? (user.user_metadata.avatar_url as string | undefined) ?? null,
    preferred_currency: localCurrency ?? cachedProfile?.preferred_currency ?? dbProfile?.preferred_currency ?? (user.user_metadata?.preferred_currency as string | undefined) ?? 'NPR',
    theme_preference: dbProfile?.theme_preference ?? cachedProfile?.theme_preference ?? (user.user_metadata?.theme_preference as any) ?? 'system',
    monthly_budget: finalBudget,
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
    cycle_start_day: cycleStartDay,
    cycle_end_day: cycleEndDay,
  }).catch(() => undefined);

  return result;
}

export async function updateProfile(input: Partial<Pick<UserProfile, 'display_name' | 'preferred_currency' | 'theme_preference' | 'monthly_budget' | 'cycle_start_day' | 'cycle_end_day'>>): Promise<UserProfile> {
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

  // ── Sync cycle window and currency to Supabase Cloud Auth Metadata ──
  await supabase.auth.updateUser({
    data: {
      cycle_start_day: resolvedCycle,
      cycle_end_day: resolvedCycleEnd,
      preferred_currency: resolvedCurrency,
    },
  }).catch(() => undefined);

  // cycle_start_day and cycle_end_day now also go to the DB (not stripped)
  const { preferred_currency: _stripCurrency, ...supabaseInput } = input;

  let dbProfile: UserProfile | null = null;
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...supabaseInput,
        cycle_start_day: resolvedCycle,
        cycle_end_day: resolvedCycleEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('*')
      .single();
    if (!error && data) {
      dbProfile = data as UserProfile;
      // Append-only history so past reports can reconstruct the budget/cycle
      // values that were active at the time (deduped against the latest row).
      if (
        input.monthly_budget !== undefined ||
        input.cycle_start_day !== undefined ||
        input.cycle_end_day !== undefined
      ) {
        void recordUserSettingsChange(user.id, {
          monthly_budget: dbProfile.monthly_budget ?? null,
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

  const result: UserProfile = {
    id: user.id,
    email: user.email ?? '',
    display_name: dbProfile?.display_name ?? input.display_name ?? null,
    avatar_url: dbProfile?.avatar_url ?? null,
    preferred_currency: resolvedCurrency,
    theme_preference: dbProfile?.theme_preference ?? input.theme_preference ?? 'system',
    monthly_budget: dbProfile?.monthly_budget ?? input.monthly_budget ?? localBudget,
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
