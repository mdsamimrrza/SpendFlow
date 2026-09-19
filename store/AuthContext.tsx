import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { ensureProfile, signOut as signOutService } from '@/services/auth';
import { setNotificationUserId } from '@/services/notifications';
import { unregisterPushToken } from '@/services/pushNotifications';
import { generateDueRecurringExpenses } from '@/services/recurring';
import { notifyExpensesChanged } from '@/hooks/useExpenses';
import { prefetchAfterLogin } from '@/services/prefetch';
import { UserProfile } from '@/types';
import { supabase } from '@/utils/supabase';
import { consumePendingAuthFlow, decodeJwtSub, isPendingAuthFlow, isTrustedAuthUrl } from '@/utils/authFlow';

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshSession: () => Promise<Session | null>;
  /** force=true bypasses the freshness throttle (post-save reloads, pull-to-refresh). */
  refreshProfile: (force?: boolean) => Promise<void>;
  /** Optimistically apply profile fields in memory (persist via updateProfile separately). */
  patchProfile: (patch: Partial<UserProfile>) => void;
  signOut: () => Promise<void>;
  /** True while a remembered (still-valid) session waits on the login page for
   *  biometric or password unlock. */
  softLocked: boolean;
  /** True when the soft-lock came from the disk-persisted flag during cold
   *  start — a genuine "remembered session from a previous run", so the login
   *  page may lead with the bank-style scan card and its auto-prompt. False
   *  when the user just tapped "use password" on the app-lock overlay this
   *  session: the login page then goes straight to the form (no second
   *  biometric prompt on top of the one they just declined). */
  softLockRestored: boolean;
  /** Soft logout: remember the session on this device and drop to the login
   *  page — does NOT revoke tokens (biometric/password restores it). */
  lockToLogin: () => Promise<void>;
  /** Restore the remembered session after a successful biometric prompt. */
  unlockWithRememberedSession: () => void;
  /** True after a password-recovery deep link logged the user in but they
   *  have not chosen a new password yet (drives PasswordRecoveryModal). */
  passwordRecoveryPending: boolean;
  /** Clear the recovery prompt after the password was updated. */
  completePasswordRecovery: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Non-forced refreshProfile calls within this window reuse the last result. */
const PROFILE_REFRESH_COOLDOWN_MS = 30_000;

/** Soft-lock marker: '1' while a remembered (still-valid) session waits for
 *  biometric/password unlock on the login page. */
const SOFT_LOCK_KEY = '@spendflow_soft_locked';

/** Set when a recovery deep link established a session but the user has not
 *  chosen a new password yet — drives the PasswordRecoveryModal prompt. */
const PASSWORD_RECOVERY_KEY = '@spendflow_password_recovery';

/**
 * isTrustedAuthUrl (imported from utils/authFlow) pins the URL's scheme/origin,
 * but a registered custom scheme identifies the RECEIVER, never the sender —
 * ANY app on the device (or a tapped link) can deliver a callback URL carrying
 * its own valid tokens (login-CSRF / session fixation). handleOAuthUrl below
 * therefore adds the missing binding: intake of a session that belongs to a
 * DIFFERENT user than the one already on this device is accepted only while
 * this client actually started an auth flow (utils/authFlow begin/consume/
 * isPendingAuthFlow) or while no session is live at all (a genuine sign-in /
 * recovery from the login screen).
 */
