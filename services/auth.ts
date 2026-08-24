import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { UserProfile } from '@/types';
import { supabase } from '@/utils/supabase';
import { seedDefaultCategories } from './categories';

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

  // Check local budget cache
  const localBudgetRaw = await AsyncStorage.getItem(`@spendflow_monthly_budget_${user.id}`).catch(() => null);
  const localBudget = localBudgetRaw ? Number(localBudgetRaw) : null;

  const finalBudget = dbProfile?.monthly_budget !== undefined && dbProfile?.monthly_budget !== null
    ? Number(dbProfile.monthly_budget)
    : localBudget;

  if (finalBudget !== null && finalBudget !== undefined) {
    await AsyncStorage.setItem(`@spendflow_monthly_budget_${user.id}`, String(finalBudget)).catch(() => {});
  }

  const result: UserProfile = {
    id: user.id,
    email: user.email,
    display_name: dbProfile?.display_name ?? (user.user_metadata.display_name as string | undefined) ?? (user.user_metadata.full_name as string | undefined) ?? null,
    avatar_url: dbProfile?.avatar_url ?? (user.user_metadata.avatar_url as string | undefined) ?? null,
    preferred_currency: dbProfile?.preferred_currency ?? 'NPR',
    theme_preference: dbProfile?.theme_preference ?? 'system',
    monthly_budget: finalBudget,
    created_at: dbProfile?.created_at ?? new Date().toISOString(),
    updated_at: dbProfile?.updated_at ?? new Date().toISOString(),
  };

  // Cache latest profile
  await AsyncStorage.setItem('@spendflow_cached_profile', JSON.stringify(result)).catch(() => {});

  return result;
}

export async function updateProfile(input: Partial<Pick<UserProfile, 'display_name' | 'preferred_currency' | 'theme_preference' | 'monthly_budget'>>): Promise<UserProfile> {
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

  let dbProfile: UserProfile | null = null;
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('*')
      .single();
    if (!error && data) dbProfile = data as UserProfile;
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
    preferred_currency: dbProfile?.preferred_currency ?? input.preferred_currency ?? 'NPR',
    theme_preference: dbProfile?.theme_preference ?? input.theme_preference ?? 'system',
    monthly_budget: dbProfile?.monthly_budget ?? input.monthly_budget ?? localBudget,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user found.');

  await supabase.from('expenses').delete().eq('user_id', user.id);
  await supabase.from('categories').delete().eq('user_id', user.id);
  await supabase.from('recurring_rules').delete().eq('user_id', user.id);
  await supabase.from('users').delete().eq('id', user.id);
  await supabase.auth.signOut();
}
