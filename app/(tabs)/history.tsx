import { SlidersHorizontal } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { ExpenseItem } from '@/components/expense/ExpenseItem';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { SORT_OPTIONS } from '@/constants/app';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';
import { SortKey } from '@/types';

export default function HistoryScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = useMemo(() => ({ search }), [search]);
  const expenses = useExpenses(profile?.id, filters, sort);
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={expenses.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={expenses.refreshing} onRefresh={expenses.refresh} />}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="h1">History</Text>
              <Pressable accessibilityRole="button" onPress={() => setFiltersOpen(true)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <SlidersHorizontal size={22} color={theme.colors.primary} />
              </Pressable>
            </View>
            <Input placeholder="Search description or notes" value={search} onChangeText={setSearch} />
          </View>
        }
        renderItem={({ item }) => <ExpenseItem expense={item} onDelete={(expense) => expenses.remove(expense.id)} />}
        ListEmptyComponent={<EmptyState icon={SlidersHorizontal} title="No matching expenses" message="Try a different search or filter." />}
        onEndReached={expenses.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          expenses.loadingMore ? (
            <View style={{ paddingVertical: theme.spacing.lg }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : expenses.items.length && !expenses.hasMore ? (
            <Text muted style={{ paddingVertical: theme.spacing.lg, textAlign: 'center' }}>
              You have reached the end.
            </Text>
          ) : null
        }
      />
      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <Text variant="h2">Filter & Sort</Text>
        <Select label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
        <Button title="Apply" onPress={() => setFiltersOpen(false)} />
      </BottomSheet>
    </View>
  );
}
