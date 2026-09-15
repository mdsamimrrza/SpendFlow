import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Eye, EyeOff, Fingerprint, KeyRound, Lock, Mail, ScanFace, ShieldCheck, User, X } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { z } from 'zod';
import { SpendFlowSealLogo } from '@/components/ui/SpendFlowSealLogo';
import { showToast } from '@/components/ui/Toast';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useSecurity } from '@/hooks/useSecurity';
import { useTheme } from '@/hooks/useTheme';
import { resetPassword, signInWithEmail, signInWithApple, signInWithGoogle, signUpWithEmail } from '@/services/auth';

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
  // The zod rule only enforces presence — one form serves BOTH signin and
  // signup. The 8-char minimum for NEW accounts is enforced in submit()
  // (signup branch only), so existing users with 6-7 char passwords can
  // still sign in; they only meet the bar when changing their password
  // (profile.tsx) or creating a new account.
  password: z.string().min(1, 'Please enter your password'),
  displayName: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ── Google Official 4-Color 'G' Logo ──
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <Path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </Svg>
  );
}

export default function AuthScreen() {
  const router = useRouter();
  const { refreshSession, softLocked, softLockRestored, unlockWithRememberedSession } = useAuth();
  const { isBiometricEnabled, isBiometricSupported, biometricTypeName, authenticate, unlockManually, beginSystemCapture, endSystemCapture } = useSecurity();
  const { language, setLanguage, t } = useLanguage();
  const theme = useTheme();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [status, setStatus] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  // Sign in with Apple renders only where the device supports it (real iOS
  // device / configured simulator). Checked once on mount.
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Biometric quick unlock (soft-locked remembered session)
  const [biometricBusy, setBiometricBusy] = useState(false);
  const autoPromptedRef = useRef(false);
  // Bank-style biometric-first hero: shown for a remembered session, with a
  // password/Google fallback link that reveals the full form.
  const [bioFirstDismissed, setBioFirstDismissed] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bioFlipAnim = useRef(new Animated.Value(0)).current;
  // Sign In ↔ Sign Up card flip (same spring the expense/income cards use).
  const formFlipAnim = useRef(new Animated.Value(1)).current;

  // Focus states for responsive active glow border
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  // Forgot Password Modal
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', displayName: '' },
  });

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  // ── Biometric quick unlock ────────────────────────────────────────────────
  // The scan button shows whenever the user enabled the biometric toggle in
  // Settings. With a remembered (soft-locked) session it restores it; without
  // one it explains that quick unlock activates after the first sign-in.
  const handleBiometricUnlock = useCallback(async () => {
    if (biometricBusy) return;
    setBiometricBusy(true);
    try {
      const ok = await authenticate();
      if (ok) {
        if (softLocked) {
          unlockWithRememberedSession();
        } else {
          showToast({
            message: `Sign in once to enable ${biometricTypeName} login`,
            type: 'info',
          });
        }
      }
    } finally {
      setBiometricBusy(false);
    }
  }, [authenticate, biometricBusy, softLocked, unlockWithRememberedSession]);

  useEffect(() => {
    // Auto-fire only when a remembered session from a PREVIOUS run is
    // actually waiting. After a manual "use password" on the app-lock
    // overlay, softLockRestored is false — the user already declined one
    // biometric prompt this session, so never stack a second one here.
    if (!softLocked || !softLockRestored || !isBiometricEnabled || !isBiometricSupported) return;
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    void handleBiometricUnlock();
    // isBiometricEnabled flips after the async preference load — re-running
    // this effect then is what fires the auto-prompt on cold start.
  }, [handleBiometricUnlock, isBiometricEnabled, isBiometricSupported, softLocked]);

  // ── Screen-size adaptation: comfortable spacing on phones, a wider
  // column on tablets/desktop windows, tighter padding on short screens.
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  // ── Dynamic layout ────────────────────────────────────────────────────────
  const showBiometricUnlock = isBiometricEnabled && isBiometricSupported;
  // Bank-style: a remembered session from a previous run + biometrics leads
  // with the scan card. A soft-lock the user just created by tapping "use
  // password" this same session skips the card — the form IS the answer.
  const bioFirstView = showBiometricUnlock && softLocked && softLockRestored && !bioFirstDismissed;
  const contentMaxWidth = winWidth >= 1024 ? 520 : winWidth >= 768 ? 480 : 420;

  // ── Keyboard responsiveness ──────────────────────────────────────────────
  // Reserve the keyboard's height as bottom scroll padding while it is open,
  // so the focused input can always rise above it. This works regardless of
  // the Android windowSoftInputMode (resize AND pan builds).
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e?.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Scanner breathing pulse while the bank-style unlock card is on screen.
  useEffect(() => {
    if (!bioFirstView) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bioFirstView, pulseAnim]);

  // Card flip-in (rotateY 90° → 0°) whenever the biometric hero appears —
  // the same spring the expense/income flow cards use.
  useEffect(() => {
    if (!bioFirstView) return;
    bioFlipAnim.setValue(0);
    Animated.spring(bioFlipAnim, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, [bioFirstView, bioFlipAnim]);

  useEffect(() => {
    // 1. Parse any error descriptions from OAuth redirects
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const searchParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : search);
      const errorDesc = searchParams.get('error_description');
      const errorCode = searchParams.get('error_code');
      if (errorDesc || errorCode) {
        const readable = errorDesc
          ? decodeURIComponent(errorDesc.replace(/\+/g, ' '))
          : 'Authentication error during sign in.';
        setStatus({ text: readable, type: 'error' });
        setGoogleLoading(false);
        setEmailLoading(false);
      }
    }

    // 2. Check if session was already active
    const checkActiveSession = async () => {
      const s = await refreshSession();
      if (s) {
        setStatus(null);
        setEmailLoading(false);
        setGoogleLoading(false);
        router.replace('/(tabs)');
      }
    };

    void checkActiveSession();

    // 3. When returning to tab or app window
    const handleWindowFocus = async () => {
      const s = await refreshSession();
      if (s) {
        setStatus(null);
        setEmailLoading(false);
        setGoogleLoading(false);
        router.replace('/(tabs)');
      } else {
        setEmailLoading(false);
        setGoogleLoading(false);
        setStatus((prev) => (prev?.type === 'info' ? null : prev));
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', handleWindowFocus);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void handleWindowFocus();
        }
      });
    }

    return () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', handleWindowFocus);
      }
    };
  }, []);

  // Submitting credentials IS the identity proof — clear any pending app
  // lock up-front (no session exists mid-login, so nothing is exposed) so
  // the biometric overlay never re-prompts right after a password login.
  function switchMode(nextMode: 'signin' | 'signup') {
    void Haptics.selectionAsync().catch(() => undefined);
    setMode(nextMode);
    setStatus(null);
    // Flip the form card in — mirrors the expense/income card animation.
    formFlipAnim.setValue(0);
    Animated.spring(formFlipAnim, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start();
  }

  async function submit(values: FormValues) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    unlockManually();
    setEmailLoading(true);
    setStatus(null);
    try {
      const email = values.email.trim();
      if (mode === 'signin') {
        const res = await signInWithEmail(email, values.password);
        if (res?.session) {
          unlockManually();
          setStatus(null);
          router.replace('/(tabs)');
          return;
        }
        const s = await refreshSession();
        if (s) {
          unlockManually();
          setStatus(null);
          router.replace('/(tabs)');
          return;
        }
      } else {
        // New accounts meet the 8-char bar (existing accounts are exempt —
        // enforced only on change, in profile.tsx).
        if (values.password.length < 8) {
          setStatus({ text: 'Password must be at least 8 characters.', type: 'error' });
          return;
        }
        const res = await signUpWithEmail(email, values.password, values.displayName?.trim());
        if (res?.session) {
          setStatus(null);
          router.replace('/(tabs)');
          return;
        }
        setStatus({
          text: 'Account created! Please check your email to confirm your account.',
          type: 'success',
        });
      }
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : t('common_error') || 'Authentication failed.',
        type: 'error',
      });
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    unlockManually();
    // The OAuth browser trip backgrounds the app — arm the system-trip
    // suppression so the return isn't treated as a lock-worthy resume.
    beginSystemCapture();
    setTimeout(() => endSystemCapture(), 5000);
    setGoogleLoading(true);
    setStatus(null);
    try {
      const res = await signInWithGoogle();
      if (res && 'session' in res && res.session) {
        setStatus(null);
        setGoogleLoading(false);
        router.replace('/(tabs)');
        return;
      }
      const s = await refreshSession();
      if (s) {
        setStatus(null);
        setGoogleLoading(false);
        router.replace('/(tabs)');
        return;
      }

      setTimeout(() => {
        setGoogleLoading(false);
      }, 3500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Google sign-in was cancelled.';
      setStatus({ text: msg, type: 'error' });
      setGoogleLoading(false);
    }
  }

  async function handleAppleSignIn() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    unlockManually();
    beginSystemCapture();
    setTimeout(() => endSystemCapture(), 5000);
    setAppleLoading(true);
    setStatus(null);
    try {
      const res = await signInWithApple();
      if (res && 'session' in res && res.session) {
        setStatus(null);
        setAppleLoading(false);
        router.replace('/(tabs)');
        return;
      }
      const s = await refreshSession();
      if (s) {
        setStatus(null);
        setAppleLoading(false);
        router.replace('/(tabs)');
        return;
      }

      setTimeout(() => {
        setAppleLoading(false);
      }, 3500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Apple sign-in was cancelled.';
      setStatus({ text: msg, type: 'error' });
      setAppleLoading(false);
    }
  }

  function handleOpenForgotPassword() {
    const currentEmail = form.getValues('email')?.trim() || '';
    setResetEmail(currentEmail);
    setResetStatus(null);
    setForgotModalOpen(true);
  }

  async function handleSendPasswordReset() {
    if (resetLoading || resetCooldown > 0) return;
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setResetStatus({ text: 'Please enter a valid email address.', type: 'error' });
      return;
    }

    setResetLoading(true);
    setResetStatus(null);
    try {
      const outcome = await resetPassword(resetEmail.trim());
      if (outcome === 'sent') {
        // 60s resend cooldown — mirrors the server-side gate enforced by the
        // send-password-reset function (which stamps the same window even for
        // not-found attempts, so the UI timer and the DB never disagree).
        setResetCooldown(60);
        setResetStatus({
          text:
            'Reset link sent! Open the email on this phone and tap "Choose a new password" — SpendFlow will open and ask you to set a new one.',
          type: 'success',
        });
      } else if (outcome === 'no_account') {
        setResetStatus({
          text: 'No SpendFlow account exists for this email. Check the address or create an account first.',
          type: 'error',
        });
      } else if (outcome === 'cooldown') {
        setResetCooldown(60);
        setResetStatus({
          text: 'Too many attempts — please wait 60 seconds and try again.',
          type: 'error',
        });
      } else if (outcome === 'invalid') {
        setResetStatus({ text: 'Please enter a valid email address.', type: 'error' });
      } else {
        setResetStatus({ text: 'Failed to send password reset link. Try again in a moment.', type: 'error' });
      }
    } catch (error) {
      setResetStatus({
        text: error instanceof Error ? error.message : 'Failed to send password reset link.',
        type: 'error',
      });
    } finally {
      setResetLoading(false);
    }
  }

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const t = setTimeout(() => setResetCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resetCooldown]);

  function showValidationError() {
    const firstError = Object.values(form.formState.errors)[0]?.message;
    setStatus({
      text: typeof firstError === 'string' ? firstError : 'Please fill in all required fields.',
      type: 'error',
    });
  }

  // Sign In ↔ Sign Up card flip style — the same rotateY spring the
  // expense/income flow cards use on the dashboard.
  const formFlipStyle = {
    opacity: formFlipAnim,
    transform: [
      { perspective: 900 },
      { rotateY: formFlipAnim.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) },
      { scale: formFlipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  };

  // Theme-aware styles matching ledger design
  const inputBgColor = theme.isDark ? '#111827' : '#FFFFFF';
  const cardBgColor = theme.isDark ? '#161F30' : '#FAF8F3';
  const cardBorderColor = theme.isDark ? '#233044' : '#E6E1D3';
  const inputBorderNormal = theme.isDark ? '#2C3B53' : '#D8D3C4';
  const labelColor = theme.isDark ? '#94A3B8' : '#7C887E';
  const primaryButtonColor = theme.isDark ? '#818CF8' : '#0F5C4D';
  const focusBorderColor = theme.isDark ? '#818CF8' : '#0F5C4D';
  const textColor = theme.colors.text;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      {/* Web Autofill & Input Reset Stylesheet */}
      {Platform.OS === 'web' ? (
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              input, textarea {
                outline: none !important;
                border: none !important;
                background-color: transparent !important;
                box-shadow: none !important;
                color: ${textColor} !important;
              }
              input:-webkit-autofill,
              input:-webkit-autofill:hover, 
              input:-webkit-autofill:focus, 
              input:-webkit-autofill:active {
                -webkit-box-shadow: 0 0 0 1000px ${inputBgColor} inset !important;
                -webkit-text-fill-color: ${textColor} !important;
                transition: background-color 5000s ease-in-out 0s !important;
                caret-color: ${textColor} !important;
              }
            `,
          }}
        />
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          paddingHorizontal: winWidth >= 600 ? 24 : 16,
          paddingTop: winHeight < 640 ? 36 : 72,
          paddingBottom:
            Platform.OS === 'android' && keyboardHeight > 0
              ? keyboardHeight + 24
              : winHeight < 640
              ? 10
              : 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: contentMaxWidth, gap: winHeight < 640 ? 12 : 16, flexGrow: 1, justifyContent: bioFirstView ? 'flex-start' : 'flex-start' }}>

          {/* Top Bar Controls (Language Pill + Theme Toggle) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: theme.colors.surfaceElevated,
                borderRadius: theme.radius.full,
                padding: 3,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Pressable
                onPress={() => setLanguage('en')}
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: theme.radius.full,
                  backgroundColor: language === 'en' ? theme.colors.primary : 'transparent',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'en' ? '#FFFFFF' : theme.colors.textMuted }}>
                  EN
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLanguage('hi')}
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: theme.radius.full,
                  backgroundColor: language === 'hi' ? theme.colors.primary : 'transparent',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'hi' ? '#FFFFFF' : theme.colors.textMuted }}>
                  HI
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLanguage('ne')}
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: theme.radius.full,
                  backgroundColor: language === 'ne' ? theme.colors.primary : 'transparent',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'ne' ? '#FFFFFF' : theme.colors.textMuted }}>
                  NE
                </Text>
              </Pressable>
            </View>

            <ThemeToggle />
          </View>

          {/* Centering spacers: in biometric-first view the logo + unlock card
              sit centered below the top bar — the logo biased slightly up. */}
          {bioFirstView ? <View style={{ flex: 1 }} /> : null}

          {/* ── HERO BRAND HEADER: GOLDEN 'S' SEAL + TITLE + TAGLINE ── */}
          <View style={{ alignItems: 'center', gap: 6, width: '100%', marginTop: 4, marginBottom: 2 }}>
            <SpendFlowSealLogo size={76} isDark={theme.isDark} />

            <Text
              style={{
                fontSize: 30,
                fontWeight: '900',
                letterSpacing: -0.6,
                color: theme.colors.text,
                fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                textAlign: 'center',
                marginTop: 2,
              }}
            >
              SpendFlow
            </Text>

            <Text
              style={{
                fontSize: 13.5,
                color: theme.colors.textMuted,
                fontWeight: '500',
                letterSpacing: 0.3,
                textAlign: 'center',
              }}
            >
              Your personal ledger
            </Text>
          </View>

          {/* ── BANK-STYLE BIOMETRIC FIRST UNLOCK (remembered session) ──
              Like banking apps: the scan IS the login. Shown only when the
              user enabled the biometric toggle AND a session is remembered
              on this device — a first-time visitor never sees it. */}
          {bioFirstView ? (
            <Animated.View
              style={[
                {
                  width: '100%',
                  backgroundColor: cardBgColor,
                  borderRadius: 24,
                  borderWidth: 1.2,
                  borderColor: cardBorderColor,
                  paddingVertical: 40,
                  paddingHorizontal: 20,
                  alignItems: 'center',
                  gap: 16,
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: theme.isDark ? 0.35 : 0.06,
                  shadowRadius: 12,
                  elevation: 3,
                },
                {
                  opacity: bioFlipAnim,
                  transform: [
                    { perspective: 900 },
                    { rotateY: bioFlipAnim.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) },
                    { scale: bioFlipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                  ],
                },
              ]}
            >
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', letterSpacing: -0.3, color: theme.colors.text }}>
                  Unlock SpendFlow
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.colors.textMuted, fontWeight: '500', textAlign: 'center' }}>
                  Use {biometricTypeName} for quick, secure access — no password needed.
                </Text>
              </View>

              <Animated.View style={{ transform: [{ scale: pulseAnim }], marginVertical: 4 }}>
                <View
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 60,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: theme.isDark ? 'rgba(129,140,248,0.35)' : 'rgba(15,92,77,0.25)',
                    borderStyle: 'dashed',
                  }}
                >
                <Pressable
                  onPress={() => void handleBiometricUnlock()}
                  disabled={biometricBusy}
                  style={({ pressed }) => ({
                    width: 96,
                    height: 96,
                    borderRadius: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.isDark
                      ? (pressed ? '#1E293B' : '#161B22')
                      : (pressed ? theme.colors.primaryStrong : theme.colors.primary),
                    borderWidth: 2,
                    borderColor: theme.isDark ? theme.colors.primary : '#A8791F',
                    shadowColor: theme.colors.primary,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                    elevation: 8,
                    opacity: biometricBusy ? 0.7 : 1,
                  })}
                >
                  {biometricBusy ? (
                    <ActivityIndicator color={theme.isDark ? theme.colors.primary : '#FFFFFF'} />
                  ) : biometricTypeName.toLowerCase().includes('face') ? (
                    <ScanFace size={44} color={theme.isDark ? theme.colors.primary : '#FFFFFF'} strokeWidth={2.2} />
                  ) : (
                    <Fingerprint size={44} color={theme.isDark ? theme.colors.primary : '#FFFFFF'} strokeWidth={2.2} />
                  )}
                </Pressable>
                </View>
              </Animated.View>

              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.primary }}>
                {biometricBusy ? t('security_unlock_btn') : biometricTypeName}
              </Text>

              <Pressable
                onPress={() => setBioFirstDismissed(true)}
                hitSlop={10}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 6,
                  paddingVertical: 12,
                  paddingHorizontal: 22,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.isDark ? 'rgba(129,140,248,0.16)' : 'rgba(15,92,77,0.10)',
                  borderWidth: 1.5,
                  borderColor: theme.colors.primary,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <KeyRound size={14} color={theme.colors.primary} />
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.primary,
                    fontWeight: '800',
                    letterSpacing: 0.2,
                  }}
                >
                  {t('auth_quick_login_fallback')}
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {bioFirstView ? <View style={{ flex: 1.6 }} /> : null}

          {/* ── AUTH MAIN FORM CARD ── */}
          <Animated.View style={bioFirstView ? { display: 'none' } : ([{ width: '100%' }, formFlipStyle] as any)}>
          <View
            style={{
              width: '100%',
              backgroundColor: cardBgColor,
              borderRadius: 24,
              borderWidth: 1.2,
              borderColor: cardBorderColor,
              padding: 20,
              gap: 14,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: theme.isDark ? 0.35 : 0.06,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            {/* Full Name Field (Sign Up Mode Only) */}
            {mode === 'signup' ? (
              <View style={{ gap: 6, width: '100%' }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    letterSpacing: 0.8,
                    color: labelColor,
                    textTransform: 'uppercase',
                  }}
                >
                  FULL NAME
                </Text>
                <Controller
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <View
                      style={{
                        width: '100%',
                        minHeight: 52,
                        borderRadius: 14,
                        backgroundColor: inputBgColor,
                        borderWidth: 1.5,
                        borderColor: nameFocused ? focusBorderColor : inputBorderNormal,
                        paddingHorizontal: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <User size={18} color={nameFocused ? focusBorderColor : theme.colors.textMuted} />
                      <TextInput
                        value={field.value}
                        onChangeText={field.onChange}
                        onFocus={() => setNameFocused(true)}
                        onBlur={() => setNameFocused(false)}
                        placeholder="Alex Morgan"
                        placeholderTextColor={theme.isDark ? '#64748B' : '#9CA3AF'}
                        style={{
                          flex: 1,
                          minHeight: 46,
                          fontSize: 15,
                          color: textColor,
                          fontWeight: '500',
                          paddingVertical: Platform.OS === 'android' ? 4 : 8,
                          backgroundColor: 'transparent',
                          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                        }}
                      />
                    </View>
                  )}
                />
              </View>
            ) : null}

            {/* Email Field */}
            <View style={{ gap: 6, width: '100%' }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.8,
                  color: labelColor,
                  textTransform: 'uppercase',
                }}
              >
                EMAIL
              </Text>
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <View
                    style={{
                      width: '100%',
                      minHeight: 50,
                      borderRadius: 12,
                      backgroundColor: inputBgColor,
                      borderWidth: 1.5,
                      borderColor: fieldState.error
                        ? theme.colors.danger
                        : emailFocused
                        ? focusBorderColor
                        : inputBorderNormal,
                      paddingHorizontal: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <Mail size={18} color={emailFocused ? focusBorderColor : theme.colors.textMuted} />
                    <TextInput
                      value={field.value}
                      onChangeText={field.onChange}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholder="you@example.com"
                      placeholderTextColor={theme.isDark ? '#64748B' : '#9CA3AF'}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                      style={{
                        flex: 1,
                        minHeight: 46,
                        fontSize: 15,
                        color: textColor,
                        fontWeight: '500',
                        paddingVertical: Platform.OS === 'android' ? 4 : 8,
                        backgroundColor: 'transparent',
                        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                      }}
                    />
                  </View>
                )}
              />
            </View>

            {/* Password Field */}
            <View style={{ gap: 6, width: '100%' }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.8,
                  color: labelColor,
                  textTransform: 'uppercase',
                }}
              >
                PASSWORD{mode === 'signup' ? ' (MIN 8 CHARACTERS)' : ''}
              </Text>
              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <View
                    style={{
                      width: '100%',
                      minHeight: 50,
                      borderRadius: 12,
                      backgroundColor: inputBgColor,
                      borderWidth: 1.5,
                      borderColor: fieldState.error
                        ? theme.colors.danger
                        : passwordFocused
                        ? focusBorderColor
                        : inputBorderNormal,
                      paddingHorizontal: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <Lock size={18} color={passwordFocused ? focusBorderColor : theme.colors.textMuted} />
                    <TextInput
                      value={field.value}
                      onChangeText={field.onChange}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      placeholder="••••••••"
                      placeholderTextColor={theme.isDark ? '#64748B' : '#9CA3AF'}
                      secureTextEntry={!showPassword}
                      style={{
                        flex: 1,
                        minHeight: 46,
                        fontSize: 15,
                        color: textColor,
                        fontWeight: '500',
                        paddingVertical: Platform.OS === 'android' ? 4 : 8,
                        backgroundColor: 'transparent',
                        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                      }}
                    />
                    <Pressable
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color={theme.colors.textMuted} />
                      ) : (
                        <Eye size={18} color={theme.colors.textMuted} />
                      )}
                    </Pressable>
                  </View>
                )}
              />
            </View>

            {/* Forgot Password Link (Sign in Mode) */}
            {mode === 'signin' ? (
              <View style={{ alignItems: 'flex-end', marginTop: -4, width: '100%' }}>
                <Pressable
                  onPress={handleOpenForgotPassword}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: primaryButtonColor,
                    }}
                  >
                    Forgot password?
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Status / Error Message */}
            {status ? (
              <View
                style={{
                  width: '100%',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor:
                    status.type === 'error'
                      ? theme.isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2'
                      : status.type === 'success'
                      ? theme.isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5'
                      : theme.isDark ? 'rgba(129,140,248,0.15)' : '#EEF2FF',
                  borderWidth: 1,
                  borderColor:
                    status.type === 'error'
                      ? theme.colors.danger
                      : status.type === 'success'
                      ? theme.colors.success
                      : theme.colors.primary,
                }}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color:
                      status.type === 'error'
                        ? theme.colors.danger
                        : status.type === 'success'
                        ? theme.colors.success
                        : theme.colors.primary,
                    textAlign: 'center',
                  }}
                >
                  {status.text}
                </Text>
              </View>
            ) : null}

            {/* Primary Submit + Biometric row: the CTA takes ~75-80% of the
                card width; the circular scanner sits beside it. Without the
                biometric toggle the button is simply full-width. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 }}>
              <Pressable
                onPress={form.handleSubmit(submit, showValidationError)}
                disabled={emailLoading || googleLoading}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: primaryButtonColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: emailLoading ? 0.8 : pressed ? 0.9 : 1,
                  shadowColor: primaryButtonColor,
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.22,
                  shadowRadius: 6,
                  elevation: 3,
                })}
              >
                {emailLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 }}>
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  </Text>
                )}
              </Pressable>

              {/* Biometric scanner on SIGN IN only — and only when a session is
                  actually remembered (soft-locked). Without one, a successful
                  scan could only ever answer "sign in first", which is exactly
                  the confusing bounce users hit after their session expired.
                  Meaningless during first-time account creation anyway. */}
              {showBiometricUnlock && mode === 'signin' && softLocked ? (
                <Pressable
                  onPress={() => void handleBiometricUnlock()}
                  disabled={biometricBusy}
                  style={({ pressed }) => ({
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.isDark
                      ? (pressed ? '#1E293B' : '#161B22')
                      : (pressed ? theme.colors.primaryStrong : theme.colors.primary),
                    borderWidth: 2,
                    borderColor: theme.isDark ? theme.colors.primary : '#A8791F',
                    shadowColor: theme.colors.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.28,
                    shadowRadius: 8,
                    elevation: 6,
                    opacity: biometricBusy ? 0.7 : 1,
                  })}
                >
                  {biometricBusy ? (
                    <ActivityIndicator color={theme.isDark ? theme.colors.primary : '#FFFFFF'} />
                  ) : biometricTypeName.toLowerCase().includes('face') ? (
                    <ScanFace size={24} color={theme.isDark ? theme.colors.primary : '#FFFFFF'} strokeWidth={2.2} />
                  ) : (
                    <Fingerprint size={24} color={theme.isDark ? theme.colors.primary : '#FFFFFF'} strokeWidth={2.2} />
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
          </Animated.View>

          {/* ── SOCIAL SIGN-IN GROUP ── */}
          {!bioFirstView && (
          <View style={{ gap: 12 }}>
            {/* ── DIVIDER: OR CONTINUE WITH ── */}
            <View
              style={{
                width: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginVertical: 2,
              }}
            >
            <View style={{ flex: 1, height: 1, backgroundColor: cardBorderColor }} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: labelColor,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              OR CONTINUE WITH
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: cardBorderColor }} />
          </View>

          {/* ── GOOGLE SIGN IN BUTTON ── */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={emailLoading || googleLoading || appleLoading}
            style={({ pressed }) => ({
              width: '100%',
              height: 52,
              borderRadius: 14,
              backgroundColor: cardBgColor,
              borderWidth: 1.2,
              borderColor: cardBorderColor,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              opacity: googleLoading ? 0.75 : pressed ? 0.88 : 1,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: theme.isDark ? 0.2 : 0.04,
              shadowRadius: 4,
              elevation: 2,
            })}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <>
                <GoogleIcon size={19} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: textColor }}>
                  Continue with Google
                </Text>
              </>
            )}
          </Pressable>

          {/* ── APPLE SIGN IN BUTTON (iOS ONLY — App Store Guideline 4.8) ── */}
          {Platform.OS === 'ios' && appleAvailable && (
            <View pointerEvents={appleLoading ? 'none' : 'auto'} style={{ width: '100%' }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  theme.isDark
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={12}
                style={{
                  width: '100%',
                  height: 46,
                  opacity: appleLoading ? 0.75 : 1,
                }}
                onPress={handleAppleSignIn}
              />
            </View>
          )}
          </View>
          )}

          {/* ── FOOTER GROUP: MODE TOGGLE + SECURITY NOTE ── */}
          {!bioFirstView && (
          <View style={{ gap: 12 }}>
            {/* ── BOTTOM FOOTER: TOGGLE SIGN IN / SIGN UP ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%' }}>
              <Text style={{ fontSize: 14, color: theme.colors.textMuted }}>
                {mode === 'signin' ? 'New here?' : 'Already have an account?'}
              </Text>
              <Pressable
                onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                hitSlop={8}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: primaryButtonColor,
                  }}
                >
                  {mode === 'signin' ? 'Create an account' : 'Sign in'}
                </Text>
              </Pressable>
            </View>

            {/* Cloud Security Indicator */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 2, width: '100%' }}>
              <ShieldCheck size={13} color={theme.colors.success} />
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                End-to-End Encrypted Cloud Storage
              </Text>
            </View>
          </View>
          )}
        </View>
      </ScrollView>

      {/* ── FORGOT PASSWORD MODAL ── */}
      <Modal
        visible={forgotModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !resetLoading && setForgotModalOpen(false)}
      >
        <Pressable
          onPress={() => !resetLoading && setForgotModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.72)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              backgroundColor: theme.colors.surface,
              borderRadius: 24,
              padding: 22,
              gap: 16,
              borderWidth: 1.2,
              borderColor: theme.colors.border,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <KeyRound size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 17 }}>
                    Reset Password
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                    Receive reset instructions
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setForgotModalOpen(false)}
                disabled={resetLoading}
                hitSlop={8}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} color={theme.colors.text} />
              </Pressable>
            </View>

            <Text muted style={{ fontSize: 13, lineHeight: 18 }}>
              Enter your account email below. The reset link opens SpendFlow directly and asks you
              to set a new password.
            </Text>

            {/* Email Input */}
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.8,
                  color: labelColor,
                  textTransform: 'uppercase',
                }}
              >
                EMAIL ADDRESS
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 12,
                  minHeight: 48,
                  borderRadius: 12,
                  backgroundColor: inputBgColor,
                  borderWidth: 1,
                  borderColor: resetStatus?.type === 'error' ? theme.colors.danger : cardBorderColor,
                }}
              >
                <Mail size={17} color={theme.colors.textMuted} />
                <TextInput
                  value={resetEmail}
                  onChangeText={(val) => {
                    setResetEmail(val);
                    if (resetStatus) setResetStatus(null);
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  style={{
                    flex: 1,
                    minHeight: 44,
                    fontSize: 14,
                    color: theme.colors.text,
                    fontWeight: '500',
                    paddingVertical: Platform.OS === 'android' ? 4 : 8,
                    backgroundColor: 'transparent',
                    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                  }}
                />
              </View>
            </View>

            {/* Reset Status */}
            {resetStatus ? (
              <View
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor:
                    resetStatus.type === 'error'
                      ? theme.isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2'
                      : theme.isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5',
                  borderWidth: 1,
                  borderColor: resetStatus.type === 'error' ? theme.colors.danger : theme.colors.success,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: resetStatus.type === 'error' ? theme.colors.danger : theme.colors.success,
                    textAlign: 'center',
                  }}
                >
                  {resetStatus.text}
                </Text>
              </View>
            ) : null}

            {/* Actions */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setForgotModalOpen(false)}
                disabled={resetLoading}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{ fontWeight: '700', color: theme.colors.text }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSendPasswordReset}
                disabled={resetLoading || !resetEmail.trim() || resetCooldown > 0}
                style={{
                  flex: 1.4,
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: primaryButtonColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: resetLoading || !resetEmail.trim() || resetCooldown > 0 ? 0.6 : 1,
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{ fontWeight: '800', color: '#FFFFFF' }}
                >
                  {resetLoading ? 'Sending...' : resetCooldown > 0 ? `Resend in ${resetCooldown}s` : 'Send Link'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
