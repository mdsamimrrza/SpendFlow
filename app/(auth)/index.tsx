import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Image,
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
import { Check, Globe, KeyRound, Lock, Mail, ShieldCheck, Sparkles, User, X } from 'lucide-react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/services/auth';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function AuthScreen() {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const theme = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [status, setStatus] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Dedicated Forgot Password Modal states
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', displayName: '' } });

  useEffect(() => {
    // 1. Parse any error descriptions from OAuth redirects (e.g. #error=server_error)
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
        setStatus({
          text: readable,
          type: 'error',
        });
        setGoogleLoading(false);
        setEmailLoading(false);
      }
    }

    // 2. Check if session was already established or restored
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

    // 3. When returning to tab or app window from OAuth popup or cancellation
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
    setMode(nextMode);
    setStatus(null);
  }

  async function submit(values: FormValues) {
    setEmailLoading(true);
    setStatus({ text: t('common_loading'), type: 'info' });
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
          text: 'Account created! If email confirmation is enabled, check your inbox before logging in.',
          type: 'success',
        });
      }
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : t('common_error'),
        type: 'error',
      });
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setStatus({ text: t('common_loading'), type: 'info' });
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

      // If returned without instant session, auto-release loading after 3.5s
      setTimeout(() => {
        setGoogleLoading(false);
        setStatus((prev) => (prev?.type === 'info' ? null : prev));
      }, 3500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Google sign-in was cancelled or failed.';
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
        text: 'Password reset link sent! Please check your email inbox.',
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
      text: typeof firstError === 'string' ? firstError : 'Please enter a valid email and password (minimum 6 characters).',
      type: 'error',
    });
  }

  const textColor = status?.type === 'error' ? theme.colors.danger : status?.type === 'success' ? '#10B981' : theme.colors.primary;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: theme.spacing.xl,
          paddingTop: 36,
          paddingBottom: 48,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Controls Row (Language Switcher + Theme Toggle) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Quick Language Toggle Pill */}
          <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.full, padding: 3, borderWidth: 1, borderColor: theme.colors.border }}>
            <Pressable
              onPress={() => setLanguage('en')}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: theme.radius.full,
                backgroundColor: language === 'en' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'en' ? '#FFFFFF' : theme.colors.textMuted }}>
                🇺🇸 EN
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLanguage('hi')}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: theme.radius.full,
                backgroundColor: language === 'hi' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'hi' ? '#FFFFFF' : theme.colors.textMuted }}>
                🇮🇳 HI
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLanguage('ne')}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: theme.radius.full,
                backgroundColor: language === 'ne' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: language === 'ne' ? '#FFFFFF' : theme.colors.textMuted }}>
                🇳🇵 NE
              </Text>
            </Pressable>
          </View>

          <ThemeToggle />
        </View>

        {/* Brand Hero Header */}
        <View style={{ alignItems: 'center', gap: theme.spacing.xs, marginVertical: theme.spacing.xs }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              backgroundColor: theme.isDark ? '#141E33' : '#EEF2FF',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: theme.colors.primary,
              shadowColor: theme.colors.primary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 6,
              overflow: 'hidden',
              marginBottom: 4,
            }}
          >
            <Image
              source={require('@/assets/icon.png')}
              style={{ width: 72, height: 72 }}
              resizeMode="cover"
            />
          </View>

          <Text variant="h1" style={{ fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>
            SpendFlow
          </Text>
          <Text muted style={{ fontSize: 13, textAlign: 'center' }}>
            {mode === 'signin' ? t('auth_welcome_back') : t('auth_create_account')}
          </Text>
        </View>

        {/* Auth Main Card */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg, borderColor: theme.colors.border, borderWidth: 1 }}>
          {/* Segmented Sign In / Sign Up Selector */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: theme.colors.surfaceElevated,
              borderRadius: theme.radius.md,
              padding: 4,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Pressable
              onPress={() => switchMode('signin')}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: 'center',
                borderRadius: theme.radius.sm,
                backgroundColor: mode === 'signin' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text
                variant="label"
                style={{
                  fontWeight: '700',
                  color: mode === 'signin' ? '#FFFFFF' : theme.colors.textMuted,
                }}
              >
                {t('auth_sign_in')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => switchMode('signup')}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: 'center',
                borderRadius: theme.radius.sm,
                backgroundColor: mode === 'signup' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text
                variant="label"
                style={{
                  fontWeight: '700',
                  color: mode === 'signup' ? '#FFFFFF' : theme.colors.textMuted,
                }}
              >
                {t('auth_sign_up')}
              </Text>
            </Pressable>
          </View>

          {/* Form Fields */}
          {mode === 'signup' ? (
            <Controller
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <Input
                  label={t('auth_name')}
                  placeholder="e.g. Alex"
                  value={field.value}
                  onChangeText={field.onChange}
                />
              )}
            />
          ) : null}

          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Input
                label={t('auth_email')}
                placeholder="name@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={field.value}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Input
                label={t('auth_password')}
                placeholder="••••••••"
                secureTextEntry
                value={field.value}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />

          {status ? (
            <View style={{ backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: textColor }}>
              <Text variant="caption" style={{ color: textColor, fontWeight: '600', textAlign: 'center' }}>
                {status.text}
              </Text>
            </View>
          ) : null}

          {/* Primary Action Button */}
          <Button
            title={mode === 'signin' ? t('auth_sign_in') : t('auth_sign_up')}
            icon={Mail}
            loading={emailLoading}
            disabled={emailLoading || googleLoading}
            onPress={form.handleSubmit(submit, showValidationError)}
            style={{ height: 50, borderRadius: theme.radius.md, marginTop: 4 }}
          />

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginVertical: 2 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
            <Text variant="caption" muted style={{ fontSize: 11 }}>
              {t('auth_or_continue_with')}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
          </View>

          {/* Google Sign-in Button */}
          <Button
            title={t('auth_continue_google')}
            variant="secondary"
            loading={googleLoading}
            disabled={emailLoading || googleLoading}
            onPress={handleGoogleSignIn}
            style={{ height: 48, borderRadius: theme.radius.md }}
          />

          {/* Forgot Password Link */}
          {mode === 'signin' ? (
            <Pressable
              onPress={handleOpenForgotPassword}
              style={({ pressed }) => ({
                minHeight: 36,
                justifyContent: 'center',
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="caption" muted style={{ textAlign: 'center', textDecorationLine: 'underline' }}>
                {t('auth_forgot_password')}
              </Text>
            </Pressable>
          ) : null}
        </Card>

        {/* Footer Security Badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ShieldCheck size={14} color={theme.colors.success} />
          <Text variant="caption" muted style={{ fontSize: 12 }}>
            {t('settings_cloud_synced')}
          </Text>
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
              maxWidth: 370,
              backgroundColor: theme.colors.surface,
              borderRadius: 24,
              padding: 22,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            {/* Header: Icon + Title + Close Button */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: theme.colors.primary,
                  }}
                >
                  <KeyRound size={22} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 17 }}>
                    Reset Password
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11.5 }}>
                    Receive recovery instructions
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
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <X size={14} color={theme.colors.text} />
              </Pressable>
            </View>

            {/* Instruction description */}
            <Text muted style={{ fontSize: 13, lineHeight: 18 }}>
              Enter your account email address below to receive password reset instructions.
            </Text>

            {/* Email Input Field */}
            <View style={{ gap: 6 }}>
              <Text variant="caption" muted style={{ fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Email Address
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                  height: 48,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1.5,
                  borderColor: resetStatus?.type === 'error' ? theme.colors.danger : theme.colors.border,
                }}
              >
                <Mail size={18} color={theme.colors.textMuted} />
                <TextInput
                  value={resetEmail}
                  onChangeText={(val) => {
                    setResetEmail(val);
                    if (resetStatus) setResetStatus(null);
                  }}
                  placeholder="name@example.com"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: theme.colors.text,
                    fontWeight: '600',
                  }}
                />
              </View>
            </View>

            {/* Status Feedback Message */}
            {resetStatus ? (
              <View
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: resetStatus.type === 'error' ? (theme.isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2') : (theme.isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5'),
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

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setForgotModalOpen(false)}
                disabled={resetLoading}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: theme.radius.md,
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
                  paddingVertical: 13,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: resetLoading || !resetEmail.trim() ? 0.6 : 1,
                }}
              >
                <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
