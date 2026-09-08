import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  AtSign,
  Camera,
  Check,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  Mail,
  ShieldAlert,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { DeleteAccountModal } from '@/components/account/DeleteAccountModal';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import {
  changePassword,
  removeAvatar,
  sendEmailChangeOtp,
  signOutAllDevices,
  updateProfile,
  uploadAvatar,
  verifyEmailChangeOtpAndChangeEmail,
} from '@/services/auth';

export default function ProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();
  const router = useRouter();

  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'SpendFlow User';
  const userEmail = profile?.email || '';

  // ── Avatar ──
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Name ──
  const [nameInput, setNameInput] = useState(profile?.display_name ?? '');
  const [savingName, setSavingName] = useState(false);

  // ── Email change (OTP verified against the CURRENT email first) ──
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailStep, setEmailStep] = useState<'new_email' | 'otp_input'>('new_email');
  const [emailInput, setEmailInput] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);
  const [emailError, setEmailError] = useState('');

  // ── Password change ──
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Keep the field in sync if the profile hydrates after this screen mounts
  useEffect(() => {
    if (profile?.display_name) {
      setNameInput(profile.display_name);
    }
  }, [profile?.display_name]);

  // ── Danger zone ──
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  function back() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as any);
    }
  }

  async function runImagePicker(fromCamera: boolean) {
    setAvatarSheetOpen(false);
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast({
          message: fromCamera
            ? 'Camera permission is required to take a photo.'
            : 'Photo library access is required to choose a picture.',
          type: 'error',
        });
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      setUploadingAvatar(true);
      try {
        await uploadAvatar({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          base64: asset.base64,
        });
        await refreshProfile(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        showToast({ message: 'Profile photo updated.' });
      } finally {
        setUploadingAvatar(false);
      }
    } catch (err) {
      setUploadingAvatar(false);
      showToast({
        message: err instanceof Error ? err.message : 'Could not update the profile photo.',
        type: 'error',
      });
    }
  }

  async function handleRemoveAvatar() {
    setAvatarSheetOpen(false);
    try {
      setUploadingAvatar(true);
      await removeAvatar();
      await refreshProfile(true);
      showToast({ message: 'Profile photo removed.' });
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Could not remove the profile photo.',
        type: 'error',
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === profile?.display_name) return;
    setSavingName(true);
    try {
      await updateProfile({ display_name: trimmed });
      await refreshProfile(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showToast({ message: `Name updated to "${trimmed}"` });
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      Alert.alert(t('common_error'), err instanceof Error ? err.message : t('common_error'));
    } finally {
      setSavingName(false);
    }
  }

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function openEmailModal() {
    setEmailStep('new_email');
    setEmailInput('');
    setEmailOtpCode('');
    setEmailError('');
    setEmailModalOpen(true);
  }

  /** STEP 1 → 2: validate the new address, then send an OTP to the CURRENT email. */
  async function handleSendEmailCode(isResend = false) {
    const clean = emailInput.trim();
    if (!EMAIL_REGEX.test(clean)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (clean.toLowerCase() === userEmail.toLowerCase()) {
      setEmailError('This is already your current email.');
      return;
    }
    setSendingEmailOtp(true);
    setEmailError('');
    try {
      const res = await sendEmailChangeOtp(userEmail);
      if (res?.rateLimited) {
        setEmailError('Email rate limit reached. Please wait before requesting another code.');
        return;
      }
      setEmailStep('otp_input');
      if (isResend) {
        showToast({ message: `A new 6-digit code was sent to ${userEmail}.` });
      }
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send the security code. Please try again.');
    } finally {
      setSendingEmailOtp(false);
    }
  }

  /** STEP 2: verify the OTP against the current email, then submit the change. */
  async function handleVerifyEmailCode() {
    if (emailOtpCode.trim().length < 6) {
      setEmailError('Please enter the 6-digit code.');
      return;
    }
    setVerifyingEmailOtp(true);
    setEmailError('');
    try {
      const { confirmationPending } = await verifyEmailChangeOtpAndChangeEmail(userEmail, emailOtpCode, emailInput);
      setEmailModalOpen(false);
      setEmailInput('');
      setEmailOtpCode('');
      await refreshProfile(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showToast({
        message: confirmationPending
          ? `Code verified. Confirmation link sent to ${emailInput.trim()} — verify it to finish the change.`
          : 'Code verified. Email updated successfully.',
        duration: 4500,
      });
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not update the email.');
    } finally {
      setVerifyingEmailOtp(false);
    }
  }

  async function handleSavePassword() {
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    setPasswordError('');
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showToast({ message: 'Password changed successfully.' });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSignOutAll() {
    setSigningOutAll(true);
    try {
      await signOutAllDevices();
      setSignOutAllOpen(false);
      router.replace('/(auth)' as any);
    } catch (err) {
      setSigningOutAll(false);
      Alert.alert(t('common_error'), err instanceof Error ? err.message : 'Failed to sign out.');
    }
  }

  const sectionLabelStyle = {
    color: theme.colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.1,
    fontWeight: '700' as const,
    fontSize: 11,
  };

  const menuCardStyle = {
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
  };

  const rowPressable = () => ({ pressed }: { pressed: boolean }) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: pressed
      ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
      : 'transparent',
  });

  const iconBadgeStyle = (tint: string) => ({
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: tint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  });

  const modalShellStyle = {
    width: '100%' as const,
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  };

  const modalInputStyle = (hasError: boolean) => ({
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: hasError ? theme.colors.danger : theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.text,
  });

  const formButtonRowStyle = { flexDirection: 'row' as const, gap: 10, marginTop: 4 };

  const secondaryButtonStyle = {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  };

  const primaryButtonStyle = {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
  };

  const dangerButtonStyle = {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.danger,
    alignItems: 'center' as const,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── HEADER ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 14,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Pressable
          onPress={back}
          hitSlop={10}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme.colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <ArrowLeft size={16} color={theme.colors.text} />
        </Pressable>

        <View style={{ alignItems: 'center' }}>
          <Text variant="h3" style={{ fontWeight: '800', fontSize: 17.5, lineHeight: 22 }}>
            {t('profile_title') || 'Profile'}
          </Text>
          <Text variant="caption" muted style={{ fontSize: 10.5, lineHeight: 13 }}>
            {t('profile_subtitle') || 'Account & security'}
          </Text>
        </View>

        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* ── AVATAR HERO ── */}
        <View style={{ alignItems: 'center', gap: 10, marginTop: 8 }}>
          <Pressable
            onPress={() => setAvatarSheetOpen(true)}
            disabled={uploadingAvatar}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <View style={{ position: 'relative' }}>
              <Avatar uri={profile?.avatar_url} name={displayName} size={104} />
              {uploadingAvatar ? (
                <View
                  style={{
                    position: 'absolute',
                    width: 104,
                    height: 104,
                    borderRadius: theme.radius.full,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
              {/* Camera badge — pixel-locked so it never shifts while uploading */}
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.primary,
                  borderWidth: 2.5,
                  borderColor: theme.colors.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Camera size={15} color="#FFFFFF" />
              </View>
            </View>
          </Pressable>

          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 }}>
              {displayName}
            </Text>
            <Text variant="caption" muted style={{ fontSize: 12 }}>
              {userEmail || 'SpendFlow Account'}
            </Text>
          </View>
        </View>

        {/* ── ACCOUNT INFORMATION ── */}
        <View style={{ gap: 10 }}>
          <Text style={sectionLabelStyle}>
            {t('profile_section_account') || 'Account Information'}
          </Text>

          <View style={menuCardStyle}>
            {/* Display name */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={iconBadgeStyle(theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3')}>
                  <User size={19} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                    {t('profile_display_name') || 'Display Name'}
                  </Text>
                  <TextInput
                    value={nameInput}
                    onChangeText={setNameInput}
                    onEndEditing={handleSaveName}
                    placeholder={t('profile_name_placeholder') || 'Enter your name'}
                    placeholderTextColor={theme.colors.textMuted}
                    returnKeyType="done"
                    style={{
                      height: 44,
                      borderRadius: theme.radius.md,
                      borderWidth: 1.5,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceElevated,
                      paddingHorizontal: 12,
                      fontSize: 15,
                      fontWeight: '600',
                      color: theme.colors.text,
                    }}
                  />
                </View>
                <Pressable
                  onPress={handleSaveName}
                  disabled={savingName || !nameInput.trim() || nameInput.trim() === profile?.display_name}
                  style={({ pressed }) => ({
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: theme.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: savingName || !nameInput.trim() || nameInput.trim() === profile?.display_name ? 0.4 : pressed ? 0.8 : 1,
                  })}
                >
                  {savingName ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Check size={17} color="#FFFFFF" />
                  )}
                </Pressable>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

            {/* Email */}
            <Pressable
              onPress={openEmailModal}
              style={rowPressable()}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                <View style={iconBadgeStyle(theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3')}>
                  <AtSign size={19} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                    {t('profile_email') || 'Email Address'}
                  </Text>
                  <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 12 }}>
                    {userEmail}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.primary }}>
                {t('profile_email_change') || 'Change'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── SECURITY ── */}
        <View style={{ gap: 10 }}>
          <Text style={sectionLabelStyle}>
            {t('profile_section_security') || 'Security'}
          </Text>

          <View style={menuCardStyle}>
            {/* Change password */}
            <Pressable
              onPress={() => {
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setPasswordError('');
                setPasswordModalOpen(true);
              }}
              style={rowPressable()}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                <View style={iconBadgeStyle(theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3')}>
                  <KeyRound size={19} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                    {t('profile_change_password') || 'Change Password'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 12 }}>
                    {t('profile_change_password_sub') || 'Verify your current password first'}
                  </Text>
                </View>
              </View>
            </Pressable>

            <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

            {/* Sign out all devices */}
            <Pressable
              onPress={() => setSignOutAllOpen(true)}
              style={rowPressable()}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                <View style={iconBadgeStyle(theme.colors.brassTint)}>
                  <LogOut size={19} color={theme.colors.warning} />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                    {t('profile_signout_all') || 'Sign Out All Devices'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 12 }}>
                    {t('profile_signout_all_sub') || 'Ends every active session for this account'}
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── DANGER ZONE ── */}
        <View style={{ gap: 10 }}>
          <Text style={[sectionLabelStyle, { color: theme.colors.danger }]}>
            {t('profile_section_danger') || 'Danger Zone'}
          </Text>

          <View style={[menuCardStyle, { borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.35)' : '#F1DCD3' }]}>
            <Pressable
              onPress={() => setDeleteModalOpen(true)}
              style={rowPressable()}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                <View style={iconBadgeStyle(theme.colors.rustTint)}>
                  <Trash2 size={19} color={theme.colors.danger} />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.danger }}>
                    {t('profile_delete_account') || 'Delete Account & Data'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 12 }}>
                    {t('profile_delete_account_sub') || 'Permanently wipes everything — requires email OTP'}
                  </Text>
                </View>
              </View>
              <ShieldAlert size={17} color={theme.colors.danger} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* ── AVATAR ACTION SHEET ── */}
      <Modal
        visible={avatarSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarSheetOpen(false)}
      >
        <Pressable
          onPress={() => setAvatarSheetOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={modalShellStyle}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={iconBadgeStyle(theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3')}>
                  <Camera size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    {t('profile_photo_title') || 'Profile Photo'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    {t('profile_photo_sub') || 'Square crop, ~1 MB max recommended'}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setAvatarSheetOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={15} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => runImagePicker(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 12,
                  borderRadius: theme.radius.md,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                }}
              >
                <Camera size={18} color={theme.colors.primary} />
                <Text style={{ fontWeight: '700', color: theme.colors.text, fontSize: 14 }}>
                  {t('profile_photo_camera') || 'Take Photo'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => runImagePicker(false)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 12,
                  borderRadius: theme.radius.md,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                }}
              >
                <ImageIcon size={18} color={theme.colors.primary} />
                <Text style={{ fontWeight: '700', color: theme.colors.text, fontSize: 14 }}>
                  {t('profile_photo_gallery') || 'Choose from Gallery'}
                </Text>
              </Pressable>

              {profile?.avatar_url ? (
                <Pressable
                  onPress={handleRemoveAvatar}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    borderRadius: theme.radius.md,
                    borderWidth: 1.5,
                    borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.4)' : '#F1DCD3',
                    backgroundColor: theme.colors.rustTint,
                  }}
                >
                  <Trash2 size={18} color={theme.colors.danger} />
                  <Text style={{ fontWeight: '700', color: theme.colors.danger, fontSize: 14 }}>
                    {t('profile_photo_remove') || 'Remove Photo'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── CHANGE EMAIL MODAL ── */}
      <Modal
        visible={emailModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailModalOpen(false)}
      >
        <Pressable
          onPress={() => setEmailModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={modalShellStyle}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={iconBadgeStyle(theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3')}>
                  <Mail size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    {t('profile_email_change_title') || 'Change Email'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    {t('profile_email_change_sub') || 'A confirmation link may be sent'}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setEmailModalOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={15} color={theme.colors.text} />
              </Pressable>
            </View>

            {emailStep === 'new_email' ? (
              <>
                {/* STEP 1: NEW EMAIL + REQUEST OTP TO CURRENT EMAIL */}
                <View style={{ gap: 8 }}>
                  <Text variant="label" style={{ fontSize: 12 }}>
                    {t('profile_email_new') || 'New Email Address'}
                  </Text>
                  <TextInput
                    value={emailInput}
                    onChangeText={(v) => {
                      setEmailInput(v);
                      if (emailError) setEmailError('');
                    }}
                    placeholder="name@example.com"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    style={modalInputStyle(Boolean(emailError))}
                  />

                  {/* Security target box — mirrors the delete-flow pattern */}
                  <View
                    style={{
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
                      {t('profile_email_otp_note') || 'Security code will be sent to your current email:'}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.text }}>
                      {userEmail}
                    </Text>
                  </View>

                  {emailError ? (
                    <Text variant="caption" style={{ color: theme.colors.danger, fontWeight: '600' }}>
                      {emailError}
                    </Text>
                  ) : null}
                </View>

                <View style={formButtonRowStyle}>
                  <Pressable onPress={() => setEmailModalOpen(false)} style={secondaryButtonStyle}>
                    <Text style={{ fontWeight: '700', color: theme.colors.text }}>
                      {t('common_cancel') || 'Cancel'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleSendEmailCode(false)}
                    disabled={sendingEmailOtp}
                    style={[primaryButtonStyle, { opacity: sendingEmailOtp ? 0.7 : 1 }]}
                  >
                    {sendingEmailOtp ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                        {t('profile_email_send_code') || 'Send Security Code'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {/* STEP 2: VERIFY OTP SENT TO THE CURRENT EMAIL */}
                <View style={{ alignItems: 'center', gap: 10, paddingTop: 2 }}>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: theme.colors.primary,
                    }}
                  >
                    <Mail size={24} color={theme.colors.primary} />
                  </View>

                  <View style={{ gap: 4, alignItems: 'center' }}>
                    <Text variant="h3" style={{ fontWeight: '900', fontSize: 17, textAlign: 'center', color: theme.colors.text }}>
                      {t('profile_email_step2_title') || 'Check Your Current Email'}
                    </Text>
                    <Text muted style={{ fontSize: 12.5, textAlign: 'center', lineHeight: 18 }}>
                      {t('profile_email_step2_sub') || 'Enter the 6-digit security code sent to'}{'\n'}
                      <Text style={{ fontWeight: '800', color: theme.colors.text }}>{userEmail}</Text>
                    </Text>
                  </View>

                  <TextInput
                    value={emailOtpCode}
                    onChangeText={(val) => {
                      setEmailOtpCode(val.replace(/\D/g, '').slice(0, 6));
                      if (emailError) setEmailError('');
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
                      borderColor: emailError ? theme.colors.danger : theme.colors.primary,
                      fontSize: 24,
                      fontWeight: '900',
                      letterSpacing: 8,
                      textAlign: 'center',
                      color: theme.colors.text,
                    }}
                  />

                  {emailError ? (
                    <Text style={{ fontSize: 12, color: theme.colors.danger, textAlign: 'center', fontWeight: '600' }}>
                      {emailError}
                    </Text>
                  ) : null}

                  <Pressable
                    onPress={() => handleSendEmailCode(true)}
                    disabled={sendingEmailOtp}
                    hitSlop={8}
                  >
                    <Text variant="caption" muted style={{ fontSize: 12, textDecorationLine: 'underline', color: theme.colors.primary }}>
                      {sendingEmailOtp
                        ? 'Resending...'
                        : t('profile_email_resend') || "Didn't receive email? Resend code"}
                    </Text>
                  </Pressable>
                </View>

                <View style={formButtonRowStyle}>
                  <Pressable
                    onPress={() => {
                      setEmailStep('new_email');
                      setEmailOtpCode('');
                      setEmailError('');
                    }}
                    disabled={verifyingEmailOtp}
                    style={secondaryButtonStyle}
                  >
                    <Text style={{ fontWeight: '700', color: theme.colors.text }}>
                      {t('profile_email_back') || 'Back'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleVerifyEmailCode}
                    disabled={verifyingEmailOtp || emailOtpCode.length < 6}
                    style={[primaryButtonStyle, { opacity: verifyingEmailOtp || emailOtpCode.length < 6 ? 0.6 : 1 }]}
                  >
                    {verifyingEmailOtp ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                        {t('profile_email_verify') || 'Verify & Update'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── CHANGE PASSWORD MODAL ── */}
      <Modal
        visible={passwordModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <Pressable
          onPress={() => setPasswordModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={modalShellStyle}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={iconBadgeStyle(theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3')}>
                  <KeyRound size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    {t('profile_change_password') || 'Change Password'}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    {t('profile_change_password_sub') || 'Verify your current password first'}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setPasswordModalOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={15} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <View style={{ gap: 6 }}>
                <Text variant="label" style={{ fontSize: 12 }}>
                  {t('profile_password_current') || 'Current Password'}
                </Text>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  style={modalInputStyle(false)}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text variant="label" style={{ fontSize: 12 }}>
                  {t('profile_password_new') || 'New Password (min 6 characters)'}
                </Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  style={modalInputStyle(false)}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text variant="label" style={{ fontSize: 12 }}>
                  {t('profile_password_confirm') || 'Confirm New Password'}
                </Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    if (passwordError) setPasswordError('');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  style={modalInputStyle(Boolean(passwordError))}
                />
              </View>

              {passwordError ? (
                <Text variant="caption" style={{ color: theme.colors.danger, fontWeight: '600' }}>
                  {passwordError}
                </Text>
              ) : null}
            </View>

            <View style={formButtonRowStyle}>
              <Pressable onPress={() => setPasswordModalOpen(false)} style={secondaryButtonStyle}>
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>
                  {t('common_cancel') || 'Cancel'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSavePassword}
                disabled={savingPassword}
                style={[primaryButtonStyle, { opacity: savingPassword ? 0.7 : 1 }]}
              >
                {savingPassword ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                    {t('profile_password_save') || 'Change Password'}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── SIGN OUT ALL DEVICES CONFIRM ── */}
      <Modal
        visible={signOutAllOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !signingOutAll && setSignOutAllOpen(false)}
      >
        <Pressable
          onPress={() => !signingOutAll && setSignOutAllOpen(false)}
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
            style={[modalShellStyle, { borderRadius: 24, padding: 22 }]}
          >
            <View style={{ alignItems: 'center', gap: 12, paddingTop: 6 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: theme.colors.brassTint,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: theme.colors.warning,
                }}
              >
                <LogOut size={26} color={theme.colors.warning} />
              </View>

              <View style={{ gap: 6, alignItems: 'center' }}>
                <Text variant="h2" style={{ fontWeight: '900', fontSize: 19, textAlign: 'center', color: theme.colors.text }}>
                  {t('profile_signout_all_confirm_title') || 'Sign out everywhere?'}
                </Text>
                <Text muted style={{ fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
                  {t('profile_signout_all_confirm_body') || 'Every signed-in device — including this one — will be logged out and must sign in again.'}
                </Text>
              </View>
            </View>

            <View style={formButtonRowStyle}>
              <Pressable
                onPress={() => setSignOutAllOpen(false)}
                disabled={signingOutAll}
                style={secondaryButtonStyle}
              >
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>
                  {t('common_cancel') || 'Cancel'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSignOutAll}
                disabled={signingOutAll}
                style={[primaryButtonStyle, { opacity: signingOutAll ? 0.7 : 1 }]}
              >
                {signingOutAll ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                    {t('profile_signout_all_go') || 'Sign Out All'}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── DELETE ACCOUNT (EMAIL OTP WIPE) ── */}
      <DeleteAccountModal
        visible={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        email={userEmail}
        onDeleted={() => router.replace('/(auth)' as any)}
      />
    </KeyboardAvoidingView>
  );
}
