import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/services/auth';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function AuthScreen() {
  const router = useRouter();
  const { refreshSession } = useAuth();
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
    setStatus({ text: mode === 'signin' ? 'Signing in...' : 'Creating account...', type: 'info' });
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
        text: error instanceof Error ? error.message : 'Authentication failed. Please try again.',
        type: 'error',
      });
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.xl }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: theme.spacing.xs, paddingRight: theme.spacing.md }}>
            <Text variant="h1">SpendFlow</Text>
            <Text muted>Track spending, sync offline entries, and understand where your money goes.</Text>
          </View>
          <ThemeToggle />
        </View>
        <Card style={{ gap: theme.spacing.lg }}>
          {mode === 'signup' ? (
            <Controller control={form.control} name="displayName" render={({ field }) => <Input label="Display name" value={field.value} onChangeText={field.onChange} />} />
          ) : null}
          <Controller control={form.control} name="email" render={({ field, fieldState }) => <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
          <Controller control={form.control} name="password" render={({ field, fieldState }) => <Input label="Password" secureTextEntry value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
          {status ? <Text style={{ color: textColor }}>{status.text}</Text> : null}
          <Button title={mode === 'signin' ? 'Sign In' : 'Create Account'} icon={Mail} loading={loading} onPress={form.handleSubmit(submit, showValidationError)} />
          <Button
            title="Continue with Google"
            variant="secondary"
            onPress={() => signInWithGoogle().catch((error) => setStatus({ text: error.message, type: 'error' }))}
          />
          <Pressable onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="label" style={{ color: theme.colors.primary, textAlign: 'center' }}>
              {mode === 'signin' ? 'Create a new account' : 'I already have an account'}
            </Text>
          </Pressable>
          <Pressable
            onPress={form.handleSubmit((values) =>
              resetPassword(values.email)
                .then(() => setStatus({ text: 'Password reset link sent to your email.', type: 'success' }))
                .catch((error) => setStatus({ text: error.message, type: 'error' })),
            )}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              Forgot password?
            </Text>
          </Pressable>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
