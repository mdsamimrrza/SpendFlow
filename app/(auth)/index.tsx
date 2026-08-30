import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, User, X } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { z } from 'zod';
import { SpendFlowSealLogo } from '@/components/ui/SpendFlowSealLogo';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/services/auth';

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
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
  const { refreshSession } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const theme = useTheme();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [status, setStatus] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Focus states for responsive active glow border
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  // Forgot Password Modal
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', displayName: '' },
  });

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

  function switchMode(nextMode: 'signin' | 'signup') {
    void Haptics.selectionAsync().catch(() => undefined);
    setMode(nextMode);
    setStatus(null);
  }

  async function submit(values: FormValues) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setEmailLoading(true);
    setStatus(null);
    try {
      const email = values.email.trim();
      if (mode === 'signin') {
        const res = await signInWithEmail(email, values.password);
        if (res?.session) {
          setStatus(null);
          router.replace('/(tabs)');
          return;
        }
        const s = await refreshSession();
        if (s) {
          setStatus(null);
          router.replace('/(tabs)');
          return;
        }
      } else {
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

  function handleOpenForgotPassword() {
    const currentEmail = form.getValues('email')?.trim() || '';
    setResetEmail(currentEmail);
    setResetStatus(null);
    setForgotModalOpen(true);
  }

  async function handleSendPasswordReset() {
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setResetStatus({ text: 'Please enter a valid email address.', type: 'error' });
      return;
    }

    setResetLoading(true);
    setResetStatus(null);
    try {
      await resetPassword(resetEmail.trim());
      setResetStatus({
        text: 'Password reset link sent! Check your email inbox.',
        type: 'success',
      });
    } catch (error) {
      setResetStatus({
        text: error instanceof Error ? error.message : 'Failed to send password reset link.',
        type: 'error',
      });
    } finally {
      setResetLoading(false);
    }
  }

  function showValidationError() {
    const firstError = Object.values(form.formState.errors)[0]?.message;
    setStatus({
      text: typeof firstError === 'string' ? firstError : 'Please fill in all required fields.',
      type: 'error',
    });
  }

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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 420, gap: 12 }}>
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

          {/* ── HERO BRAND HEADER: SINGLE GOLDEN 'S' SEAL + TITLE + SUBTITLE ── */}
          <View style={{ alignItems: 'center', gap: 3, width: '100%', marginTop: 2, marginBottom: 2 }}>
            <SpendFlowSealLogo size={54} isDark={theme.isDark} />

            <Text
              style={{
                fontSize: 28,
                fontWeight: '900',
                letterSpacing: -0.5,
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
                fontSize: 13,
                color: theme.colors.textMuted,
                fontWeight: '500',
                letterSpacing: 0.2,
                textAlign: 'center',
              }}
            >
              Your personal ledger
            </Text>
          </View>

          {/* ── AUTH MAIN FORM CARD ── */}
          <View
            style={{
              width: '100%',
              backgroundColor: cardBgColor,
              borderRadius: 20,
              borderWidth: 1.2,
              borderColor: cardBorderColor,
              padding: 16,
              gap: 12,
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
                        minHeight: 50,
                        borderRadius: 12,
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
                PASSWORD
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

            {/* Primary Submit Button (Sign in / Create account) */}
            <Pressable
              onPress={form.handleSubmit(submit, showValidationError)}
              disabled={emailLoading || googleLoading}
              style={({ pressed }) => ({
                width: '100%',
                height: 46,
                borderRadius: 12,
                backgroundColor: primaryButtonColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
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
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </Pressable>
          </View>

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
            disabled={emailLoading || googleLoading}
            style={({ pressed }) => ({
              width: '100%',
              height: 46,
              borderRadius: 12,
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
                <Text style={{ fontSize: 15, fontWeight: '600', color: textColor }}>
                  Google
                </Text>
              </>
            )}
          </Pressable>

          {/* ── BOTTOM FOOTER: TOGGLE SIGN IN / SIGN UP ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4, width: '100%' }}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 6, width: '100%' }}>
            <ShieldCheck size={13} color={theme.colors.success} />
            <Text variant="caption" muted style={{ fontSize: 11 }}>
              End-to-End Encrypted Cloud Storage
            </Text>
          </View>
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
              Enter your account email address below to receive password recovery instructions.
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
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setForgotModalOpen(false)}
                disabled={resetLoading}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleSendPasswordReset}
                disabled={resetLoading || !resetEmail.trim()}
                style={{
                  flex: 1.4,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: primaryButtonColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: resetLoading || !resetEmail.trim() ? 0.6 : 1,
                }}
              >
                <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                  {resetLoading ? 'Sending...' : 'Send Link'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
