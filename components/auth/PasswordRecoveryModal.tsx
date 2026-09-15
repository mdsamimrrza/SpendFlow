import React, { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { KeyRound } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/utils/supabase';

/**
 * Shown after a password-recovery deep link has logged the user in but the
 * OLD password is still active. The recovery session (minted by GoTrue's
 * /verify redirect) lets updateUser({ password }) succeed without knowing the
 * current password — that is the whole point of the reset flow.
 */
export function PasswordRecoveryModal() {
  const theme = useTheme();
  const { session, passwordRecoveryPending, completePasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!(passwordRecoveryPending && session)) return null;

  const inputStyle = {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: error ? theme.colors.danger : theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
  } as const;

  async function handleSave() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword('');
      setConfirm('');
      completePasswordRecovery();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showToast({ message: 'Password updated — your account is secure.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={completePasswordRecovery}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 24,
            gap: 14,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: `${theme.colors.primary}1A`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <KeyRound size={22} color={theme.colors.primary} />
          </View>

          <View style={{ gap: 4 }}>
            <Text variant="h3" style={{ fontWeight: '800' }}>
              Set a new password
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13.5, lineHeight: 20 }}>
              You verified your email. Choose a new password to finish resetting your account.
            </Text>
          </View>

          <TextInput
            value={password}
            onChangeText={(v) => { setPassword(v); if (error) setError(''); }}
            placeholder="New password (min 8 characters)"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
          />
          <TextInput
            value={confirm}
            onChangeText={(v) => { setConfirm(v); if (error) setError(''); }}
            placeholder="Confirm new password"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
            onSubmitEditing={handleSave}
          />

          {error ? (
            <Text style={{ color: theme.colors.danger, fontSize: 12.5, fontWeight: '600' }}>{error}</Text>
          ) : null}

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radius.md,
              paddingVertical: 14,
              alignItems: 'center',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>
              {saving ? 'Updating…' : 'Update password'}
            </Text>
          </Pressable>

          <Pressable onPress={completePasswordRecovery} disabled={saving} style={{ alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 13 }}>
              I'll do this later
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
