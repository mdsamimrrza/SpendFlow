import React, { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { Mail, ShieldAlert } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { useTheme } from '@/hooks/useTheme';
import { sendDeleteAccountOtp, verifyDeleteAccountOtpAndWipe } from '@/services/auth';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  /** Account email the OTP is sent to. */
  email: string;
  /** Called after the account and all data have been wiped. */
  onDeleted: () => void;
}

/**
 * Two-step account deletion: warning + email OTP request, then code entry and
 * irreversible wipe of all cloud + local data (services/auth.deleteAccount).
 */
export function DeleteAccountModal({ visible, onClose, email, onDeleted }: DeleteAccountModalProps) {
  const theme = useTheme();

  const [step, setStep] = useState<'confirm' | 'otp_input'>('confirm');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Fresh state on every open so a previously cancelled attempt never leaks in
  useEffect(() => {
    if (visible) {
      setStep('confirm');
      setOtpCode('');
      setOtpError('');
      setSending(false);
      setVerifying(false);
    }
  }, [visible]);

  async function handleSendOtp() {
    if (!email) return;
    setSending(true);
    setOtpError('');
    try {
      const res = await sendDeleteAccountOtp(email);
      if (res?.rateLimited) {
        setOtpError('Email rate limit reached. Please wait before requesting another delete code.');
        return;
      }
      setStep('otp_input');
      if (step === 'otp_input') {
        showToast({ message: 'A new 6-digit OTP code was sent to your email.' });
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Failed to send OTP to your email. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setOtpError('Please enter the 6-digit code.');
      return;
    }
    setVerifying(true);
    setOtpError('');
    try {
      await verifyDeleteAccountOtpAndWipe(email, otpCode);
      onClose();
      onDeleted();
    } catch (err: any) {
      setOtpError(err?.message || 'Invalid or expired OTP code');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={() => !sending && !verifying && onClose()}
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
          {step === 'confirm' ? (
            <>
              {/* STEP 1: WARNING & REQUEST OTP */}
              <View style={{ alignItems: 'center', gap: 12, paddingTop: 4 }}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 27,
                    backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
                  }}
                >
                  <ShieldAlert size={28} color={theme.colors.danger} />
                </View>

                <View style={{ gap: 6, alignItems: 'center' }}>
                  <Text variant="h2" style={{ fontWeight: '900', fontSize: 19, textAlign: 'center', color: theme.colors.text }}>
                    Delete Account & Data?
                  </Text>
                  <Text muted style={{ fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
                    This will permanently wipe all transactions, subscriptions, custom categories, and profile data.
                  </Text>
                </View>

                {/* Security Target Email Box */}
                <View
                  style={{
                    width: '100%',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                    Security OTP will be sent to:
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.text }}>
                    {email}
                  </Text>
                </View>

                {otpError ? (
                  <Text style={{ fontSize: 12, color: theme.colors.danger, textAlign: 'center', fontWeight: '600' }}>
                    {otpError}
                  </Text>
                ) : null}
              </View>

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={onClose}
                  disabled={sending}
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
                  onPress={handleSendOtp}
                  disabled={sending}
                  style={{
                    flex: 1.4,
                    paddingVertical: 13,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.danger,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                    {sending ? 'Sending...' : 'Send OTP to Email'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {/* STEP 2: ENTER EMAIL OTP & CONFIRM */}
              <View style={{ alignItems: 'center', gap: 12, paddingTop: 4 }}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 27,
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: theme.colors.primary,
                  }}
                >
                  <Mail size={26} color={theme.colors.primary} />
                </View>

                <View style={{ gap: 4, alignItems: 'center' }}>
                  <Text variant="h2" style={{ fontWeight: '900', fontSize: 19, textAlign: 'center', color: theme.colors.text }}>
                    Check Your Email
                  </Text>
                  <Text muted style={{ fontSize: 12.5, textAlign: 'center', lineHeight: 18 }}>
                    Enter the 6-digit security code sent to{'\n'}
                    <Text style={{ fontWeight: '800', color: theme.colors.text }}>{email}</Text>
                  </Text>
                </View>

                {/* 6-Digit OTP Text Input */}
                <TextInput
                  value={otpCode}
                  onChangeText={(val) => {
                    setOtpCode(val.replace(/\D/g, '').slice(0, 6));
                    if (otpError) setOtpError('');
                  }}
                  placeholder="• • • • • •"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  style={{
                    width: '100%',
                    height: 52,
                    borderRadius: 14,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1.5,
                    borderColor: otpError ? theme.colors.danger : theme.colors.primary,
                    fontSize: 24,
                    fontWeight: '900',
                    letterSpacing: 8,
                    textAlign: 'center',
                    color: theme.colors.text,
                  }}
                />

                {otpError ? (
                  <Text style={{ fontSize: 12, color: theme.colors.danger, textAlign: 'center', fontWeight: '600' }}>
                    {otpError}
                  </Text>
                ) : null}

                {/* Resend Link */}
                <Pressable
                  onPress={handleSendOtp}
                  disabled={sending}
                  hitSlop={8}
                >
                  <Text variant="caption" muted style={{ fontSize: 12, textDecorationLine: 'underline', color: theme.colors.primary }}>
                    {sending ? 'Resending...' : "Didn't receive email? Resend code"}
                  </Text>
                </Pressable>
              </View>

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={() => {
                    setStep('confirm');
                    setOtpCode('');
                    setOtpError('');
                  }}
                  disabled={verifying}
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
                  <Text style={{ fontWeight: '700', color: theme.colors.text }}>Back</Text>
                </Pressable>

                <Pressable
                  onPress={handleVerify}
                  disabled={verifying || otpCode.length < 6}
                  style={{
                    flex: 1.6,
                    paddingVertical: 13,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.danger,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: verifying || otpCode.length < 6 ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontWeight: '800', color: '#FFFFFF', fontSize: 13.5 }}>
                    {verifying ? 'Wiping Data...' : 'Verify & Delete'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
