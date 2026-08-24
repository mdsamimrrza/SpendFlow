import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
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
  const userId = session?.user?.id ?? null;

  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSession(data.session);
      return data.session;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const nextProfile = await ensureProfile();
      setProfile(nextProfile);
    } catch {
      const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!sessionData?.session) {
        setProfile(null);
        return;
      }
      // Offline fallback: check cached profile
      const cached = await AsyncStorage.getItem('@spendflow_cached_profile').catch(() => null);
      if (cached) {
        try {
          setProfile(JSON.parse(cached) as UserProfile);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutService();
    } finally {
      setSession(null);
      setProfile(null);
    }
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

    // Load cached profile instantly on startup for fast UI render
    void AsyncStorage.getItem('@spendflow_cached_profile').then((cached) => {
      if (mounted && cached && !profile) {
        try {
          setProfile(JSON.parse(cached) as UserProfile);
        } catch {
          // ignore
        }
      }
    });

    async function hydrateSession() {
      try {
        const nextSession = await refreshSession();
        if (!mounted) return;
        setSession(nextSession);
      } catch {
        // Keep existing state
      } finally {
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
  }, [profile, refreshSession]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let mounted = true;
    void refreshProfile()
      .then(() => generateDueRecurringExpenses(userId))
      .catch(() => {
        if (mounted && session?.user) {
          setProfile({
            id: session.user.id,
            email: session.user.email ?? '',
            display_name: (session.user.user_metadata?.display_name as string) ?? null,
            avatar_url: (session.user.user_metadata?.avatar_url as string) ?? null,
            preferred_currency: 'NPR',
            theme_preference: 'system',
            monthly_budget: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, [refreshProfile, session, userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      refreshSession,
      refreshProfile,
      signOut,
    }),
    [loading, profile, refreshProfile, refreshSession, session, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
