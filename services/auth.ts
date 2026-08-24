import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { UserProfile } from '@/types';
import { supabase } from '@/utils/supabase';
import { seedDefaultCategories } from './categories';

WebBrowser.maybeCompleteAuthSession();

async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 20000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

import { Platform } from 'react-native';

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
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function ensureProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user?.email) throw new Error('No authenticated user found.');

  const profilePayload = {
    id: user.id,
    email: user.email,
    display_name: (user.user_metadata.display_name as string | undefined) ?? (user.user_metadata.full_name as string | undefined) ?? null,
    avatar_url: (user.user_metadata.avatar_url as string | undefined) ?? null,
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;

  await seedDefaultCategories(user.id);
  return data as UserProfile;
}

export async function updateProfile(input: Partial<Pick<UserProfile, 'display_name' | 'preferred_currency' | 'theme_preference'>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user found.');

  const { data, error } = await supabase
    .from('users')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as UserProfile;
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
