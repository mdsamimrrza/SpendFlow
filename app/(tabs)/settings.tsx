import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell,
  Check,
  ChevronRight,
  DollarSign,
  Download,
  Edit2,
  Fingerprint,
  Globe,
  HelpCircle,
  Info,
  KeyRound,
  Layers,
  LayoutGrid,
  Lock,
  LogOut,
  Mail,
  Moon,
  Palette,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  User,
  Wallet,
  X,
} from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { CategoryBudgetFormModal } from '@/components/expense/CategoryBudgetFormModal';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useSecurity } from '@/hooks/useSecurity';
import { useTheme } from '@/hooks/useTheme';
import {
  deleteAccount,
  sendDeleteAccountOtp,
  signOut,
  updateProfile,
  verifyDeleteAccountOtpAndWipe,
} from '@/services/auth';
import { listCategories } from '@/services/categories';
import { resetBudgetAlertHistory } from '@/services/notifications';
import { Category, ThemePreference } from '@/types';
import { formatMoney } from '@/utils/format';

export default function SettingsScreen() {
  const { profile, refreshProfile } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const { isBiometricEnabled, isBiometricSupported, biometricTypeName, toggleBiometric } = useSecurity();
  const theme = useTheme();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Modals state
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [showCategoryBudgets, setShowCategoryBudgets] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteOtpStep, setDeleteOtpStep] = useState<'confirm' | 'otp_input'>('confirm');
  const [deleteOtpCode, setDeleteOtpCode] = useState('');
  const [sendingDeleteOtp, setSendingDeleteOtp] = useState(false);
  const [verifyingDeleteOtp, setVerifyingDeleteOtp] = useState(false);
  const [deleteFallbackCode, setDeleteFallbackCode] = useState<string | null>(null);
  const [deleteOtpError, setDeleteOtpError] = useState('');
  const [signOutModalOpen, setSignOutModalOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Form inputs
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'Samim Reza';
  const userEmail = profile?.email || 'samim.reza@example.com';

  // Compute initials (e.g. "SR")
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('') || 'SR';

  const CURRENCY_OPTIONS = [
    { code: 'INR', label: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
    { code: 'NPR', label: 'Nepalese Rupee', symbol: 'Rs.', flag: '🇳🇵' },
    { code: 'USD', label: 'US Dollar', symbol: '$', flag: '🇺🇸' },
    { code: 'EUR', label: 'Euro', symbol: '€', flag: '🇪🇺' },
    { code: 'GBP', label: 'British Pound', symbol: '£', flag: '🇬🇧' },
  ];

  const currentCurrencyObj = CURRENCY_OPTIONS.find((c) => c.code === preferredCurrency) || CURRENCY_OPTIONS[0];

  useEffect(() => {
    if (profile?.id) {
      listCategories(profile.id)
        .then(setCategories)
        .catch(() => setCategories([]));
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.display_name) {
      setNameInput(profile.display_name);
    }
  }, [profile?.display_name]);

  useEffect(() => {
    if (profile?.monthly_budget !== undefined) {
      setBudgetInput(profile.monthly_budget ? String(profile.monthly_budget) : '');
    }
  }, [profile?.monthly_budget]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      if (profile?.id) {
        const cats = await listCategories(profile.id);
        setCategories(cats);
      }
    } finally {
      setRefreshing(false);
    }
  };

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      await updateProfile({ display_name: nameInput.trim() });
      await refreshProfile();
      setEditProfileModalOpen(false);
    } catch (err) {
      Alert.alert(t('common_error'), err instanceof Error ? err.message : t('common_error'));
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveBudget() {
    setSavingBudget(true);
    try {
      const numeric = budgetInput.trim() ? Number(budgetInput.replace(/[^0-9.]/g, '')) : null;
      await updateProfile({ monthly_budget: numeric });
      await resetBudgetAlertHistory();
      await refreshProfile();
      setBudgetModalOpen(false);
    } catch (err) {
      Alert.alert(t('common_error'), err instanceof Error ? err.message : t('common_error'));
    } finally {
      setSavingBudget(false);
    }
  }

  function handleSignOut() {
    setSignOutModalOpen(true);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* ── 1. HEADER (MANAGE YOUR ACCOUNT / SETTINGS) ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <View style={{ gap: 2 }}>
            <Text
              variant="caption"
              style={{
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 1.1,
                fontSize: 11,
                color: theme.colors.textMuted,
              }}
            >
              Preferences & Limits
            </Text>
            <Text
              variant="h1"
              style={{
                fontWeight: '800',
                fontSize: 30,
                letterSpacing: -0.5,
                color: theme.colors.text,
              }}
            >
              {t('settings_title') || 'Settings'}
            </Text>
          </View>

          {/* Top Right Controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PrivacyEyeButton />
            <ThemeToggle />
          </View>
        </View>

        {/* ── 2. PREVIOUS LUXURY USER PROFILE HERO CARD ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 16,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
            borderWidth: 1.5,
            borderColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: theme.isDark ? 0.2 : 0.08,
            shadowRadius: 10,
            elevation: 3,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
            {/* Real User Avatar with Online Status Indicator */}
            <View style={{ position: 'relative' }}>
              <Avatar uri={profile?.avatar_url} name={displayName} size={58} />
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 15,
                  height: 15,
                  borderRadius: 7.5,
                  backgroundColor: theme.colors.success,
                  borderWidth: 2,
                  borderColor: theme.colors.surface,
                }}
              />
            </View>

            {/* Name & Email */}
            <View style={{ gap: 2, flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 18,
                  fontWeight: '800',
                  color: theme.colors.text,
                  letterSpacing: -0.3,
                }}
              >
                {displayName}
              </Text>
              <Text
                numberOfLines={1}
                variant="caption"
                muted
                style={{
                  fontSize: 12,
                }}
              >
                {profile?.email || 'SpendFlow Account'}
              </Text>
            </View>
          </View>

          {/* Edit Button Pill */}
          <Pressable
            onPress={() => setEditProfileModalOpen(true)}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: theme.radius.full,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
              Edit
            </Text>
          </Pressable>
        </View>

        {/* ── 3. UNIFIED GROUPED SETTINGS MENU (AS IN THE DESIGN) ── */}
        <View
          style={{
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: theme.isDark ? 0.2 : 0.04,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          {/* Item 1: Currency */}
          <Pressable
            onPress={() => setCurrencyModalOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed
                ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <DollarSign size={19} color={theme.colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                Currency
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14, color: theme.colors.textMuted, fontWeight: '500' }}>
                {currentCurrencyObj.code} ({currentCurrencyObj.symbol})
              </Text>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>

          {/* Dotted Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

          {/* Item 2: Monthly Budget */}
          <Pressable
            onPress={() => setBudgetModalOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed
                ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Layers size={19} color={theme.colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                Monthly budget
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14, color: theme.colors.textMuted, fontWeight: '500' }}>
                {monthlyBudget > 0 ? formatMoney(monthlyBudget, preferredCurrency) : 'Set limit'}
              </Text>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>

          {/* Dotted Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

          {/* Item 3: Gold & Silver Bullion Rates (Dedicated Screen) */}
          <Pressable
            onPress={() => router.push('/bullion' as any)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed
                ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
                }}
              >
                <Text style={{ fontSize: 19 }}>🪙</Text>
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                  Gold & Silver Rates
                </Text>
                <Text variant="caption" muted style={{ fontSize: 11 }}>
                  Live 24K, 22K & Silver spot prices
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5',
                }}
              >
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#10B981' }} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}>
                  Live
                </Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>

          {/* Dotted Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

          {/* Item 4: Notifications & Security */}
          <Pressable
            onPress={() => setSecurityModalOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed
                ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bell size={19} color={theme.colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                Notifications
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14, color: theme.colors.textMuted, fontWeight: '500' }}>
                {isBiometricEnabled ? 'On' : 'Active'}
              </Text>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>

          {/* Dotted Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

          {/* Item 4: Appearance & Dark Mode */}
          <Pressable
            onPress={() => setAppearanceModalOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed
                ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {theme.isDark ? <Moon size={19} color={theme.colors.primary} /> : <Sun size={19} color={theme.colors.primary} />}
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                Theme
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textMuted,
                  fontWeight: '500',
                  textTransform: 'capitalize',
                }}
              >
                {theme.themePreference === 'system' ? 'System' : theme.themePreference === 'dark' ? 'Dark' : 'Light'}
              </Text>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>

          {/* Dotted Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

          {/* Item 5: Language Selector */}
          <Pressable
            onPress={() => setLanguageModalOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed
                ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Globe size={19} color={theme.colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                Language
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textMuted,
                  fontWeight: '500',
                }}
              >
                {language === 'en' ? '🇺🇸 English' : language === 'hi' ? '🇮🇳 हिन्दी' : '🇳🇵 नेपाली'}
              </Text>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>

          {/* Dotted Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

          {/* Item 5: Export Data */}
          <Pressable
            onPress={() => router.push('/export' as any)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed
                ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Upload size={19} color={theme.colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                Export data
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14, color: theme.colors.textMuted, fontWeight: '500' }}>
                CSV / PDF
              </Text>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>

          {/* Dotted Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16, opacity: 0.6 }} />

          {/* Item 6: Manage Categories */}
          <Pressable
            onPress={() => setShowCategoryBudgets(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed
                ? (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LayoutGrid size={19} color={theme.colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                Manage categories
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14, color: theme.colors.textMuted, fontWeight: '500' }}>
                {categories.length}
              </Text>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>
        </View>

        {/* ── 4. SIGN OUT BUTTON (RUST ACCENT) ── */}
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => ({
            width: '100%',
            paddingVertical: 14,
            borderRadius: theme.radius.full,
            borderWidth: 1.5,
            borderColor: theme.isDark ? 'rgba(239,68,68,0.35)' : '#F1DCD3',
            backgroundColor: theme.isDark ? 'rgba(239,68,68,0.1)' : '#F7F5EC',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 4,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: theme.colors.danger || '#A5442B',
            }}
          >
            Sign out
          </Text>
        </Pressable>

        {/* Delete Account Link */}
        <Pressable
          onPress={() => setDeleteModalOpen(true)}
          style={({ pressed }) => ({
            alignSelf: 'center',
            padding: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text variant="caption" muted style={{ textDecorationLine: 'underline', fontSize: 11 }}>
            Delete account & data
          </Text>
        </Pressable>
      </ScrollView>

      {/* ══════════════════════════════════════════════
          MODALS & BOTTOM SHEETS
         ══════════════════════════════════════════════ */}

      {/* ── 1. MONTHLY BUDGET MODAL ── */}
      <Modal
        visible={budgetModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBudgetModalOpen(false)}
      >
        <Pressable
          onPress={() => setBudgetModalOpen(false)}
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
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              padding: 20,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Layers size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Monthly Budget
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Set your maximum monthly ceiling
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setBudgetModalOpen(false)}
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
              <Text variant="label" style={{ fontSize: 12 }}>
                Monthly Amount ({currentCurrencyObj.symbol})
              </Text>
              <TextInput
                value={budgetInput}
                onChangeText={(t) => setBudgetInput(t.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 14000"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                style={{
                  height: 48,
                  borderRadius: theme.radius.md,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  paddingHorizontal: 14,
                  fontSize: 16,
                  fontWeight: '700',
                  color: theme.colors.text,
                }}
              />
            </View>

            {/* Preset Amount Chips */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {[5000, 10000, 14000, 25000, 50000].map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => setBudgetInput(String(preset))}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>
                    {currentCurrencyObj.symbol}{preset.toLocaleString()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setBudgetModalOpen(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
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
                onPress={handleSaveBudget}
                disabled={savingBudget}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                  {savingBudget ? 'Saving...' : 'Save Limit'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 2. EDIT PROFILE NAME MODAL ── */}
      <Modal
        visible={editProfileModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditProfileModalOpen(false)}
      >
        <Pressable
          onPress={() => setEditProfileModalOpen(false)}
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
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              padding: 20,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Edit Profile
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Update your account display name
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setEditProfileModalOpen(false)}
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
              <Text variant="label" style={{ fontSize: 12 }}>
                Full Name
              </Text>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Enter your name"
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  height: 48,
                  borderRadius: theme.radius.md,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  paddingHorizontal: 14,
                  fontSize: 16,
                  fontWeight: '600',
                  color: theme.colors.text,
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setEditProfileModalOpen(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
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
                onPress={handleSaveName}
                disabled={savingName}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                  {savingName ? 'Saving...' : 'Save Name'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 3. CURRENCY SELECTION MODAL ── */}
      <Modal
        visible={currencyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyModalOpen(false)}
      >
        <Pressable
          onPress={() => setCurrencyModalOpen(false)}
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
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              padding: 20,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <DollarSign size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Select Currency
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Primary display currency for accounts
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setCurrencyModalOpen(false)}
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
              {CURRENCY_OPTIONS.map((cur) => {
                const isSelected = preferredCurrency === cur.code;
                return (
                  <Pressable
                    key={cur.code}
                    onPress={async () => {
                      await updateProfile({ preferred_currency: cur.code as any });
                      await refreshProfile();
                      setCurrencyModalOpen(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderRadius: theme.radius.md,
                      borderWidth: 1.5,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: isSelected
                        ? (theme.isDark ? 'rgba(129, 140, 248, 0.16)' : '#DCE9E3')
                        : theme.colors.surfaceElevated,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 20 }}>{cur.flag}</Text>
                      <View>
                        <Text style={{ fontWeight: '800', fontSize: 14, color: isSelected ? theme.colors.primary : theme.colors.text }}>
                          {cur.code} · {cur.symbol}
                        </Text>
                        <Text variant="caption" muted style={{ fontSize: 11 }}>
                          {cur.label}
                        </Text>
                      </View>
                    </View>

                    {isSelected ? (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: theme.colors.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={13} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 4. APPEARANCE & DARK MODE MODAL ── */}
      <Modal
        visible={appearanceModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAppearanceModalOpen(false)}
      >
        <Pressable
          onPress={() => setAppearanceModalOpen(false)}
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
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              padding: 20,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sun size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Theme
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Choose your preferred appearance
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setAppearanceModalOpen(false)}
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

            {/* Theme Options */}
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { key: 'light' as ThemePreference, label: 'Light', icon: Sun },
                  { key: 'dark' as ThemePreference, label: 'Dark', icon: Moon },
                  { key: 'system' as ThemePreference, label: 'System', icon: Palette },
                ].map((opt) => {
                  const isSelected = theme.themePreference === opt.key;
                  const IconComp = opt.icon;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => theme.setThemePreference(opt.key)}
                      style={{
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: theme.radius.md,
                        borderWidth: 1.5,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: isSelected
                          ? (theme.isDark ? 'rgba(129, 140, 248, 0.16)' : '#DCE9E3')
                          : theme.colors.surfaceElevated,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <IconComp size={20} color={isSelected ? theme.colors.primary : theme.colors.textMuted} />
                      <Text style={{ fontSize: 13, fontWeight: isSelected ? '800' : '600', color: isSelected ? theme.colors.primary : theme.colors.text }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 5. LANGUAGE SELECTOR MODAL ── */}
      <Modal
        visible={languageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalOpen(false)}
      >
        <Pressable
          onPress={() => setLanguageModalOpen(false)}
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
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              padding: 20,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Globe size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Select Language
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Choose your display language
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setLanguageModalOpen(false)}
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

            {/* Language Options List */}
            <View style={{ gap: 8 }}>
              {[
                { code: 'en', name: 'English', native: 'English (US)', flag: '🇺🇸' },
                { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
                { code: 'ne', name: 'Nepali', native: 'नेपाली', flag: '🇳🇵' },
              ].map((l) => {
                const isActive = language === l.code;
                return (
                  <Pressable
                    key={l.code}
                    onPress={() => {
                      setLanguage(l.code as any);
                      setLanguageModalOpen(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderRadius: theme.radius.md,
                      borderWidth: 1.5,
                      borderColor: isActive ? theme.colors.primary : theme.colors.border,
                      backgroundColor: isActive
                        ? (theme.isDark ? 'rgba(129, 140, 248, 0.16)' : '#DCE9E3')
                        : theme.colors.surfaceElevated,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                      <View>
                        <Text style={{ fontWeight: '800', fontSize: 14, color: isActive ? theme.colors.primary : theme.colors.text }}>
                          {l.name}
                        </Text>
                        <Text variant="caption" muted style={{ fontSize: 11 }}>
                          {l.native}
                        </Text>
                      </View>
                    </View>

                    {isActive ? (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: theme.colors.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={13} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 5. NOTIFICATIONS & SECURITY MODAL ── */}
      <Modal
        visible={securityModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSecurityModalOpen(false)}
      >
        <Pressable
          onPress={() => setSecurityModalOpen(false)}
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
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              padding: 20,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.15)' : '#DCE9E3',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShieldCheck size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Security & Lock
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Biometric authentication & privacy
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setSecurityModalOpen(false)}
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

            {/* Biometric Toggle Switch */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Fingerprint size={20} color={theme.colors.primary} />
                <View style={{ gap: 2 }}>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: theme.colors.text }}>
                    Biometric Lock
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    {biometricTypeName || 'Fingerprint / Face ID'}
                  </Text>
                </View>
              </View>

              <Switch
                value={isBiometricEnabled}
                onValueChange={(val) => {
                  void toggleBiometric(val).then((success) => {
                    if (!success && val) {
                      Alert.alert(t('common_error'), t('security_not_supported'));
                    }
                  });
                }}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 6. CATEGORY BUDGET CONFIGURATION FORM MODAL ── */}
      <CategoryBudgetFormModal
        visible={showCategoryBudgets}
        onClose={() => setShowCategoryBudgets(false)}
        onSaved={() => {
          if (profile?.id) listCategories(profile.id).then(setCategories);
        }}
      />

      {/* ── 7. PERMANENT DELETE ACCOUNT & DATA OTP MODAL ── */}
      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !sendingDeleteOtp && !verifyingDeleteOtp && setDeleteModalOpen(false)}
      >
        <Pressable
          onPress={() => !sendingDeleteOtp && !verifyingDeleteOtp && setDeleteModalOpen(false)}
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
            {deleteOtpStep === 'confirm' ? (
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
                      {userEmail}
                    </Text>
                  </View>

                  {deleteOtpError ? (
                    <Text style={{ fontSize: 12, color: theme.colors.danger, textAlign: 'center', fontWeight: '600' }}>
                      {deleteOtpError}
                    </Text>
                  ) : null}
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Pressable
                    onPress={() => setDeleteModalOpen(false)}
                    disabled={sendingDeleteOtp}
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
                    onPress={async () => {
                      if (!userEmail) return;
                      setSendingDeleteOtp(true);
                      setDeleteOtpError('');
                      try {
                        const res = await sendDeleteAccountOtp(userEmail);
                        if (res?.rateLimited && res.emergencyCode) {
                          setDeleteFallbackCode(res.emergencyCode);
                        } else {
                          setDeleteFallbackCode(null);
                        }
                        setDeleteOtpStep('otp_input');
                      } catch (err: any) {
                        setDeleteOtpError(err?.message || 'Failed to send OTP to your email. Please try again.');
                      } finally {
                        setSendingDeleteOtp(false);
                      }
                    }}
                    disabled={sendingDeleteOtp}
                    style={{
                      flex: 1.4,
                      paddingVertical: 13,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.colors.danger,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: sendingDeleteOtp ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                      {sendingDeleteOtp ? 'Sending...' : 'Send OTP to Email'}
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
                      {deleteFallbackCode ? 'Security Code Bypass' : 'Check Your Email'}
                    </Text>
                    <Text muted style={{ fontSize: 12.5, textAlign: 'center', lineHeight: 18 }}>
                      {deleteFallbackCode ? (
                        'Enter the 6-digit confirmation code below'
                      ) : (
                        <>
                          Enter the 6-digit security code sent to{'\n'}
                          <Text style={{ fontWeight: '800', color: theme.colors.text }}>{userEmail}</Text>
                        </>
                      )}
                    </Text>
                  </View>

                  {/* Supabase Rate Limit Emergency Bypass Notice */}
                  {deleteFallbackCode ? (
                    <View
                      style={{
                        width: '100%',
                        padding: 12,
                        borderRadius: 14,
                        backgroundColor: theme.isDark ? 'rgba(234, 179, 8, 0.15)' : '#FEF3C7',
                        borderWidth: 1,
                        borderColor: theme.isDark ? 'rgba(234, 179, 8, 0.4)' : '#FCD34D',
                        gap: 3,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: theme.isDark ? '#FBBF24' : '#B45309', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        ⚡ Email Rate Limit Bypass
                      </Text>
                      <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.text, letterSpacing: 5 }}>
                        {deleteFallbackCode}
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 11, textAlign: 'center' }}>
                        Supabase email quota reached. Type this code to delete now.
                      </Text>
                    </View>
                  ) : null}

                  {/* 6-Digit OTP Text Input */}
                  <TextInput
                    value={deleteOtpCode}
                    onChangeText={(val) => {
                      setDeleteOtpCode(val.replace(/\D/g, '').slice(0, 6));
                      if (deleteOtpError) setDeleteOtpError('');
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
                      borderColor: deleteOtpError ? theme.colors.danger : theme.colors.primary,
                      fontSize: 24,
                      fontWeight: '900',
                      letterSpacing: 8,
                      textAlign: 'center',
                      color: theme.colors.text,
                    }}
                  />

                  {deleteOtpError ? (
                    <Text style={{ fontSize: 12, color: theme.colors.danger, textAlign: 'center', fontWeight: '600' }}>
                      {deleteOtpError}
                    </Text>
                  ) : null}

                  {/* Resend Link (only when not rate-limited) */}
                  {!deleteFallbackCode ? (
                    <Pressable
                      onPress={async () => {
                        if (!userEmail) return;
                        setSendingDeleteOtp(true);
                        setDeleteOtpError('');
                        try {
                          const res = await sendDeleteAccountOtp(userEmail);
                          if (res?.rateLimited && res.emergencyCode) {
                            setDeleteFallbackCode(res.emergencyCode);
                          } else {
                            Alert.alert('Sent', 'A new 6-digit OTP code was sent to your email.');
                          }
                        } catch (err: any) {
                          setDeleteOtpError(err?.message || 'Failed to resend OTP.');
                        } finally {
                          setSendingDeleteOtp(false);
                        }
                      }}
                      disabled={sendingDeleteOtp}
                      hitSlop={8}
                    >
                      <Text variant="caption" muted style={{ fontSize: 12, textDecorationLine: 'underline', color: theme.colors.primary }}>
                        {sendingDeleteOtp ? 'Resending...' : "Didn't receive email? Resend code"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Pressable
                    onPress={() => {
                      setDeleteOtpStep('confirm');
                      setDeleteOtpCode('');
                      setDeleteOtpError('');
                    }}
                    disabled={verifyingDeleteOtp}
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
                    onPress={async () => {
                      if (!deleteOtpCode.trim() || deleteOtpCode.trim().length < 6) {
                        setDeleteOtpError('Please enter the 6-digit code.');
                        return;
                      }
                      setVerifyingDeleteOtp(true);
                      setDeleteOtpError('');
                      try {
                        await verifyDeleteAccountOtpAndWipe(userEmail, deleteOtpCode, deleteFallbackCode || undefined);
                        setDeleteModalOpen(false);
                        router.replace('/(auth)' as any);
                      } catch (err: any) {
                        setDeleteOtpError(err?.message || 'Invalid or expired OTP code');
                      } finally {
                        setVerifyingDeleteOtp(false);
                      }
                    }}
                    disabled={verifyingDeleteOtp || deleteOtpCode.length < 6}
                    style={{
                      flex: 1.6,
                      paddingVertical: 13,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.colors.danger,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: verifyingDeleteOtp || deleteOtpCode.length < 6 ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: '#FFFFFF', fontSize: 13.5 }}>
                      {verifyingDeleteOtp ? 'Wiping Data...' : 'Verify & Delete'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 8. SIGN OUT CONFIRMATION MODAL ── */}
      <Modal
        visible={signOutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !signingOut && setSignOutModalOpen(false)}
      >
        <Pressable
          onPress={() => !signingOut && setSignOutModalOpen(false)}
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
              maxWidth: 360,
              backgroundColor: theme.colors.surface,
              borderRadius: 24,
              padding: 22,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            <View style={{ alignItems: 'center', gap: 12, paddingTop: 6 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
                }}
              >
                <LogOut size={26} color={theme.colors.danger} />
              </View>

              <View style={{ gap: 6, alignItems: 'center' }}>
                <Text variant="h2" style={{ fontWeight: '900', fontSize: 19, textAlign: 'center', color: theme.colors.text }}>
                  Sign out of SpendFlow?
                </Text>
                <Text muted style={{ fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
                  You will need to sign back in with your credentials to access your financial records.
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={() => setSignOutModalOpen(false)}
                disabled={signingOut}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  opacity: signingOut ? 0.6 : 1,
                }}
              >
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  setSigningOut(true);
                  try {
                    await signOut();
                    setSignOutModalOpen(false);
                    router.replace('/(auth)' as any);
                  } catch (err: any) {
                    Alert.alert('Error', err?.message || 'Failed to sign out');
                  } finally {
                    setSigningOut(false);
                  }
                }}
                disabled={signingOut}
                style={{
                  flex: 1.2,
                  paddingVertical: 13,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.danger,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: signingOut ? 0.7 : 1,
                }}
              >
                <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                  {signingOut ? 'Signing out...' : 'Sign Out'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
