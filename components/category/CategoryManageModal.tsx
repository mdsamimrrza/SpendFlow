import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, Plus, Trash2, X } from 'lucide-react-native';
import { AlertModal } from '@/components/ui/AlertModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CategoryIcon, SELECTABLE_ICONS } from '@/components/ui/CategoryIcon';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { createCategory, deleteCategory, updateCategory } from '@/services/categories';
import { Category, TransactionType } from '@/types';

interface CategoryManageModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (category?: Category) => void;
  categoryToEdit?: Category | null;
  defaultType?: TransactionType;
}

export function CategoryManageModal({
  visible,
  onClose,
  onSuccess,
  categoryToEdit,
  defaultType = 'expense',
}: CategoryManageModalProps) {
  const theme = useTheme();
  const { session, profile } = useAuth();
  const userId = profile?.id ?? session?.user?.id;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('tag');
  const [color, setColor] = useState('#10B981');
  const [type, setType] = useState<TransactionType>(defaultType);
  const [budgetMonthly, setBudgetMonthly] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (categoryToEdit) {
      setName(categoryToEdit.name);
      setIcon(categoryToEdit.icon || 'tag');
      setColor(categoryToEdit.color || '#10B981');
      setType(categoryToEdit.type || 'expense');
      setBudgetMonthly(categoryToEdit.budget_monthly ? String(categoryToEdit.budget_monthly) : '');
    } else {
      setName('');
      setIcon(defaultType === 'income' ? 'briefcase' : 'tag');
      setColor('#10B981');
      setType(defaultType);
      setBudgetMonthly('');
    }
  }, [categoryToEdit, defaultType, visible]);

  async function handleSave() {
    if (!name.trim()) {
      setAlert({ title: 'Validation Error', message: 'Please enter a category name.' });
      return;
    }
    if (!userId) {
      setAlert({ title: 'Error', message: 'You must be logged in to manage categories.' });
      return;
    }

    setLoading(true);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const budget = budgetMonthly ? parseFloat(budgetMonthly) : null;

      if (categoryToEdit) {
        const updated = await updateCategory(
          categoryToEdit.id,
          {
            name,
            icon,
            color,
            type,
            budget_monthly: budget,
          },
          userId,
        );
        onSuccess(updated);
      } else {
        const created = await createCategory(userId, {
          name,
          icon,
          color,
          type,
          budget_monthly: budget,
        });
        onSuccess(created);
      }
      onClose();
    } catch (err) {
      setAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Could not save category.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!categoryToEdit || !userId) return;

    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!categoryToEdit || !userId) return;
    setLoading(true);
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await deleteCategory(categoryToEdit.id, userId);
      setDeleteConfirmOpen(false);
      onSuccess();
      onClose();
    } catch (err) {
      setAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Could not delete category.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
        <Card
          style={{
            width: '100%',
            maxHeight: '92%',
            borderRadius: 24,
            padding: 20,
            gap: 16,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 1.5,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="h2" style={{ fontWeight: '800', color: theme.colors.text }}>
              {categoryToEdit ? 'Edit Category' : 'New Category'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14 }}>
            {/* Category Type Toggle */}
            <View style={{ flexDirection: 'row', gap: 8, backgroundColor: theme.colors.surfaceElevated, padding: 4, borderRadius: theme.radius.md }}>
              <Pressable
                onPress={() => setType('expense')}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  alignItems: 'center',
                  borderRadius: theme.radius.sm,
                  backgroundColor: type === 'expense' ? (theme.isDark ? '#EF4444' : '#A5442B') : 'transparent',
                }}
              >
                <Text style={{ fontWeight: '800', fontSize: 13, color: type === 'expense' ? '#FFFFFF' : theme.colors.textMuted }}>
                  🔴 Expense Category
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setType('income')}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  alignItems: 'center',
                  borderRadius: theme.radius.sm,
                  backgroundColor: type === 'income' ? theme.colors.primary : 'transparent',
                }}
              >
                <Text style={{ fontWeight: '800', fontSize: 13, color: type === 'income' ? '#FFFFFF' : theme.colors.textMuted }}>
                  🟢 Income Category
                </Text>
              </Pressable>
            </View>

            {/* Category Name & Preview */}
            <View style={{ gap: 6 }}>
              <Text variant="caption" muted style={{ fontWeight: '700' }}>CATEGORY NAME</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: theme.colors.surfaceElevated,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <CategoryIcon name={icon} size={24} color={theme.colors.primary} />
                </View>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Subscriptions, Bonus..."
                  placeholderTextColor={theme.colors.faint}
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      backgroundColor: theme.colors.input,
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                    },
                  ]}
                />
              </View>
            </View>

            {/* Vector Icon Picker */}
            <View style={{ gap: 6 }}>
              <Text variant="caption" muted style={{ fontWeight: '700' }}>SELECT ICON</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {SELECTABLE_ICONS.map((item) => {
                  const isSelected = icon === item.name;
                  return (
                    <Pressable
                      key={item.name}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setIcon(item.name);
                      }}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.surfaceElevated,
                        borderWidth: 1.5,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <CategoryIcon
                        name={item.name}
                        size={20}
                        color={isSelected ? '#FFFFFF' : theme.colors.text}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Monthly Budget (Only for Expense categories) */}
            {type === 'expense' && (
              <View style={{ gap: 6 }}>
                <Text variant="caption" muted style={{ fontWeight: '700' }}>MONTHLY TARGET BUDGET (OPTIONAL)</Text>
                <TextInput
                  value={budgetMonthly}
                  onChangeText={setBudgetMonthly}
                  placeholder="e.g. 5000"
                  keyboardType="numeric"
                  placeholderTextColor={theme.colors.faint}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.input,
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                    },
                  ]}
                />
              </View>
            )}
          </ScrollView>

          {/* Action Buttons — pinned below the form, always visible without scrolling */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
              {categoryToEdit && (
                <Pressable
                  onPress={handleDelete}
                  disabled={loading}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.isDark ? 'rgba(239,68,68,0.18)' : '#F1DCD3',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.danger,
                  }}
                >
                  <Trash2 size={20} color={theme.colors.danger} />
                </Pressable>
              )}
              <Button
                title={categoryToEdit ? 'Save Changes' : 'Create Category'}
                loading={loading}
                onPress={handleSave}
                style={{ flex: 1, height: 48, borderRadius: theme.radius.md }}
              />
          </View>
        </Card>
        </KeyboardAvoidingView>
      </View>
      <ConfirmDialog
        visible={deleteConfirmOpen}
        title="Delete Category?"
        message={`Are you sure you want to delete "${categoryToEdit?.name || ''}"?`}
        loading={loading}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </Modal>

    <AlertModal
      visible={!!alert}
      title={alert?.title ?? ''}
      message={alert?.message ?? ''}
      variant="error"
      onClose={() => setAlert(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
  },
});
