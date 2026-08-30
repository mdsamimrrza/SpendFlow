import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Edit3,
  Layers,
  Plus,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
} from 'lucide-react-native';
import { CategoryBudgetFormModal } from '@/components/expense/CategoryBudgetFormModal';
import { CategoryManageModal } from '@/components/category/CategoryManageModal';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { listCategories } from '@/services/categories';
import { Category, TransactionType } from '@/types';
import { formatMoney } from '@/utils/format';

export default function CategoriesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session, profile } = useAuth();
  const userId = profile?.id ?? session?.user?.id;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);

  const currency = profile?.preferred_currency ?? 'NPR';

  async function loadData() {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const data = await listCategories(userId);
      setCategories(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [userId]);

  function handleOpenCreate() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCategory(null);
    setModalVisible(true);
  }

  function handleOpenEdit(category: Category) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCategory(category);
    setModalVisible(true);
  }

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type !== 'income'),
    [categories]
  );

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories]
  );

  const activeList = activeTab === 'expense' ? expenseCategories : incomeCategories;

  // Total allocated target budget
  const totalAllocatedBudget = useMemo(() => {
    return expenseCategories.reduce((acc, cat) => acc + (Number(cat.budget_monthly) || 0), 0);
  }, [expenseCategories]);

  const budgetedExpenseCount = useMemo(() => {
    return expenseCategories.filter((c) => (Number(c.budget_monthly) || 0) > 0).length;
  }, [expenseCategories]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings' as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* ── 1. TOP APP BAR ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <View
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
          </View>
          <Text variant="h3" style={{ fontWeight: '800', fontSize: 17.5, color: theme.colors.text }}>
            Categories & Budgets
          </Text>
        </Pressable>

        {/* Add Category button */}
        <Pressable
          onPress={handleOpenCreate}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#FFFFFF' }}>
            New
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={activeList}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadData();
            }}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={{ padding: 10, gap: 8, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 2 }}>
            {/* ── 2. SUMMARY HERO CARD ── */}
            <View
              style={{
                padding: 10,
                borderRadius: 16,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                gap: 6,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: theme.isDark ? 0.2 : 0.05,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 0 }}>
                  <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10.5 }}>
                    Monthly Target Allocations
                  </Text>
                  <Text variant="h1" style={{ fontSize: 21, lineHeight: 25, fontWeight: '900', color: theme.colors.text, includeFontPadding: false, marginVertical: 0 }}>
                    {formatMoney(totalAllocatedBudget, currency)}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 12 }}>
                    Across {budgetedExpenseCount} budgeted categories
                  </Text>
                </View>

                {/* Quick Multi-Budget Setup Button */}
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBudgetModalOpen(true);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
                    borderWidth: 1,
                    borderColor: theme.isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Target size={15} color="#F59E0B" />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#F59E0B' }}>
                    Set Budgets
                  </Text>
                </Pressable>
              </View>

              {/* Stats Bar */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.surfaceElevated,
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <View style={{ flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: theme.colors.border }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }}>
                    {expenseCategories.length}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                    Expenses
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: theme.colors.border }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.primary }}>
                    {incomeCategories.length}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                    Incomes
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#F59E0B' }}>
                    {budgetedExpenseCount}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                    Targets Set
                  </Text>
                </View>
              </View>
            </View>

            {/* ── 3. 50/50 SEGMENTED TAB SWITCHER ── */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: theme.colors.surfaceElevated,
                padding: 4,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                height: 50,
                width: '100%',
              }}
            >
              {/* Expense Tab */}
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setActiveTab('expense');
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  height: '100%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 10,
                  backgroundColor:
                    activeTab === 'expense'
                      ? (theme.isDark ? '#EF4444' : '#DC2626')
                      : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <ArrowDownRight
                  size={16}
                  color={activeTab === 'expense' ? '#FFFFFF' : theme.colors.textMuted}
                  strokeWidth={2.5}
                />
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: '800',
                    lineHeight: 18,
                    includeFontPadding: false,
                    color: activeTab === 'expense' ? '#FFFFFF' : theme.colors.textMuted,
                  }}
                >
                  Expense ({expenseCategories.length})
                </Text>
              </Pressable>

              {/* Income Tab */}
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setActiveTab('income');
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  height: '100%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 10,
                  backgroundColor:
                    activeTab === 'income' ? theme.colors.primary : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <ArrowUpRight
                  size={16}
                  color={activeTab === 'income' ? '#FFFFFF' : theme.colors.textMuted}
                  strokeWidth={2.5}
                />
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: '800',
                    lineHeight: 18,
                    includeFontPadding: false,
                    color: activeTab === 'income' ? '#FFFFFF' : theme.colors.textMuted,
                  }}
                >
                  Income ({incomeCategories.length})
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Tag}
            title={activeTab === 'expense' ? 'No Expense Categories' : 'No Income Categories'}
            message="Tap '+ New' above to create custom categories with custom icons and budget limits."
            actionLabel="+ Add Category"
            onAction={handleOpenCreate}
          />
        }
        renderItem={({ item }) => {
          const budget = Number(item.budget_monthly) || 0;
          return (
            <Pressable
              onPress={() => handleOpenEdit(item)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 78,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderWidth: 1.5,
                borderRadius: 16,
                padding: 12,
                justifyContent: 'space-between',
                opacity: pressed ? 0.85 : 1,
                gap: 8,
              })}
            >
              {/* Top Row: Icon + Name + Edit icon */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: theme.colors.surfaceElevated,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <CategoryIcon
                      name={item.icon}
                      size={16}
                      color={item.type === 'income' ? '#10B981' : theme.colors.primary}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontWeight: '800',
                      fontSize: 13.5,
                      color: theme.colors.text,
                      flex: 1,
                    }}
                  >
                    {item.name}
                  </Text>
                </View>

                <Edit3 size={13} color={theme.colors.textMuted} />
              </View>

              {/* Bottom Row: Budget / Status */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                {item.type === 'expense' ? (
                  budget > 0 ? (
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: '800',
                        color: theme.colors.primary,
                      }}
                    >
                      {formatMoney(budget, currency)}
                      <Text style={{ fontSize: 10, fontWeight: '600', color: theme.colors.textMuted }}> /mo</Text>
                    </Text>
                  ) : (
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      No limit
                    </Text>
                  )
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TrendingUp size={12} color="#10B981" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>
                      Inflow Stream
                    </Text>
                  </View>
                )}

                {item.is_custom && (
                  <View
                    style={{
                      paddingHorizontal: 5,
                      paddingVertical: 1.5,
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.colors.primaryLight,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.primary }}>
                      Custom
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Category Add/Edit Modal */}
      <CategoryManageModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={() => void loadData()}
        categoryToEdit={editingCategory}
        defaultType={activeTab}
      />

      {/* Category Budget Limits Modal */}
      <CategoryBudgetFormModal
        visible={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        onSaved={() => void loadData()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
