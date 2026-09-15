import React, { useEffect, useMemo, useState } from 'react';
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
  AtSign,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  Mail,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { DeleteAccountModal } from '@/components/account/DeleteAccountModal';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useSecurity } from '@/hooks/useSecurity';
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
  const { t, language } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  const { isBiometricEnabled, biometricTypeName, isBiometricSupported, beginSystemCapture, endSystemCapture } = useSecurity();

  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'SpendFlow User';
  const userEmail = profile?.email || '';

  // "Member since" line on the identity card — localized month-year stamp.
  const memberSince = useMemo(() => {
    if (!profile?.created_at) return null;
    try {
      return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : language === 'ne' ? 'ne-NP' : 'en-US', {
        month: 'short',
        year: 'numeric',
      }).format(new Date(profile.created_at));
    } catch {
      return null;
    }
  }, [profile?.created_at, language]);

  // ── Avatar ──
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Name (inline reveal editor on the identity card) ──
  const [nameInput, setNameInput] = useState(profile?.display_name ?? '');
  const [nameEditOpen, setNameEditOpen] = useState(false);
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
      // Same capture suppression as the receipt flow: the camera/picker is a
      // separate Android activity and would re-trigger the biometric lock.
      beginSystemCapture();
      let result;
      try {
        result = fromCamera
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      } finally {
        endSystemCapture();
      }

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
    if (!trimmed || trimmed === profile?.display_name) {
      setNameEditOpen(false);
      return;
    }
    setSavingName(true);
    try {
      await updateProfile({ display_name: trimmed });
      await refreshProfile(true);
      setNameEditOpen(false);
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
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
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

  const formButtonRowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginTop: 4 };

  const secondaryButtonStyle = {
    flex: 1,
    height: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const primaryButtonStyle = {
    flex: 1,
    height: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const dangerButtonStyle = {
    flex: 1,
    height: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.danger,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
          <ChevronLeft size={17} color={theme.colors.text} />
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
        contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* ══════════════ 1. IDENTITY HERO CARD ══════════════ */}
        {/* Avatar, name, and verified email fused into one gradient banner.
            Editing the photo happens right here — tap the camera chip. */}
        <View
          style={{
            borderRadius: 24,
            padding: 20,
            gap: 16,
            borderWidth: 1.5,
            borderColor: theme.isDark ? 'rgba(129, 140, 248, 0.35)' : theme.colors.primary,
            backgroundColor: theme.isDark ? '#111827' : theme.colors.cardHighlight,
            shadowColor: theme.isDark ? '#818CF8' : '#0F5C4D',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: theme.isDark ? 0.18 : 0.12,
            shadowRadius: 24,
            elevation: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable
              onPress={() => setAvatarSheetOpen(true)}
              disabled={uploadingAvatar}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ position: 'relative' }}>
                <Avatar uri={profile?.avatar_url} name={displayName} size={78} />
                {uploadingAvatar ? (
                  <View
                    style={{
                      position: 'absolute',
                      width: 78,
                      height: 78,
                      borderRadius: theme.radius.full,
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
                {/* Compact camera chip — bottom-right, pixel-locked */}
                <View
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: 27,
                    height: 27,
                    borderRadius: 14,
                    backgroundColor: theme.colors.primary,
                    borderWidth: 2.5,
                    borderColor: theme.isDark ? '#111827' : theme.colors.cardHighlight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Camera size={13} color="#FFFFFF" />
                </View>
              </View>
            </Pressable>

            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text
                  style={{ fontSize: 19, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3, flex: 1 }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {displayName}
                </Text>
                <ShieldCheck size={17} color={theme.colors.success} />
              </View>
              <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 12 }}>
                {userEmail || 'SpendFlow Account'}
              </Text>
              {memberSince ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <CalendarDays size={11} color={theme.colors.faint} />
                  <Text variant="caption" style={{ fontSize: 10.5, color: theme.colors.faint, fontWeight: '600' }}>
                    {t('profile_member_since') || 'Member since'} {memberSince}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Inline display-name editor — pencil reveals the input in place,
              no modal. Save button appears only while the name differs. */}
          {nameEditOpen ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 10,
                borderRadius: 16,
                backgroundColor: theme.isDark ? 'rgba(17, 24, 39, 0.6)' : theme.colors.surface,
                borderWidth: 1.5,
                borderColor: theme.colors.border,
              }}
            >
              <TextInput
                autoFocus
                value={nameInput}
                onChangeText={setNameInput}
                onEndEditing={handleSaveName}
                onSubmitEditing={handleSaveName}
                placeholder={t('profile_name_placeholder') || 'Enter your name'}
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                maxLength={60}
                style={{
                  flex: 1,
                  height: 42,
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
              <Pressable
                onPress={handleSaveName}
                disabled={savingName || !nameInput.trim() || nameInput.trim() === profile?.display_name}
                style={({ pressed }) => ({
                  width: 42,
                  height: 42,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity:
                    savingName || !nameInput.trim() || nameInput.trim() === profile?.display_name
                      ? 0.4
                      : pressed
                        ? 0.8
                        : 1,
                })}
              >
                {savingName ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Check size={18} color="#FFFFFF" />
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  setNameInput(profile?.display_name ?? '');
                  setNameEditOpen(false);
                }}
                disabled={savingName}
                hitSlop={6}
                style={({ pressed }) => ({
                  width: 42,
                  height: 42,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <X size={16} color={theme.colors.text} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setNameInput(profile?.display_name ?? '');
                setNameEditOpen(true);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                paddingVertical: 10.5,
                borderRadius: 14,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: theme.isDark ? 'rgba(129, 140, 248, 0.4)' : theme.colors.border,
                backgroundColor: pressed
                  ? theme.isDark
                    ? 'rgba(129, 140, 248, 0.08)'
                    : 'rgba(15, 92, 77, 0.06)'
                  : 'transparent',
              })}
            >
              <Pencil size={14} color={theme.colors.primary} />
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.colors.primary }}>
                {t('profile_edit_identity') || 'Edit Display Name'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ══════════════ 2. PROTECTION STATUS STRIP ══════════════ */}
        {/* Live glance: email verified + app-lock state, mirrored from the
            SecurityContext — reassures without opening Settings. */}
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              gap: 6,
              paddingVertical: 12,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.isDark ? 'rgba(16, 185, 129, 0.3)' : '#CFE3D6',
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <ShieldCheck size={13} color={theme.colors.success} />
              <Text
                variant="caption"
                style={{ fontSize: 10, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}
                numberOfLines={1}
              >
                {t('profile_email_status') || 'Email'}
              </Text>
            </View>
            <Text
              style={{ fontSize: 12.5, fontWeight: '900', color: theme.colors.success }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('profile_status_verified') || 'Verified & Secured'}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              gap: 6,
              paddingVertical: 12,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: isBiometricEnabled
                ? theme.isDark
                  ? 'rgba(16, 185, 129, 0.3)'
                  : '#CFE3D6'
                : theme.colors.border,
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Fingerprint size={13} color={isBiometricEnabled ? theme.colors.success : theme.colors.textMuted} />
              <Text
                variant="caption"
                style={{ fontSize: 10, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}
                numberOfLines={1}
              >
                {t('profile_app_lock_status') || 'App Lock'}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: '900',
                color: isBiometricEnabled ? theme.colors.success : theme.colors.textMuted,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {isBiometricEnabled
                ? biometricTypeName || 'Biometric'
                : isBiometricSupported
                  ? t('profile_app_lock_off') || 'Off — Enable in Settings'
                  : t('profile_app_lock_unsupported') || 'Not Supported'}
            </Text>
          </View>
        </View>

        {/* ══════════════ 3. ACCOUNT ACTIONS (2×2 TILE GRID) ══════════════ */}
        {/* Flat tappable tiles replace the stacked list — each opens its
            flow directly, chevron points at the modal it launches. */}
        <View style={{ gap: 10 }}>
          <Text style={sectionLabelStyle}>
            {t('profile_section_account') || 'Account Information'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
            {/* Tile: Email */}
            <Pressable
              onPress={openEmailModal}
              style={({ pressed }) => ({
                flex: 1,
                gap: 10,
                padding: 14,
                borderRadius: 18,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: pressed
                  ? theme.colors.primary
                  : theme.colors.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: theme.colors.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AtSign size={19} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.colors.text }}>
                  {t('profile_email') || 'Email Address'}
                </Text>
                <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10.5 }}>
                  {userEmail}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.primary }}>
                  {t('profile_email_change') || 'Change'}
                </Text>
                <ChevronRight size={13} color={theme.colors.primary} />
              </View>
            </Pressable>

            {/* Tile: Password */}
            <Pressable
              onPress={() => {
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setPasswordError('');
                setPasswordModalOpen(true);
              }}
              style={({ pressed }) => ({
                flex: 1,
                gap: 10,
                padding: 14,
                borderRadius: 18,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: pressed
                  ? theme.colors.primary
                  : theme.colors.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: theme.colors.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={19} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.colors.text }}>
                  {t('profile_change_password') || 'Change Password'}
                </Text>
                <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10.5 }}>
                  {t('profile_change_password_sub') || 'Verify your current password first'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.primary }}>
                  {t('profile_tile_open') || 'Open'}
                </Text>
                <ChevronRight size={13} color={theme.colors.primary} />
              </View>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
            {/* Tile: Sessions */}
            <Pressable
              onPress={() => setSignOutAllOpen(true)}
              style={({ pressed }) => ({
                flex: 1,
                gap: 10,
                padding: 14,
                borderRadius: 18,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: pressed
                  ? theme.colors.warning
                  : theme.colors.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: theme.colors.brassTint,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LogOut size={19} color={theme.colors.warning} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.colors.text }}>
                  {t('profile_signout_all') || 'Sign Out All Devices'}
                </Text>
                <Text variant="caption" muted numberOfLines={2} style={{ fontSize: 10.5 }}>
                  {t('profile_signout_all_sub') || 'Ends every active session for this account'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.warning }}>
                  {t('profile_tile_sessions') || 'Sessions'}
                </Text>
                <ChevronRight size={13} color={theme.colors.warning} />
              </View>
            </Pressable>

            {/* Tile: App Lock → routes to Settings (the single source of
                truth for the biometric toggle) */}
            <Pressable
              onPress={() => router.push('/(tabs)/settings' as any)}
              style={({ pressed }) => ({
                flex: 1,
                gap: 10,
                padding: 14,
                borderRadius: 18,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: pressed
                  ? theme.colors.primary
                  : theme.colors.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: theme.colors.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Fingerprint size={19} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.colors.text }}>
                  {t('profile_app_lock_title') || 'App Lock & Biometrics'}
                </Text>
                <Text variant="caption" muted numberOfLines={2} style={{ fontSize: 10.5 }}>
                  {t('profile_app_lock_sub') || 'Face ID / Fingerprint protection lives in Settings'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.primary }}>
                  {t('profile_tile_manage') || 'Manage'}
                </Text>
                <ChevronRight size={13} color={theme.colors.primary} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* ══════════════ 4. DANGER ZONE ══════════════ */}
        {/* Deliberately stark: a single enclosed red cell, unlike the
            friendly tiles above — destruction should look different. */}
        <View style={{ gap: 10 }}>
          <Text style={[sectionLabelStyle, { color: theme.colors.danger }]}>
            {t('profile_section_danger') || 'Danger Zone'}
          </Text>

          <Pressable
            onPress={() => setDeleteModalOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              borderRadius: 18,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.5)' : theme.colors.danger,
              backgroundColor: pressed ? theme.colors.rustTint : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 13,
                backgroundColor: theme.colors.rustTint,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.4)' : '#F1DCD3',
              }}
            >
              <Trash2 size={19} color={theme.colors.danger} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: theme.colors.danger }}>
                {t('profile_delete_account') || 'Delete Account & Data'}
              </Text>
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                {t('profile_delete_account_sub') || 'Permanently wipes everything — requires email OTP'}
              </Text>
            </View>
            <ShieldAlert size={17} color={theme.colors.danger} />
          </Pressable>
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
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={{ fontWeight: '700', color: theme.colors.text }}
                    >
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
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={{ fontWeight: '800', color: '#FFFFFF' }}
                      >
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
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={{ fontWeight: '700', color: theme.colors.text }}
                    >
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
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={{ fontWeight: '800', color: '#FFFFFF' }}
                      >
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
                  {t('profile_password_new') || 'New Password (min 8 characters)'}
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
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{ fontWeight: '700', color: theme.colors.text }}
                >
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
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{ fontWeight: '800', color: '#FFFFFF' }}
                  >
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
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{ fontWeight: '700', color: theme.colors.text }}
                >
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
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{ fontWeight: '800', color: '#FFFFFF' }}
                  >
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
