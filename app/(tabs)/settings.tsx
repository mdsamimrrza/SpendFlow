import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, NativeSyntheticEvent, Platform, Pressable, ScrollView, Switch, TextInputEndEditingEventData, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Check, ChevronRight, Database, Download, Fingerprint, FlaskConical, Globe, Languages, Lock, LogOut, ShieldCheck, Target, Trash2 } from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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
import { resetBudgetAlertHistory, sendTestBudgetAlert } from '@/services/notifications';
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
  const [showCategoryBudgets, setShowCategoryBudgets] = useState(false);

  // Controlled budget input with strict numeric filtering
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSuccessMsg, setBudgetSuccessMsg] = useState('');

  useEffect(() => {
    if (profile?.id) listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
  }, [profile?.id]);

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

  async function handleTestNotification() {
    const success = await sendTestBudgetAlert(profile?.preferred_currency || 'NPR');
    if (success) {
      Alert.alert('🔔 Notification Dispatched', 'A live test budget alert was sent! Check your top status bar / notification shade.');
    } else {
      Alert.alert('Permission Denied', 'Please enable notification permissions for SpendFlow in your Android device settings.');
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
      >
        {/* 1. APP BAR HEADER */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h1">{t('settings_title')}</Text>
          <ThemeToggle />
        </View>

        {/* 2. USER PROFILE BANNER */}
        <Card style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View style={{ position: 'relative' }}>
              <Avatar uri={profile?.avatar_url} name={displayName} size={58} />
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.success, borderWidth: 2, borderColor: theme.colors.surface }} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h2">{displayName}</Text>
              <Text variant="caption" muted numberOfLines={1}>
                {profile?.email}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <ShieldCheck size={14} color={theme.colors.success} />
                <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '700' }}>
                  {t('settings_cloud_synced')}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* 3. FINANCIAL & BUDGET TARGETS CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <Target size={18} color={theme.colors.primary} />
            </View>
            <Text variant="h3">{t('settings_financial_targets')}</Text>
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" muted style={{ fontWeight: '600' }}>
              {t('settings_monthly_budget')} ({profile?.preferred_currency ?? 'NPR'})
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="e.g. 50000"
                  keyboardType="numeric"
                  value={budgetInput}
                  onChangeText={handleBudgetInputChange}
                />
              </View>

              <Button
                title={t('settings_save_budget')}
                loading={savingBudget}
                onPress={saveOverallBudget}
                style={{ height: 48, paddingHorizontal: 16 }}
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Pressable
                onPress={handleTestNotification}
                hitSlop={8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: theme.radius.sm,
                  backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)',
                }}
              >
                <Text style={{ fontSize: 13 }}>🔔</Text>
                <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                  Send Test Budget Alert
                </Text>
              </Pressable>

              {budgetSuccessMsg ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Check size={14} color={theme.colors.success} />
                  <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '600' }}>
                    {budgetSuccessMsg}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Category Limits Accordion Toggle */}
          <Pressable
            onPress={() => setShowCategoryBudgets(!showCategoryBudgets)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: theme.spacing.sm,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              marginTop: theme.spacing.xs,
            }}
          >
            <View style={{ gap: 2 }}>
              <Text variant="label" style={{ fontWeight: '600' }}>
                {t('settings_category_budgets')}
              </Text>
              <Text variant="caption" muted>
                {configuredCategoryCount > 0 ? `${configuredCategoryCount} ${t('settings_category_budgets')}` : t('settings_set_limit')}
              </Text>
            </View>
            <ChevronRight
              size={18}
              color={theme.colors.textMuted}
              style={{ transform: [{ rotate: showCategoryBudgets ? '90deg' : '0deg' }] }}
            />
          </Pressable>

          {showCategoryBudgets ? (
            <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.xs }}>
              {categories.map((category) => (
                <Input
                  key={category.id}
                  label={`${category.icon} ${category.name}`}
                  placeholder={t('settings_no_limit')}
                  keyboardType="numeric"
                  defaultValue={category.budget_monthly ? String(category.budget_monthly) : ''}
                  onEndEditing={(event: NativeSyntheticEvent<TextInputEndEditingEventData>) => {
                    const value = event.nativeEvent.text.trim().replace(/[^0-9.]/g, '');
                    updateCategoryBudget(category.id, value ? Number(value) : null)
                      .then((updated) => setCategories((current) => current.map((item) => (item.id === updated.id ? updated : item))))
                      .catch(() => undefined);
                  }}
                />
              ))}
            </View>
          ) : null}
        </Card>

        {/* 4. LANGUAGE & REGION CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <Languages size={18} color={theme.colors.primary} />
            </View>
            <Text variant="h3">{t('settings_language')} / Language</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <Pressable
              onPress={() => setLanguage('en')}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: 4,
                borderRadius: theme.radius.md,
                borderWidth: 1.5,
                borderColor: language === 'en' ? theme.colors.primary : theme.colors.border,
                backgroundColor: language === 'en' ? (theme.isDark ? 'rgba(129, 140, 248, 0.15)' : 'rgba(79, 70, 229, 0.08)') : theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <Text style={{ fontSize: 20 }}>🇺🇸</Text>
              <Text variant="caption" style={{ fontWeight: '700', color: language === 'en' ? theme.colors.primary : theme.colors.text }}>
                English
              </Text>
              <Text variant="caption" muted style={{ fontSize: 10 }}>
                (EN)
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setLanguage('hi')}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: 4,
                borderRadius: theme.radius.md,
                borderWidth: 1.5,
                borderColor: language === 'hi' ? theme.colors.primary : theme.colors.border,
                backgroundColor: language === 'hi' ? (theme.isDark ? 'rgba(129, 140, 248, 0.15)' : 'rgba(79, 70, 229, 0.08)') : theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <Text style={{ fontSize: 20 }}>🇮🇳</Text>
              <Text variant="caption" style={{ fontWeight: '700', color: language === 'hi' ? theme.colors.primary : theme.colors.text }}>
                हिंदी
              </Text>
              <Text variant="caption" muted style={{ fontSize: 10 }}>
                (HI)
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setLanguage('ne')}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: 4,
                borderRadius: theme.radius.md,
                borderWidth: 1.5,
                borderColor: language === 'ne' ? theme.colors.primary : theme.colors.border,
                backgroundColor: language === 'ne' ? (theme.isDark ? 'rgba(129, 140, 248, 0.15)' : 'rgba(79, 70, 229, 0.08)') : theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <Text style={{ fontSize: 20 }}>🇳🇵</Text>
              <Text variant="caption" style={{ fontWeight: '700', color: language === 'ne' ? theme.colors.primary : theme.colors.text }}>
                नेपाली
              </Text>
              <Text variant="caption" muted style={{ fontSize: 10 }}>
                (NE)
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* 5. APP PREFERENCES CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={18} color={theme.colors.primary} />
            </View>
            <Text variant="h3">{t('settings_app_preferences')}</Text>
          </View>

          <Select
            label={t('settings_currency')}
            value={profile?.preferred_currency ?? 'NPR'}
            options={CURRENCIES.map((currency) => ({ label: currency, value: currency }))}
            onChange={(preferred_currency) => updateProfile({ preferred_currency }).then(refreshProfile)}
          />
        </Card>

        {/* 6. DATA MANAGEMENT CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <Database size={18} color={theme.colors.primary} />
            </View>
            <Text variant="h3">{t('settings_data_management')}</Text>
          </View>

          <Link href="/export" asChild>
            <Button title={t('settings_export_csv')} variant="secondary" icon={Download} />
          </Link>
          <Button title={t('settings_load_demo')} variant="secondary" icon={FlaskConical} loading={seeding} onPress={loadDemoData} />
        </Card>

        {/* 7. APP SECURITY & BIOMETRIC LOCK CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                <Fingerprint size={18} color={theme.colors.primary} />
              </View>
              <Text variant="h3">{t('settings_biometric_lock')}</Text>
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

          <Text variant="caption" muted style={{ lineHeight: 18 }}>
            {t('settings_biometric_desc')} ({biometricTypeName})
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.sm, borderRadius: theme.radius.sm }}>
            <ShieldCheck size={16} color={isBiometricEnabled ? theme.colors.success : theme.colors.textMuted} />
            <Text variant="caption" style={{ color: isBiometricEnabled ? theme.colors.success : theme.colors.textMuted, fontWeight: '700' }}>
              {isBiometricEnabled ? `${t('settings_biometric_enabled')} (${biometricTypeName})` : t('settings_biometric_disabled')}
            </Text>
          </View>
        </Card>

        {/* 8. ACCOUNT SESSION (SIGN OUT) */}
        <Card style={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <LogOut size={18} color={theme.colors.primary} />
            </View>
            <Text variant="h3">{t('settings_profile')}</Text>
          </View>

          <Text variant="caption" muted style={{ marginBottom: 4 }}>
            {profile?.email}
          </Text>

          <Button title={t('settings_sign_out')} variant="secondary" icon={LogOut} onPress={signOut} />
        </Card>

        {/* 9. SEPARATE DANGER ZONE (DELETE ACCOUNT) */}
        <Card style={{ gap: theme.spacing.sm, padding: theme.spacing.md, backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.04)', borderColor: 'rgba(239, 68, 68, 0.25)', borderWidth: 1, marginTop: theme.spacing.sm }}>
          <Text variant="caption" style={{ color: theme.colors.danger, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            ⚠️ Danger Zone
          </Text>
          <Text variant="caption" muted style={{ fontSize: 11, lineHeight: 16 }}>
            Permanently delete your account and all associated transactions. This action cannot be undone.
          </Text>

          <Pressable
            onPress={() =>
              Alert.alert(t('settings_delete_account'), t('settings_delete_confirm'), [
                { text: t('common_cancel'), style: 'cancel' },
                { text: t('common_delete'), style: 'destructive', onPress: () => deleteAccount() },
              ])
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.35)',
              backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
              marginTop: 4,
            }}
          >
            <Trash2 size={14} color={theme.colors.danger} />
            <Text variant="caption" style={{ color: theme.colors.danger, fontWeight: '700' }}>
              {t('settings_delete_account')}
            </Text>
          </Pressable>
        </Card>

        {/* App Version Footer */}
        <View style={{ alignItems: 'center', gap: 4, marginTop: theme.spacing.xs }}>
          <Text variant="caption" muted style={{ fontWeight: '600' }}>SpendFlow v1.0.0</Text>
          <Text variant="caption" muted style={{ fontSize: 11 }}>See Where Your Money Flows</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
