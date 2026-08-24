import { Link, useRouter } from 'expo-router';
import { Download, FlaskConical, LogOut, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, NativeSyntheticEvent, ScrollView, TextInputEndEditingEventData, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { CURRENCIES } from '@/constants/app';
import { listCategories, updateCategoryBudget } from '@/services/categories';
import { Category } from '@/types';
import { deleteAccount, signOut, updateProfile } from '@/services/auth';
import { seedDemoExpenses } from '@/services/expenses';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function SettingsScreen() {
  const { profile, refreshProfile } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (profile?.id) listCategories(profile.id).then(setCategories).catch(() => setCategories([]));
  }, [profile?.id]);

  async function loadDemoData() {
    if (!profile?.id) return;
    setSeeding(true);
    try {
      const count = await seedDemoExpenses(profile.id);
      Alert.alert(count ? 'Demo data loaded' : 'Demo data already loaded', count ? `${count} expenses were added.` : 'The demo expenses are already in your account.');
      if (count) router.replace('/');
    } catch (error) {
      Alert.alert('Could not load demo data', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 100 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h1">Settings</Text>
        <ThemeToggle />
      </View>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Avatar uri={profile?.avatar_url} name={profile?.display_name ?? profile?.email} />
        <View style={{ flex: 1 }}>
          <Text variant="h3">{profile?.display_name || 'SpendFlow User'}</Text>
          <Text muted>{profile?.email}</Text>
        </View>
      </Card>
      <Select
        label="Currency"
        value={profile?.preferred_currency ?? 'NPR'}
        options={CURRENCIES.map((currency) => ({ label: currency, value: currency }))}
        onChange={(preferred_currency) => updateProfile({ preferred_currency }).then(refreshProfile)}
      />
      <Text variant="h2">Monthly budgets</Text>
      <Input
        label="🎯 Overall Target Monthly Budget"
        placeholder="No overall limit set"
        keyboardType="decimal-pad"
        defaultValue={profile?.monthly_budget ? String(profile.monthly_budget) : ''}
        onEndEditing={(event: NativeSyntheticEvent<TextInputEndEditingEventData>) => {
          const value = event.nativeEvent.text.trim();
          updateProfile({ monthly_budget: value ? Number(value) : null }).then(refreshProfile).catch(() => undefined);
        }}
      />
      <Text variant="caption" muted style={{ marginTop: -theme.spacing.sm }}>Category budgets:</Text>

      {categories.map((category) => (
        <Input
          key={category.id}
          label={`${category.icon} ${category.name}`}
          placeholder="No budget"
          keyboardType="decimal-pad"
          defaultValue={category.budget_monthly ? String(category.budget_monthly) : ''}
          onEndEditing={(event: NativeSyntheticEvent<TextInputEndEditingEventData>) => {
            const value = event.nativeEvent.text.trim();
            updateCategoryBudget(category.id, value ? Number(value) : null).then((updated) => setCategories((current) => current.map((item) => item.id === updated.id ? updated : item))).catch(() => undefined);
          }}
        />
      ))}
      <Link href="/export" asChild>
        <Button title="Export Data" variant="secondary" icon={Download} />
      </Link>
      <Button title="Load Demo Data" variant="secondary" icon={FlaskConical} loading={seeding} onPress={loadDemoData} />
      <Button title="Sign Out" variant="secondary" icon={LogOut} onPress={signOut} />
      <Button
        title="Delete Account"
        variant="destructive"
        icon={Trash2}
        onPress={() =>
          Alert.alert('Delete account?', 'This removes your SpendFlow data from this Supabase project.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteAccount() },
          ])
        }
      />
    </ScrollView>
  );
}
