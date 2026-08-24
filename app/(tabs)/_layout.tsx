import { Tabs } from 'expo-router';
import { BarChart3, CalendarClock, Home, List, Settings } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.tab, borderTopColor: theme.colors.border, minHeight: 64 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab_home'), tabBarIcon: ({ color }) => <Home size={21} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: t('tab_history'), tabBarIcon: ({ color }) => <List size={21} color={color} /> }} />
      <Tabs.Screen name="analytics" options={{ title: t('tab_analytics'), tabBarIcon: ({ color }) => <BarChart3 size={21} color={color} /> }} />
      <Tabs.Screen name="recurring" options={{ title: t('tab_recurring'), tabBarIcon: ({ color }) => <CalendarClock size={21} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: t('tab_settings'), tabBarIcon: ({ color }) => <Settings size={21} color={color} /> }} />
    </Tabs>
  );
}
