import { Session } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { ensureProfile, signOut as signOutService } from '@/services/auth';
import { generateDueRecurringExpenses } from '@/services/recurring';
import { UserProfile } from '@/types';
import { supabase } from '@/utils/supabase';

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshSession: () => Promise<Session | null>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

import * as Linking from 'expo-linking';

async function handleOAuthUrl(url: string) {
  if (!url) return;
  try {
    const hashMatch = url.match(/#(.+)/);
    if (hashMatch) {
      const params = new URLSearchParams(hashMatch[1]);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        return;
      }
    }
    const queryMatch = url.match(/\?([^#]+)/);
    if (queryMatch) {
      const params = new URLSearchParams(queryMatch[1]);
      const code = params.get('code');
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
    }
  } catch {
    // Ignore invalid link formats
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = session?.user.id ?? null;

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    setSession(data.session);
    setLoading(false);
    return data.session;
  }, []);

  const refreshProfile = useCallback(async () => {
    const nextProfile = await ensureProfile();
    setProfile(nextProfile);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Check initial deep link
    void Linking.getInitialURL().then((url) => {
      if (url) void handleOAuthUrl(url);
    });

    // Listen for incoming OAuth deep links
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void handleOAuthUrl(url);
    });

    async function hydrateSession() {
      try {
        const nextSession = await refreshSession();
        if (!mounted) return;
        setSession(nextSession);
        setLoading(false);
      } catch {
        if (mounted) setLoading(false);
      }
    }

    void hydrateSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      linkSub.remove();
      listener.subscription.unsubscribe();
    };
  }, [refreshSession]);


  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }

    let mounted = true;
    void refreshProfile()
      .then(() => generateDueRecurringExpenses(userId))
      .catch(() => {
        if (mounted) setProfile(null);
      });

    return () => {
      mounted = false;
    };
  }, [refreshProfile, userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      refreshSession,
      refreshProfile,
      signOut: signOutService,
    }),
    [loading, profile, refreshProfile, refreshSession, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