async function handleOAuthUrl(url: string, onRecovery?: () => void) {
  if (!url) return;
  if (!isTrustedAuthUrl(url)) return;
  try {
    const hashMatch = url.match(/#(.+)/);
    if (hashMatch) {
      const params = new URLSearchParams(hashMatch[1]);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        // Ownership binding: with a live session, a candidate token for a
        // different user needs a pending app-initiated flow — otherwise drop
        // the link (silently; a hostile sender must learn nothing).
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session) {
          const candidateSub = decodeJwtSub(access_token);
          const pending = await isPendingAuthFlow();
          if (!pending && candidateSub !== existing.session.user.id) return;
        }
        consumePendingAuthFlow();
        await supabase.auth.setSession({ access_token, refresh_token });
        // GoTrue marks the recovery redirect with type=recovery — the session
        // is live but still protected by the OLD password. Prompt for a new one.
        if (params.get('type') === 'recovery') {
          void AsyncStorage.setItem(PASSWORD_RECOVERY_KEY, '1').catch(() => undefined);
          onRecovery?.();
        }
        return;
      }
    }
    const queryMatch = url.match(/\?([^#]+)/);
    if (queryMatch) {
      const params = new URLSearchParams(queryMatch[1]);
      const code = params.get('code');
      if (code) {
        // Codes only exchange where the PKCE verifier is local, but an
        // already-signed-in device must not trade its session for an
        // unrelated flow's code unless this client started that flow.
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session && !(await isPendingAuthFlow())) return;
        consumePendingAuthFlow();
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
  // ── Soft-lock state (biometric quick login) ──────────────────────────────────
  const [softLocked, setSoftLocked] = useState(false);
  const softLockedRef = useRef(false);
  const [softLockRestored, setSoftLockRestored] = useState(false);
  // Cold-start ownership gate for the auth listener (see listener guard).
  const hydratedRef = useRef(false);
  const rememberedSessionRef = useRef<Session | null>(null);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);

  /** Single session-apply gate: while soft-locked, incoming sessions are held
   *  back as "remembered" so routing shows the login page (which offers
   *  biometric quick unlock + the normal Google/password form). A session
   *  disappearing (signed out elsewhere / expired) drops the soft-lock. */
  const applySession = useCallback((next: Session | null) => {
    if (softLockedRef.current && next) {
      rememberedSessionRef.current = next;
      setSession(null);
      return;
    }
    if (!next) {
      softLockedRef.current = false;
      setSoftLocked(false);
      setSoftLockRestored(false);
      rememberedSessionRef.current = null;
      void AsyncStorage.removeItem(SOFT_LOCK_KEY).catch(() => undefined);
      // No session → nothing to recover; drop a stale prompt from a discarded
      // recovery link (sign-out, expiry, revoke-all-devices).
      setPasswordRecoveryPending(false);
      void AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY).catch(() => undefined);
    }
    setSession(next);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      applySession(data.session);
      // While soft-locked the session is deliberately held back — callers
      // (e.g. the login page's active-session check) must see null so the
      // remembered session never short-circuits the unlock gate.
      return softLockedRef.current ? null : data.session;
    } finally {
      setLoading(false);
    }
  }, [applySession]);

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
        // Offline fallback: this user's cached profile only (keyed by id and
        // id re-checked before use so a stale foreign profile never paints).
        const uid = sessionData.session.user.id;
        const cached = await AsyncStorage.getItem(`@spendflow_cached_profile_${uid}`).catch(() => null);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as UserProfile;
            if (parsed?.id === uid) setProfile(parsed);
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
      softLockedRef.current = false;
      setSoftLocked(false);
      setSoftLockRestored(false);
      rememberedSessionRef.current = null;
      void AsyncStorage.removeItem(SOFT_LOCK_KEY).catch(() => undefined);
      lastLoadedUserIdRef.current = null;
      lastProfileRefreshAt.current = 0;
      profileRefreshInFlight.current = null;
      setSession(null);
      setProfile(null);
      setNotificationUserId(null);
    }
  }, [session]);

  /** Soft logout: remember the still-valid session on this device and drop to
   *  the login page. Tokens are NOT revoked — the login page offers biometric
   *  quick unlock, with Google/password as the fallback. */
  const lockToLogin = useCallback(async () => {
    const uid = session?.user?.id;
    if (uid) {
      // Audit run-1 fix: the login page may complete a DIFFERENT account's
      // sign-in without this one ever signing out; without unregistering here,
      // the previous owner's device_tokens row survives the hand-off and their
      // financial pushes keep arriving on this install. If the same user
      // biometric-unlocks, the session-restore effect re-registers the token.
      await unregisterPushToken(uid).catch(() => undefined);
    }
    rememberedSessionRef.current = session;
    softLockedRef.current = true;
    setSoftLocked(true);
    // Manual lock chosen this run (overlay → "use password"): the login page
    // must NOT re-prompt biometrics the user just declined — straight to form.
    setSoftLockRestored(false);
    await AsyncStorage.setItem(SOFT_LOCK_KEY, '1').catch(() => undefined);
    lastLoadedUserIdRef.current = null;
    lastProfileRefreshAt.current = 0;
    profileRefreshInFlight.current = null;
    setSession(null);
    setProfile(null);
    setNotificationUserId(null);
  }, [session]);

  /** Restore the remembered session after a successful biometric prompt. */
  const unlockWithRememberedSession = useCallback(() => {
    const remembered = rememberedSessionRef.current;
    softLockedRef.current = false;
    setSoftLocked(false);
    setSoftLockRestored(false);
    rememberedSessionRef.current = null;
    void AsyncStorage.removeItem(SOFT_LOCK_KEY).catch(() => undefined);
    if (remembered) {
      // Warm the dashboard caches while the unlock UI settles (the restored
      // session does not emit a SIGNED_IN event, so this is the only hook).
      prefetchAfterLogin(remembered.user.id);
      // Force the profile pipeline to run for this user again.
      lastLoadedUserIdRef.current = null;
      lastProfileRefreshAt.current = 0;
      setSession(remembered);
    }
  }, []);

  // 1. Initial mount: listener for deep links and Supabase auth state change
  useEffect(() => {
    let mounted = true;

    // Check initial deep link
    void Linking.getInitialURL().then((url) => {
      if (url) void handleOAuthUrl(url, () => setPasswordRecoveryPending(true));
    });

    // Listen for incoming OAuth deep links
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void handleOAuthUrl(url, () => setPasswordRecoveryPending(true));
    });

    // Warm-start paint: the most recently active user's cached profile loads
    // instantly. The session hydration below validates the painted profile's
    // id against the actual session and clears any foreign (previous-user)
    // profile before the UI can act on it.
    void AsyncStorage.getItem('@spendflow_last_profile_user').then((lastUid) => {
      if (!lastUid) return;
      AsyncStorage.getItem(`@spendflow_cached_profile_${lastUid}`).then((cached) => {
        if (mounted && cached) {
          try {
            const parsed = JSON.parse(cached) as UserProfile;
            if (parsed?.id === lastUid) {
              setProfile((current) => current || parsed);
            }
          } catch {
            // ignore
          }
        }
      }).catch(() => {});
    }).catch(() => {});

    // Track the most recent signed-in user for the next cold start's paint.
    if (userId) {
      void AsyncStorage.setItem('@spendflow_last_profile_user', userId).catch(() => {});
    }

    // Initial session hydration: restore the soft-lock flag FIRST so the
    // session-apply gate knows to hold a remembered session back.
    void (async () => {
      const flag = await AsyncStorage.getItem(SOFT_LOCK_KEY).catch(() => null);
      if (mounted && flag === '1') {
        softLockedRef.current = true;
        setSoftLocked(true);
        // This soft-lock IS the remembered-from-last-run session — the login
        // page's scan card + auto-prompt are allowed for this one.
        setSoftLockRestored(true);
      }
      // Re-surface the new-password prompt if the app was closed between the
      // recovery deep link and choosing a new password.
      const recoveryFlag = await AsyncStorage.getItem(PASSWORD_RECOVERY_KEY).catch(() => null);
      if (mounted && recoveryFlag === '1') {
        setPasswordRecoveryPending(true);
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      applySession(data.session);
      // The warm-start paint above may have loaded another user's profile —
      // clear it unless it matches the real session user.
      if (data.session?.user?.id) {
        setProfile((current) => (current && current.id === data.session!.user.id ? current : null));
      } else {
        setProfile(null);
      }
      // Cold-start ownership transfers to the listener only now: every event
      // before this point (INITIAL_SESSION placeholder, the restored-session
      // SIGNED_IN replay) is supabase-js replaying state we just applied
      // ourselves and must not re-apply — see the listener guard below.
      hydratedRef.current = true;
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      // COLD-START GUARD: supabase-js synchronously emits INITIAL_SESSION
      // (often with null while still initializing) and replays the restored
      // session as SIGNED_IN through EVERY subscription the moment auth
      // finishes hydrating from storage. Acting on those here races the
      // async soft-lock flag read above: an INITIAL_SESSION(null) applied
      // mid-restore wipes the soft-lock and drops the user on the login page
      // with no remembered session — the "biometric asked me to sign in
      // first" bounce. The hydration block is the single initial applicator;
      // this listener owns only changes that arrive after it completed.
      if (!hydratedRef.current || event === 'INITIAL_SESSION') return;
      // Warm the dashboard caches DURING login (while the login screen is
      // still up) so re-login isn't a cold start. Covers email/Google/Apple
      // in one spot — biometric unlock is handled in unlockWithRememberedSession.
      if (event === 'SIGNED_IN' && nextSession?.user?.id) {
        prefetchAfterLogin(nextSession.user.id);
      }
      if (softLockedRef.current && event === 'SIGNED_IN' && nextSession) {
        // A FRESH sign-in from the login page (Google/Apple/password) — drop
        // the soft-lock entirely and go straight in.
        softLockedRef.current = false;
        setSoftLocked(false);
        setSoftLockRestored(false);
        rememberedSessionRef.current = null;
        void AsyncStorage.removeItem(SOFT_LOCK_KEY).catch(() => undefined);
        setSession(nextSession);
        setLoading(false);
        return;
      }
      applySession(nextSession);
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
      void generateDueRecurringExpenses(userId)
        .then((generated) => {
          // Deferred generation can land after the dashboard's first load —
          // notify mounted expense lists so new occurrences appear immediately.
          if (generated > 0) notifyExpensesChanged();
        })
        .catch(() => undefined);
    }, 2500);

    return () => {
      mounted = false;
      clearTimeout(recurringTimer);
    };
  }, [refreshProfile, session?.user, userId]);

  /** Optimistic in-memory profile patch — saves still go through updateProfile. */
  const patchProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const completePasswordRecovery = useCallback(() => {
    setPasswordRecoveryPending(false);
    void AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY).catch(() => undefined);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      refreshSession,
      refreshProfile,
      patchProfile,
      signOut,
      softLocked,
      softLockRestored,
      lockToLogin,
      unlockWithRememberedSession,
      passwordRecoveryPending,
      completePasswordRecovery,
    }),
    [loading, lockToLogin, patchProfile, profile, refreshProfile, refreshSession, session, signOut, softLocked, softLockRestored, unlockWithRememberedSession, passwordRecoveryPending, completePasswordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
