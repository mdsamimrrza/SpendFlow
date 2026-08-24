import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, NativeSyntheticEvent, Platform, Pressable, ScrollView, TextInputEndEditingEventData, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Check, ChevronRight, Database, Download, FlaskConical, Globe, LogOut, ShieldCheck, Target, Trash2 } from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { CURRENCIES } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { deleteAccount, signOut, updateProfile } from '@/services/auth';
import { listCategories, updateCategoryBudget } from '@/services/categories';
import { seedDemoExpenses } from '@/services/expenses';
import { Category } from '@/types';
import { formatMoney } from '@/utils/format';

export default function SettingsScreen() {
  const { profile, refreshProfile } = useAuth();
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
    setBudgetInput(cleaned);
  }

  async function saveOverallBudget() {
    const numeric = budgetInput.trim() ? Number(budgetInput.trim()) : null;
    if (budgetInput.trim() && (isNaN(Number(budgetInput)) || Number(budgetInput) < 0)) {
      Alert.alert('Invalid Budget', 'Please enter a valid positive number for your monthly budget.');
      return;
    }

    setSavingBudget(true);
    setBudgetSuccessMsg('');
    try {
      await updateProfile({ monthly_budget: numeric });
      await refreshProfile();
      setBudgetSuccessMsg(numeric ? `Saved! Budget set to ${formatMoney(numeric, profile?.preferred_currency)}` : 'Budget cleared');
      setTimeout(() => setBudgetSuccessMsg(''), 3500);
    } catch (err) {
      Alert.alert('Save Failed', err instanceof Error ? err.message : 'Could not save monthly budget.');
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
      Alert.alert('Could not load demo data', error instanceof Error ? error.message : 'Please try again.');
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
          <Text variant="h1">Settings</Text>
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
                  Cloud Synced & Secured
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
            <Text variant="h3">Financial & Budget Targets</Text>
          </View>

          <Text variant="caption" muted style={{ marginTop: -4 }}>
            Set your overall monthly budget limit to track remaining balance and health indicators on your main Dashboard.
          </Text>

          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" muted style={{ fontWeight: '600' }}>
              Overall Monthly Budget ({profile?.preferred_currency ?? 'NPR'})
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
                title="Save Budget"
                loading={savingBudget}
                onPress={saveOverallBudget}
                style={{ height: 48, paddingHorizontal: 16 }}
              />
            </View>

            {budgetSuccessMsg ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Check size={14} color={theme.colors.success} />
                <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '600' }}>
                  {budgetSuccessMsg}
                </Text>
              </View>
            ) : null}
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
                Category Monthly Budgets
              </Text>
              <Text variant="caption" muted>
                {configuredCategoryCount > 0 ? `${configuredCategoryCount} category limits set` : 'Set individual limits per category'}
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
                  placeholder="No limit"
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



        {/* 5. APP PREFERENCES CARD */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={18} color={theme.colors.primary} />
            </View>
            <Text variant="h3">App Preferences</Text>
          </View>

          <Select
            label="Preferred Currency"
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
            <Text variant="h3">Data Management</Text>
          </View>

          <Link href="/export" asChild>
            <Button title="Export Expense Data (CSV)" variant="secondary" icon={Download} />
          </Link>
          <Button title="Load Demo Expenses" variant="secondary" icon={FlaskConical} loading={seeding} onPress={loadDemoData} />
        </Card>

        {/* 7. ACCOUNT & DANGER ZONE */}
        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg, borderColor: theme.colors.danger, borderWidth: 1 }}>
          <Text variant="h3" style={{ color: theme.colors.danger }}>Account & Security</Text>

          <View style={{ gap: theme.spacing.sm }}>
            <Button title="Sign Out" variant="secondary" icon={LogOut} onPress={signOut} />
            <Button
              title="Delete Account"
              variant="destructive"
              icon={Trash2}
              onPress={() =>
                Alert.alert('Delete Account?', 'This will permanently remove your SpendFlow account and all expense history.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteAccount() },
                ])
              }
            />
          </View>
        </Card>

        {/* App Version Footer */}
        <View style={{ alignItems: 'center', gap: 4, marginTop: theme.spacing.xs }}>
          <Text variant="caption" muted style={{ fontWeight: '600' }}>SpendFlow v1.0.0</Text>
          <Text variant="caption" muted style={{ fontSize: 11 }}>Cloud Synced Personal Expense Manager</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
