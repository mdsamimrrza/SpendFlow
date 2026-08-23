import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useOnboarding } from '@/store/OnboardingContext';

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const { completeOnboarding } = useOnboarding();

  async function finish() {
    await completeOnboarding();
    router.replace(session ? '/(tabs)' : '/(auth)');
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.xl, backgroundColor: theme.colors.background }}>
      <CheckCircle2 size={56} color={theme.colors.primary} />
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="h1">Welcome to SpendFlow</Text>
        <Text muted>Track expenses, understand your habits, and stay on top of your monthly budgets.</Text>
      </View>
      <Button title="Get Started" onPress={finish} />
    </View>
  );
}
