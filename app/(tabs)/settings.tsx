import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  TextInput,
  TextInputEndEditingEventData,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Fingerprint,
  FlaskConical,
  Globe,
  Languages,
  Lock,
  LogOut,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import { CategoryBudgetFormModal } from '@/components/expense/CategoryBudgetFormModal';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { CURRENCIES } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useSecurity } from '@/hooks/useSecurity';
import { useTheme } from '@/hooks/useTheme';
import { deleteAccount, signOut, updateProfile } from '@/services/auth';
import { listCategories, updateCategoryBudget } from '@/services/categories';
import { seedDemoExpenses } from '@/services/expenses';
import { resetBudgetAlertHistory } from '@/services/notifications';
import { Category } from '@/types';
import { formatMoney } from '@/utils/format';

export default function SettingsScreen() {
  const { profile, refreshProfile } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { isBiometricEnabled, isBiometricSupported, biometricTypeName, toggleBiometric } = useSecurity();
  const theme = useTheme();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryInputs, setCategoryInputs] = useState<Record<string, string>>({});
  const [savingCategoryBudgets, setSavingCategoryBudgets] = useState(false);
  const [categorySuccessMsg, setCategorySuccessMsg] = useState('');
  const [showCategoryBudgets, setShowCategoryBudgets] = useState(false);

  // Controlled budget input with strict numeric filtering
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSuccessMsg, setBudgetSuccessMsg] = useState('');
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const CURRENCY_OPTIONS = [
    { code: 'NPR', label: 'Nepalese Rupee', symbol: 'Rs.', flag: '🇳🇵' },
    { code: 'INR', label: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
    { code: 'USD', label: 'US Dollar', symbol: '$', flag: '🇺🇸' },
    { code: 'EUR', label: 'Euro', symbol: '€', flag: '🇪🇺' },
    { code: 'GBP', label: 'British Pound', symbol: '£', flag: '🇬🇧' },
  ];

  useEffect(() => {
    if (profile?.id) {
      listCategories(profile.id)
        .then((cats) => {
          setCategories(cats);
          const initialMap: Record<string, string> = {};
          cats.forEach((c) => {
            if (c.budget_monthly) initialMap[c.id] = String(c.budget_monthly);
          });
          setCategoryInputs(initialMap);
        })
        .catch(() => setCategories([]));
    }
  }, [profile?.id]);

  async function saveAllCategoryBudgets() {
    setSavingCategoryBudgets(true);
    try {
      const updates = categories.map((cat) => {
        const raw = categoryInputs[cat.id]?.trim().replace(/[^0-9.]/g, '');
        const val = raw && Number(raw) > 0 ? Number(raw) : null;
        return updateCategoryBudget(cat.id, val);
      });
      const updatedCats = await Promise.all(updates);
      setCategories(updatedCats);
      setCategorySuccessMsg('Category limits saved successfully!');
      setTimeout(() => setCategorySuccessMsg(''), 3500);
    } catch (err) {
      Alert.alert(t('common_error'), err instanceof Error ? err.message : t('common_error'));
    } finally {
      setSavingCategoryBudgets(false);
    }
  }

  useEffect(() => {
    if (profile?.monthly_budget !== undefined) {
      setBudgetInput(profile.monthly_budget ? String(profile.monthly_budget) : '');
    }
  }, [profile?.monthly_budget]);

  function handleBudgetInputChange(rawText: string) {
    const cleaned = rawText.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
    setBudgetInput(sanitized);
  }

  async function saveOverallBudget() {
    setSavingBudget(true);
    try {
      const numeric = budgetInput ? Number(budgetInput) : null;
      await updateProfile({ monthly_budget: numeric });
      await resetBudgetAlertHistory();
      await refreshProfile();
      setBudgetSuccessMsg(numeric ? `${t('common_save')}! ${formatMoney(numeric, profile?.preferred_currency)}` : t('settings_no_limit'));
      setTimeout(() => setBudgetSuccessMsg(''), 3500);
    } catch (err) {
      Alert.alert(t('common_error'), err instanceof Error ? err.message : t('common_error'));
    } finally {
      setSavingBudget(false);
    }
  }



  async function loadDemoData() {
    if (!profile?.id) return;
    setSeeding(true);
    try {
      const count = await seedDemoExpenses(profile.id);
      Alert.alert(count ? 'Demo Data Loaded' : 'Already Loaded', count ? `${count} expenses were added.` : 'Demo expenses are already in your account.');
      if (count) router.replace('/');
    } catch (error) {
      Alert.alert(t('common_error'), error instanceof Error ? error.message : t('common_error'));
    } finally {
      setSeeding(false);
    }
  }

  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'SpendFlow User';
  const configuredCategoryCount = categories.filter((c) => c.budget_monthly).length;
  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

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
        {/* ── 1. APP BAR HEADER ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
              Preferences & Limits
            </Text>
            <Text variant="h1" style={{ fontWeight: '800', letterSpacing: -0.3 }}>
              {t('settings_title') || 'Settings'}
            </Text>
          </View>
          <ThemeToggle />
        </View>

        {/* ── 2. LUXURY USER PROFILE HERO CARD ── */}
        <Card
          style={{
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            backgroundColor: theme.isDark ? '#111827' : '#EEF2FF',
            borderWidth: 1.5,
            borderColor: theme.colors.primary,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
              <View style={{ position: 'relative' }}>
                <Avatar uri={profile?.avatar_url} name={displayName} size={58} />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: theme.colors.success,
                    borderWidth: 2,
                    borderColor: theme.colors.surface,
                  }}
                />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h2" style={{ fontWeight: '800', fontSize: 19 }} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 12 }}>
                  {profile?.email}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <ShieldCheck size={14} color={theme.colors.success} />
                  <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '700', fontSize: 11 }}>
                    Cloud Synced & Verified
                  </Text>
                </View>
              </View>
            </View>

            {/* Top Right Currency Dropdown Trigger */}
            <Pressable
              onPress={() => setCurrencyModalOpen(true)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: theme.radius.full,
                backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)',
                borderWidth: 1.5,
                borderColor: theme.colors.primary,
                opacity: pressed ? 0.8 : 1,
                marginLeft: 8,
              })}
            >
              <Globe size={13} color={theme.colors.primary} />
              <Text style={{ fontWeight: '800', color: theme.colors.primary, fontSize: 12 }}>
                {preferredCurrency}
              </Text>
              <ChevronDown size={14} color={theme.colors.primary} />
            </Pressable>
          </View>
        </Card>

        {/* ── 3. FINANCIAL LIMITS & BUDGETING CARD ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Target size={18} color={theme.colors.primary} />
              <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
                {t('settings_financial_targets') || 'Monthly Spending Ceiling'}
              </Text>
            </View>

            {profile?.monthly_budget ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                }}
              >
                <Text variant="caption" style={{ fontWeight: '800', color: theme.colors.success, fontSize: 11 }}>
                  Active Cap
                </Text>
              </View>
            ) : null}
          </View>

          {/* Master Monthly Ceiling Hero Input */}
          <View style={{ gap: 10 }}>
            {/* Input Row with Currency Prefix, Inline Clear Icon & Right-Side Save Button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.surfaceElevated,
                  borderRadius: theme.radius.md,
                  borderWidth: 1.5,
                  borderColor: theme.colors.primary,
                  paddingHorizontal: 14,
                  height: 48,
                }}
              >
                <Text style={{ fontWeight: '900', color: theme.colors.primary, marginRight: 8, fontSize: 16 }}>
                  {preferredCurrency}
                </Text>
                <TextInput
                  placeholder="e.g. 50000"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="numeric"
                  value={budgetInput}
                  onChangeText={handleBudgetInputChange}
                  style={{
                    flex: 1,
                    color: theme.colors.text,
                    fontSize: 17,
                    fontWeight: '800',
                    paddingVertical: 0,
                  }}
                />
                {budgetInput ? (
                  <Pressable
                    onPress={() => setBudgetInput('')}
                    hitSlop={8}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <X size={13} color={theme.colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {/* Right-Side Save Button */}
              <Button
                title={t('settings_save_budget') || 'Save'}
                loading={savingBudget}
                onPress={saveOverallBudget}
                style={{ height: 48, paddingHorizontal: 18, borderRadius: theme.radius.md }}
              />
            </View>

            {/* Quick Increment Preset Chips */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {[5000, 10000, 25000, 50000].map((inc) => (
                <PressableScale
                  key={inc}
                  activeScale={0.92}
                  onPress={() => {
                    const current = budgetInput ? Number(budgetInput) : 0;
                    setBudgetInput(String(current + inc));
                  }}
                  style={{
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>
                    +{formatMoney(inc, preferredCurrency)}
                  </Text>
                </PressableScale>
              ))}
            </View>

            {/* Live Safe Daily Burn Rate Calculation */}
            {budgetInput && Number(budgetInput) > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  padding: 8,
                  borderRadius: theme.radius.sm,
                  backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.08)',
                  borderWidth: 1,
                  borderColor: theme.isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(56, 189, 248, 0.15)',
                }}
              >
                <Sparkles size={14} color="#38BDF8" />
                <Text variant="caption" style={{ fontSize: 11, color: theme.colors.text }}>
                  Safe Daily Pace:{' '}
                  <Text style={{ fontWeight: '800', color: '#38BDF8' }}>
                    {formatMoney(Math.round(Number(budgetInput) / 30), preferredCurrency)} / day
                  </Text>
                </Text>
              </View>
            ) : null}

            {budgetSuccessMsg ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Check size={14} color={theme.colors.success} />
                <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '700' }}>
                  {budgetSuccessMsg}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Category Budget Studio Gateway Card */}
          <Pressable
            onPress={() => setShowCategoryBudgets(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14,
              paddingHorizontal: 14,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
              marginTop: 4,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ gap: 3, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
                  {t('settings_category_budgets') || 'Category Budget Studio'}
                </Text>
                {configuredCategoryCount > 0 ? (
                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 1.5,
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.colors.primary,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>
                      {configuredCategoryCount} caps active
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                {configuredCategoryCount > 0
                  ? `Allocated: ${formatMoney(categories.reduce((s, c) => s + (c.budget_monthly ? Number(c.budget_monthly) : 0), 0), preferredCurrency)} across ${configuredCategoryCount} categories`
                  : 'Establish individual spending caps for Food, Fuel, Shopping...'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>
                Open Studio
              </Text>
              <ChevronRight size={16} color={theme.colors.primary} />
            </View>
          </Pressable>
        </Card>

        {/* ── 4. LANGUAGE SELECTOR CARD ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Languages size={18} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
              {t('settings_language') || 'Language'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { code: 'en', flag: '🇺🇸', name: 'English', sub: 'EN' },
              { code: 'hi', flag: '🇮🇳', name: 'हिंदी', sub: 'HI' },
              { code: 'ne', flag: '🇳🇵', name: 'नेपाली', sub: 'NE' },
            ].map((l) => {
              const isActive = language === l.code;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => setLanguage(l.code as any)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 6,
                    borderRadius: theme.radius.md,
                    borderWidth: 1.5,
                    borderColor: isActive ? theme.colors.primary : theme.colors.border,
                    backgroundColor: isActive
                      ? (theme.isDark ? 'rgba(129, 140, 248, 0.16)' : 'rgba(79, 70, 229, 0.08)')
                      : theme.colors.surfaceElevated,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                  <Text style={{ fontWeight: isActive ? '800' : '600', fontSize: 13, color: isActive ? theme.colors.primary : theme.colors.text }}>
                    {l.name}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 10 }}>
                    ({l.sub})
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* ── 5. DATA & STATEMENTS HUB ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Database size={18} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
              Data & Financial Statements
            </Text>
          </View>

          <Link href="/export" asChild>
            <Pressable
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Download size={18} color={theme.colors.primary} />
                </View>
                <View style={{ gap: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: theme.colors.text }}>
                    Export Center (PDF / Excel / CSV)
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Generate luxury branded statements & data backups
                  </Text>
                </View>
              </View>

              <ChevronRight size={16} color={theme.colors.textMuted} />
            </Pressable>
          </Link>

          <Button
            title={t('settings_load_demo') || 'Load Demo Data'}
            variant="secondary"
            icon={FlaskConical}
            loading={seeding}
            onPress={loadDemoData}
          />
        </Card>

        {/* ── 7. APP SECURITY & BIOMETRIC LOCK ── */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Fingerprint size={18} color={theme.colors.primary} />
              <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
                {t('settings_biometric_lock') || 'Biometric Security'}
              </Text>
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

          <Text variant="caption" muted style={{ lineHeight: 17, fontSize: 12 }}>
            Require {biometricTypeName} authentication upon launching SpendFlow to protect your financial telemetry.
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: theme.colors.surfaceElevated,
              padding: 10,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <ShieldCheck size={16} color={isBiometricEnabled ? theme.colors.success : theme.colors.textMuted} />
            <Text
              variant="caption"
              style={{
                color: isBiometricEnabled ? theme.colors.success : theme.colors.textMuted,
                fontWeight: '700',
              }}
            >
              {isBiometricEnabled
                ? `${t('settings_biometric_enabled')} (${biometricTypeName} Active)`
                : t('settings_biometric_disabled')}
            </Text>
          </View>
        </Card>

        {/* ── 8. ACCOUNT SESSION (SIGN OUT) ── */}
        <Card style={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LogOut size={18} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
              Account Session
            </Text>
          </View>

          <Text variant="caption" muted style={{ marginBottom: 6 }}>
            Signed in as {profile?.email}
          </Text>

          <Button title={t('settings_sign_out') || 'Sign Out'} variant="secondary" icon={LogOut} onPress={signOut} />
        </Card>

        {/* ── 9. DANGER ZONE (DELETE ACCOUNT) ── */}
        <Card
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.04)',
            borderColor: 'rgba(239, 68, 68, 0.25)',
            borderWidth: 1,
          }}
        >
          <Text
            variant="caption"
            style={{ color: theme.colors.danger, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}
          >
            ⚠️ Danger Zone
          </Text>
          <Text variant="caption" muted style={{ fontSize: 11, lineHeight: 16 }}>
            Permanently delete your account and all financial telemetry. This action cannot be reversed.
          </Text>

          <Pressable
            onPress={() =>
              Alert.alert(t('settings_delete_account'), t('settings_delete_confirm'), [
                { text: t('common_cancel'), style: 'cancel' },
                { text: t('common_delete'), style: 'destructive', onPress: () => deleteAccount() },
              ])
            }
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.35)',
              backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
              marginTop: 4,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Trash2 size={14} color={theme.colors.danger} />
            <Text variant="caption" style={{ color: theme.colors.danger, fontWeight: '700' }}>
              {t('settings_delete_account') || 'Delete Account Permanently'}
            </Text>
          </Pressable>
        </Card>

        {/* ── 10. APP VERSION & BRAND FOOTER ── */}
        <View style={{ alignItems: 'center', gap: 3, marginTop: theme.spacing.xs }}>
          <Text variant="caption" muted style={{ fontWeight: '700', fontSize: 12 }}>
            SpendFlow v2.0.0
          </Text>
          <Text variant="caption" muted style={{ fontSize: 10 }}>
            See Where Your Money Flows • Version 2.0 Build
          </Text>
        </View>
      </ScrollView>

      {/* ── CATEGORY BUDGET CONFIGURATION FORM MODAL ── */}
      <CategoryBudgetFormModal
        visible={showCategoryBudgets}
        onClose={() => setShowCategoryBudgets(false)}
        onSaved={() => {
          if (profile?.id) listCategories(profile.id).then(setCategories);
        }}
      />

      {/* ── CURRENCY SELECTION MODAL ── */}
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
              borderRadius: theme.radius.lg,
              padding: 20,
              gap: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Globe size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 16 }}>
                    Select Base Currency
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    Global currency for accounts and analytics
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
                        ? (theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.08)')
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
    </KeyboardAvoidingView>
  );
}
