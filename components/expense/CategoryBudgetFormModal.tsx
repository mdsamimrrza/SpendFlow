import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import {
  Bell,
  Check,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import { AlertModal } from '@/components/ui/AlertModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { listCategories, updateCategoryBudget } from '@/services/categories';
import { Category } from '@/types';
import { formatMoney } from '@/utils/format';

interface CategoryBudgetFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function CategoryBudgetFormModal({
  visible,
  onClose,
  onSaved,
}: CategoryBudgetFormModalProps) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const currency = profile?.preferred_currency ?? 'NPR';
  const monthlyOverall = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;

  useEffect(() => {
    if (visible && profile?.id) {
      listCategories(profile.id)
        .then((cats) => {
          setCategories(cats);
          if (cats.length > 0 && !selectedCatId) {
            setSelectedCatId(cats[0].id);
            setAmountInput(cats[0].budget_monthly ? String(cats[0].budget_monthly) : '');
          }
        })
        .catch(() => setCategories([]));
    }
  }, [visible, profile?.id]);

  function handleSelectCategory(cat: Category) {
    setSelectedCatId(cat.id);
    setAmountInput(cat.budget_monthly ? String(cat.budget_monthly) : '');
    setSuccessMsg('');
  }

  function handleAddIncrement(inc: number) {
    const current = amountInput ? Number(amountInput) : 0;
    setAmountInput(String(current + inc));
  }

  async function handleSave() {
    if (!selectedCatId) return;
    setSaving(true);
    try {
      const raw = amountInput.trim().replace(/[^0-9.]/g, '');
      const numeric = raw && Number(raw) > 0 ? Number(raw) : null;
      const updated = await updateCategoryBudget(selectedCatId, numeric);

      setCategories((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setSuccessMsg(
        numeric
          ? `Budget set to ${formatMoney(numeric, currency)}!`
          : 'Limit cleared successfully!',
      );
      onSaved?.();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save category limit' });
    } finally {
      setSaving(false);
    }
  }

  async function handleClearSingle(catId: string) {
    try {
      const updated = await updateCategoryBudget(catId, null);
      setCategories((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      if (selectedCatId === catId) {
        setAmountInput('');
      }
      onSaved?.();
    } catch (err) {
      setAlert({ title: 'Error', message: 'Failed to clear category limit' });
    }
  }

  const selectedCategory = categories.find((c) => c.id === selectedCatId);

  // Calculate live allocation preview
  const previewAllocated = useMemo(() => {
    const entered = amountInput && Number(amountInput) > 0 ? Number(amountInput) : 0;
    return categories.reduce((sum, c) => {
      if (c.id === selectedCatId) return sum + entered;
      return sum + (c.budget_monthly ? Number(c.budget_monthly) : 0);
    }, 0);
  }, [categories, selectedCatId, amountInput]);

  const allocationPct = monthlyOverall > 0 ? Math.round((previewAllocated / monthlyOverall) * 100) : 0;
  const isOverAllocated = monthlyOverall > 0 && previewAllocated > monthlyOverall;

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            maxHeight: '92%',
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
          }}
        >
          {/* ── MODAL TOP DRAG / HEADER ── */}
          <View
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: theme.spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
            }}
          >
            {/* Grab handle pill */}
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                alignSelf: 'center',
                marginBottom: 10,
              }}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Target size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1} style={{ fontWeight: '800', fontSize: 17 }}>
                    {t('category_budget_studio_title') || 'Category Budget Studio'}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <X size={16} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 40 }}>
            {/* ── 1. LIVE ALLOCATION IMPACT GAUGE ── */}
            <Card
              style={{
                padding: 14,
                gap: 8,
                backgroundColor: theme.isDark ? '#111827' : theme.colors.cardHighlight,
                borderWidth: 1.5,
                borderColor: isOverAllocated ? theme.colors.danger : theme.colors.primary,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <Wallet size={15} color={isOverAllocated ? theme.colors.danger : theme.colors.primary} />
                  <Text variant="caption" numberOfLines={2} style={{ flex: 1, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10, color: isOverAllocated ? theme.colors.danger : theme.colors.primary }}>
                    {t('category_budget_allocation_intelligence') || 'Budget Allocation Intelligence'}
                  </Text>
                </View>

                <Text
                  variant="caption"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={{
                    fontWeight: '800',
                    fontSize: 11,
                    flexShrink: 1,
                    textAlign: 'right',
                    color: isOverAllocated ? theme.colors.danger : theme.colors.primary,
                  }}
                >
                  {allocationPct}% {isOverAllocated ? 'Over' : t('category_budget_allocated') || 'Allocated'}
                </Text>
              </View>

              {/* Progress Bar */}
              <View
                style={{
                  height: 7,
                  borderRadius: 3.5,
                  overflow: 'hidden',
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                }}
              >
                <View
                  style={{
                    width: `${Math.min(allocationPct, 100)}%`,
                    height: '100%',
                    backgroundColor: isOverAllocated ? theme.colors.danger : theme.colors.primary,
                    borderRadius: 3.5,
                  }}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text variant="caption" muted numberOfLines={2} style={{ fontSize: 11 }}>
                  Total Category Caps: <Text style={{ fontWeight: '800', color: theme.colors.text }}>{formatMoney(previewAllocated, currency)}</Text>
                </Text>

                {monthlyOverall > 0 ? (
                  <Text
                    variant="caption"
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: isOverAllocated ? theme.colors.danger : theme.colors.success,
                    }}
                  >
                    {isOverAllocated
                      ? `Exceeds ceiling by ${formatMoney(previewAllocated - monthlyOverall, currency)}`
                      : `${formatMoney(monthlyOverall - previewAllocated, currency)} buffer left`}
                  </Text>
                ) : (
                  <Text variant="caption" muted style={{ fontSize: 10 }}>
                    No overall ceiling set
                  </Text>
                )}
              </View>
            </Card>

            {/* ── 2. STEP 1: SELECT CATEGORY (EXPANDED CARDS) ── */}
            <View style={{ gap: 10 }}>
              <Text variant="label" style={{ fontWeight: '800', fontSize: 13 }}>
                1. {t('category_budget_choose_cat') || 'Choose Expense Category'}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingHorizontal: 2 }}
              >
                {categories.map((cat) => {
                  const isSelected = cat.id === selectedCatId;
                  const hasLimit = Number(cat.budget_monthly) > 0;

                  return (
                    <PressableScale
                      key={cat.id}
                      activeScale={0.94}
                      onPress={() => handleSelectCategory(cat)}
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 10,
                        borderRadius: theme.radius.md,
                        borderWidth: 1.5,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: isSelected
                          ? (theme.isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.1)')
                          : theme.colors.surfaceElevated,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                        minWidth: 102,
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: isSelected
                            ? (theme.isDark ? 'rgba(99, 102, 241, 0.35)' : 'rgba(79, 70, 229, 0.18)')
                            : (theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CategoryIcon
                          name={cat.icon}
                          size={16}
                          color={isSelected ? theme.colors.primary : theme.colors.text}
                        />
                      </View>

                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? '800' : '700',
                          color: isSelected ? theme.colors.primary : theme.colors.text,
                          textAlign: 'center',
                        }}
                        numberOfLines={1}
                      >
                        {cat.name}
                      </Text>

                      {hasLimit ? (
                        <View
                          style={{
                            paddingHorizontal: 7,
                            paddingVertical: 1.5,
                            borderRadius: theme.radius.full,
                            backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5',
                            borderWidth: 1,
                            borderColor: theme.isDark ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0',
                            marginTop: 1,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.isDark ? '#34D399' : '#065F46',
                              fontSize: 10.5,
                              fontWeight: '900',
                            }}
                          >
                            {formatMoney(Number(cat.budget_monthly), currency)}
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 1.5,
                            borderRadius: theme.radius.full,
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                            marginTop: 1,
                          }}
                        >
                          <Text variant="caption" muted style={{ fontSize: 9.5, fontWeight: '600' }}>
                            No limit
                          </Text>
                        </View>
                      )}
                    </PressableScale>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── 3. STEP 2: AMOUNT INPUT & PRESETS ── */}
            {selectedCategory ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="label" style={{ fontWeight: '800', fontSize: 13 }}>
                    2. Set Limit for
                  </Text>
                  <CategoryIcon name={selectedCategory.icon} size={15} color={theme.colors.primary} />
                  <Text variant="label" style={{ fontWeight: '800', fontSize: 13, color: theme.colors.primary }}>
                    {selectedCategory.name}
                  </Text>
                </View>

                {/* Hero Input Box & Right-Side Save Button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: theme.colors.background,
                      borderRadius: theme.radius.md,
                      borderWidth: 1.5,
                      borderColor: theme.colors.primary,
                      paddingHorizontal: 14,
                      height: 50,
                    }}
                  >
                    <Text style={{ fontWeight: '900', color: theme.colors.primary, marginRight: 8, fontSize: 16 }}>
                      {currency}
                    </Text>
                    <TextInput
                      placeholder="e.g. 15000"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="numeric"
                      value={amountInput}
                      onChangeText={(text) => setAmountInput(text.replace(/[^0-9.]/g, ''))}
                      style={{
                        flex: 1,
                        color: theme.colors.text,
                        fontSize: 18,
                        fontWeight: '900',
                        paddingVertical: 0,
                      }}
                    />
                    {amountInput ? (
                      <Pressable
                        onPress={() => setAmountInput('')}
                        hitSlop={8}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={14} color={theme.colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Right-Side Save Button */}
                  <Button
                    title="Save"
                    loading={saving}
                    onPress={handleSave}
                    style={{ height: 50, paddingHorizontal: 18, borderRadius: theme.radius.md }}
                  />
                </View>

                {/* Quick Add Increment Pills */}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {[1000, 5000, 10000, 25000].map((inc) => (
                    <PressableScale
                      key={inc}
                      activeScale={0.92}
                      onPress={() => handleAddIncrement(inc)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: theme.radius.full,
                        backgroundColor: theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text variant="caption" style={{ fontWeight: '800', color: theme.colors.text }}>
                        +{formatMoney(inc, currency)}
                      </Text>
                    </PressableScale>
                  ))}
                </View>

                {/* Presets Row */}

                {successMsg ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Check size={16} color={theme.colors.success} />
                    <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '800', fontSize: 12 }}>
                      {successMsg}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* ── 4. CONFIGURED ACTIVE CATEGORY LIMITS ── */}
            <View style={{ gap: 8, marginTop: 4 }}>
              <Text variant="label" style={{ fontWeight: '800', fontSize: 13 }}>
                {t('category_budget_active_caps') || 'Active Category Limits'} ({categories.filter((c) => Number(c.budget_monthly) > 0).length})
              </Text>

              {categories.filter((c) => Number(c.budget_monthly) > 0).length === 0 ? (
                <View
                  style={{
                    padding: 16,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surfaceElevated,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderStyle: 'dashed',
                  }}
                >
                  <Text variant="caption" muted style={{ fontStyle: 'italic', textAlign: 'center' }}>
                    No category caps active. Select a category above to establish your first cap.
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
                  {categories
                    .filter((c) => Number(c.budget_monthly) > 0)
                    .map((c) => {
                      const isSelected = c.id === selectedCatId;
                      return (
                        <View key={c.id} style={{ width: '48.5%' }}>
                          <PressableScale
                            activeScale={0.96}
                            onPress={() => handleSelectCategory(c)}
                            containerStyle={{ width: '100%' }}
                            style={{
                              width: '100%',
                              minHeight: 64,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: theme.radius.md,
                              backgroundColor: isSelected
                                ? (theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)')
                                : theme.colors.surfaceElevated,
                              borderWidth: 1.5,
                              borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                              gap: 8,
                            }}
                          >
                            {/* 2-Liner Left Side: Line 1 = Name, Line 2 = Price */}
                            <View style={{ flex: 1, gap: 2 }}>
                              {/* Line 1: Icon + Name */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <CategoryIcon name={c.icon} size={16} color={theme.colors.primary} />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: '800',
                                    color: theme.colors.text,
                                  }}
                                  numberOfLines={1}
                                >
                                  {c.name}
                                </Text>
                              </View>

                              {/* Line 2: Price Limit */}
                              <Text
                                variant="caption"
                                style={{
                                  color: theme.colors.primary,
                                  fontWeight: '800',
                                  fontSize: 12,
                                  marginLeft: 24,
                                }}
                                numberOfLines={1}
                              >
                                {formatMoney(Number(c.budget_monthly), currency)}
                                <Text style={{ fontSize: 10, fontWeight: '600', color: theme.colors.textMuted }}> /mo</Text>
                              </Text>
                            </View>

                            {/* Right Side: Equal-Sized Delete Action Button */}
                            <PressableScale
                              activeScale={0.88}
                              onPress={(e) => {
                                e.stopPropagation?.();
                                handleClearSingle(c.id);
                              }}
                              hitSlop={8}
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                                borderWidth: 1,
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Trash2 size={15} color={theme.colors.danger} />
                            </PressableScale>
                          </PressableScale>
                        </View>
                      );
                    })}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
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
