import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { ensureProfile, signOut as signOutService } from '@/services/auth';
import { setNotificationUserId } from '@/services/notifications';
import { unregisterPushToken } from '@/services/pushNotifications';
import { generateDueRecurringExpenses } from '@/services/recurring';
import { UserProfile } from '@/types';
import { supabase } from '@/utils/supabase';

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshSession: () => Promise<Session | null>;
  /** force=true bypasses the freshness throttle (post-save reloads, pull-to-refresh). */
  refreshProfile: (force?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Non-forced refreshProfile calls within this window reuse the last result. */
const PROFILE_REFRESH_COOLDOWN_MS = 30_000;

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
  const lastLoadedUserIdRef = useRef<string | null>(null);
  const lastProfileRefreshAt = useRef(0);
  const profileRefreshInFlight = useRef<Promise<void> | null>(null);

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

  const refreshProfile = useCallback(async (force = false) => {
    // In-flight deduplication: concurrent non-forced callers reuse the same request.
    if (profileRefreshInFlight.current) {
      if (!force) return profileRefreshInFlight.current;
      // A forced refresh must reflect data saved AFTER the in-flight request
      // started (e.g. a profile save landing during a focus-triggered refresh),
      // so wait for it to finish and then fetch fresh — never reuse its result.
      await profileRefreshInFlight.current.catch(() => undefined);
    }
    // Freshness throttle: bursts of non-forced triggers (e.g. tab focus) reuse
    // the last result instead of re-fetching. force=true always refreshes.
    if (!force && Date.now() - lastProfileRefreshAt.current < PROFILE_REFRESH_COOLDOWN_MS) return;
    const request = (async () => {
      try {
        const nextProfile = await ensureProfile();
        setProfile(nextProfile);
        setNotificationUserId(nextProfile.id);
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
    })();
    profileRefreshInFlight.current = request;
    try {
      await request;
    } finally {
      lastProfileRefreshAt.current = Date.now();
      profileRefreshInFlight.current = null;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const uid = session?.user?.id;
      if (uid) {
        void unregisterPushToken(uid).catch(() => {});
      }
      await signOutService();
    } finally {
      lastLoadedUserIdRef.current = null;
      lastProfileRefreshAt.current = 0;
      profileRefreshInFlight.current = null;
      setSession(null);
      setProfile(null);
      setNotificationUserId(null);
    }
  }, [session]);

  // 1. Initial mount: listener for deep links and Supabase auth state change
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
      if (mounted && cached) {
        try {
          setProfile((current) => current || (JSON.parse(cached) as UserProfile));
        } catch {
          // ignore
        }
      }
    });

    // Initial session hydration
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

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
  }, []);

  // 2. When authenticated user ID changes, load profile & process due recurring rules once
  useEffect(() => {
    if (!userId) {
      lastLoadedUserIdRef.current = null;
      setProfile(null);
      return;
    }

    if (lastLoadedUserIdRef.current === userId) {
      return; // Already loaded for this user
    }

    lastLoadedUserIdRef.current = userId;
    let mounted = true;

    // A user change is always a genuine refresh: reset throttle state and
    // force-fetch so the new user never inherits the previous freshness window.
    lastProfileRefreshAt.current = 0;
    profileRefreshInFlight.current = null;

    // Profile fetch runs immediately; recurring materialization is deferrable
    // by design (after first paint) and is idempotent — a cancelled run simply
    // re-runs on the next launch.
    void refreshProfile(true).catch(() => {
      if (mounted && session?.user) {
        setProfile({
          id: session.user.id,
          email: session.user.email ?? '',
          display_name: (session.user.user_metadata?.display_name as string) ?? null,
          avatar_url: (session.user.user_metadata?.avatar_url as string) ?? null,
          preferred_currency: (session.user.user_metadata?.preferred_currency as string) ?? 'NPR',
          theme_preference: (session.user.user_metadata?.theme_preference as any) ?? 'system',
          monthly_budget: session.user.user_metadata?.monthly_budget ? Number(session.user.user_metadata.monthly_budget) : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    });
    const recurringTimer = setTimeout(() => {
      void generateDueRecurringExpenses(userId).catch(() => undefined);
    }, 2500);

    return () => {
      mounted = false;
      clearTimeout(recurringTimer);
    };
  }, [refreshProfile, session?.user, userId]);

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
