import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { signInWithEmail, signInWithGoogle, signUpWithEmail, resetPassword } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { useState } from 'react';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function AuthScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', displayName: '' } });
  async function submit(values: FormValues) {
    setLoading(true);
    setMessage(mode === 'signin' ? 'Signing in...' : 'Creating account...');
    try {
      const email = values.email.trim();
      if (mode === 'signin') await signInWithEmail(email, values.password);
      else await signUpWithEmail(email, values.password, values.displayName?.trim());
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  function showValidationError() {
    const firstError = Object.values(form.formState.errors)[0]?.message;
    setMessage(typeof firstError === 'string' ? firstError : 'Please enter a valid email and password.');
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.xl }}
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h1">SpendFlow</Text>
          <Text muted>Track spending, sync offline entries, and understand where your money goes.</Text>
        </View>
        <Card style={{ gap: theme.spacing.lg }}>
          {mode === 'signup' ? (
            <Controller control={form.control} name="displayName" render={({ field }) => <Input label="Display name" value={field.value} onChangeText={field.onChange} />} />
          ) : null}
          <Controller control={form.control} name="email" render={({ field, fieldState }) => <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
          <Controller control={form.control} name="password" render={({ field, fieldState }) => <Input label="Password" secureTextEntry value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
          {message ? <Text style={{ color: theme.colors.danger }}>{message}</Text> : null}
          <Button title={mode === 'signin' ? 'Sign In' : 'Create Account'} icon={Mail} loading={loading} onPress={form.handleSubmit(submit, showValidationError)} />
          <Button title="Continue with Google" variant="secondary" onPress={() => signInWithGoogle().catch((error) => setMessage(error.message))} />
          <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="label" style={{ color: theme.colors.primary, textAlign: 'center' }}>
              {mode === 'signin' ? 'Create a new account' : 'I already have an account'}
            </Text>
          </Pressable>
          <Pressable
            onPress={form.handleSubmit((values) => resetPassword(values.email).then(() => setMessage('Password reset email sent.')).catch((error) => setMessage(error.message)))}
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
