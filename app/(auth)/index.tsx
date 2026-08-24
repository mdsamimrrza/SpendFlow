import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Globe, Lock, Mail, ShieldCheck, Sparkles, User } from 'lucide-react-native';
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
  const [loading, setLoading] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', displayName: '' } });

  function switchMode(nextMode: 'signin' | 'signup') {
    setMode(nextMode);
    setStatus(null);
  }

  async function submit(values: FormValues) {
    setLoading(true);
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
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setStatus({ text: t('common_loading'), type: 'info' });
    try {
      const res = await signInWithGoogle();
      if (res && 'session' in res && res.session) {
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Google sign-in was cancelled or failed.';
      setStatus({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
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
            loading={loading}
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
            loading={loading}
            onPress={handleGoogleSignIn}
            style={{ height: 48, borderRadius: theme.radius.md }}
          />

          {/* Forgot Password Link */}
          {mode === 'signin' ? (
            <Pressable
              onPress={form.handleSubmit((values) =>
                resetPassword(values.email)
                  .then(() => setStatus({ text: 'Password reset link sent to your email.', type: 'success' }))
                  .catch((error) => setStatus({ text: error.message, type: 'error' })),
              )}
              style={{ minHeight: 36, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text variant="caption" muted style={{ textAlign: 'center' }}>
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
    </KeyboardAvoidingView>
  );
}
