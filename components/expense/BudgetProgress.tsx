import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Flame,
  Plus,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react-native';
import { CategoryBudgetFormModal } from '@/components/expense/CategoryBudgetFormModal';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { Category, Expense } from '@/types';
import { formatMoney, formatTime12 } from '@/utils/format';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function BudgetProgress({
  categories,
  expenses,
  targetCurrency,
  onRefreshCategories,
}: {
  categories: Category[];
  expenses: Expense[];
  targetCurrency?: string;
  onRefreshCategories?: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { convert } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const [modalOpen, setModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedDrawerCatId, setSelectedDrawerCatId] = useState<string | null>(null);

  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const currentMonthKey = new Date().toISOString().slice(0, 7);

  const budgetedCategories = categories.filter(
    (c) => c.budget_monthly && Number(c.budget_monthly) > 0,
  );

  const totalAllocated = budgetedCategories.reduce(
    (sum, c) => sum + Number(c.budget_monthly),
    0,
  );

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(1, daysInMonth - now.getDate());

  function toggleExpandAll() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  }

  function toggleCategoryDrawer(catId: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDrawerCatId(selectedDrawerCatId === catId ? null : catId);
  }

  // Show top 2 if collapsed, or all if expanded
  const visibleCategories = isExpanded ? budgetedCategories : budgetedCategories.slice(0, 2);
  const hiddenCount = Math.max(0, budgetedCategories.length - 2);

  return (
    <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
      {/* ── CARD HEADER ── */}
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
            <Target size={18} color={theme.colors.primary} />
          </View>
          <View>
            <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
              {t('category_budget_active_caps') || 'Category Budget Limits'}
            </Text>
            <Text variant="caption" muted style={{ fontSize: 11 }}>
              {budgetedCategories.length > 0
                ? `${budgetedCategories.length} active caps · ${formatMoney(totalAllocated, currency)} total`
                : t('category_budget_no_caps') || 'No active category caps'}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => setModalOpen(true)}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: theme.radius.full,
            backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(79, 70, 229, 0.08)',
            borderWidth: 1,
            borderColor: theme.colors.primary,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Sliders size={12} color={theme.colors.primary} />
          <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 11 }}>
            {t('category_budget_adjust_caps') || 'Adjust Caps'}
          </Text>
        </Pressable>
      </View>

      {/* ── EMPTY STATE IF NO CATEGORIES HAVE CAPS ── */}
      {budgetedCategories.length === 0 ? (
        <View
          style={{
            padding: 16,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceElevated,
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderStyle: 'dashed',
          }}
        >
          <Text style={{ fontSize: 24 }}>🎯</Text>
          <Text style={{ fontWeight: '700', fontSize: 13, color: theme.colors.text }}>
            {t('category_budget_no_caps') || 'No Category Spending Caps Set'}
          </Text>
          <Text variant="caption" muted style={{ textAlign: 'center', fontSize: 11, lineHeight: 15 }}>
            {t('category_budget_no_caps_sub') || 'Establish monthly allowances for Food, Transport, and Shopping to track micro-spending pacing.'}
          </Text>

          <Pressable
            onPress={() => setModalOpen(true)}
            style={{
              marginTop: 4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Plus size={14} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>
              {t('category_budget_set_caps_btn') || 'Set Category Caps'}
            </Text>
          </Pressable>
        </View>
      ) : (
        /* ── CATEGORY BUDGET CARDS MATRIX (ROLL / EXPANDABLE) ── */
        <View style={{ gap: 10 }}>
          {visibleCategories.map((category) => {
            const budget = Number(category.budget_monthly);
            const categoryExpenses = expenses.filter(
              (e) => e.category_id === category.id && e.date.startsWith(currentMonthKey),
            );
            const spent = categoryExpenses.reduce(
              (total, e) => total + convert(Number(e.amount), e.currency || 'NPR', currency),
              0,
            );

            const ratio = spent / budget;
            const pct = Math.round(ratio * 100);
            const isOver = spent > budget;
            const isWarning = pct >= 80 && !isOver;

            let statusColor = category.color || theme.colors.primary;
            let statusText = 'Safe Pacing';
            let StatusIcon = ShieldCheck;

            if (isOver) {
              statusColor = theme.colors.danger;
              statusText = 'Ceiling Exceeded';
              StatusIcon = ShieldAlert;
            } else if (isWarning) {
              statusColor = '#F59E0B';
              statusText = 'Approaching Cap';
              StatusIcon = AlertTriangle;
            }

            const remaining = Math.max(0, budget - spent);
            const dailyBurnRateRemaining = Math.round(remaining / daysRemaining);
            const isDrawerOpen = selectedDrawerCatId === category.id;

            return (
              <View
                key={category.id}
                style={{
                  padding: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: isOver
                    ? (theme.isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.25)')
                    : theme.colors.border,
                  gap: 8,
                }}
              >
                {/* 1. Header: Icon + Name + Status Pill + Drawer Toggle */}
                <Pressable
                  onPress={() => toggleCategoryDrawer(category.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{category.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.text }} numberOfLines={1}>
                        {category.name}
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 10 }}>
                        {categoryExpenses.length} transactions this month
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 2.5,
                        borderRadius: theme.radius.full,
                        backgroundColor: isOver
                          ? (theme.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
                          : isWarning
                          ? (theme.isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)')
                          : (theme.isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)'),
                      }}
                    >
                      <StatusIcon size={11} color={statusColor} />
                      <Text variant="caption" style={{ fontWeight: '800', fontSize: 10, color: statusColor }}>
                        {pct}%
                      </Text>
                    </View>

                    <ChevronDown
                      size={16}
                      color={theme.colors.textMuted}
                      style={{ transform: [{ rotate: isDrawerOpen ? '180deg' : '0deg' }] }}
                    />
                  </View>
                </Pressable>

                {/* 2. Amount Figures Row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: isOver ? theme.colors.danger : theme.colors.text, fontVariant: ['tabular-nums'] }}>
                      {formatMoney(spent, currency)}
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      spent of {formatMoney(budget, currency)}
                    </Text>
                  </View>

                  <Text
                    variant="caption"
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: isOver ? theme.colors.danger : theme.colors.primary,
                    }}
                  >
                    {isOver
                      ? `+${formatMoney(spent - budget, currency)} over`
                      : `${formatMoney(remaining, currency)} left`}
                  </Text>
                </View>

                {/* 3. Progress Bar */}
                <View
                  style={{
                    height: 7,
                    borderRadius: 3.5,
                    overflow: 'hidden',
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  }}
                >
                  <View
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      height: '100%',
                      backgroundColor: statusColor,
                      borderRadius: 3.5,
                    }}
                  />
                </View>

                {/* 4. Daily Pace Micro-advisory footer */}
                {!isOver && remaining > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="caption" muted style={{ fontSize: 10 }}>
                      Safe pace: <Text style={{ fontWeight: '700', color: theme.colors.text }}>{formatMoney(dailyBurnRateRemaining, currency)}/day</Text> ({daysRemaining}d left)
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 10 }}>
                      {Math.round((remaining / budget) * 100)}% remaining
                    </Text>
                  </View>
                ) : isOver ? (
                  <Text variant="caption" style={{ color: theme.colors.danger, fontSize: 10, fontWeight: '700' }}>
                    ⚠️ Spending has passed the {formatMoney(budget, currency)} ceiling.
                  </Text>
                ) : null}

                {/* ── 5. ITEM TRANSACTIONS EXPANDED ACCORDION DRAWER ── */}
                {isDrawerOpen ? (
                  <View
                    style={{
                      marginTop: 4,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.border,
                      gap: 6,
                    }}
                  >
                    <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 9 }}>
                      This Month's Outflows in {category.name} ({categoryExpenses.length})
                    </Text>

                    {categoryExpenses.length === 0 ? (
                      <Text variant="caption" muted style={{ fontSize: 11, fontStyle: 'italic', paddingVertical: 4 }}>
                        No transactions recorded in this period.
                      </Text>
                    ) : (
                      <View style={{ gap: 4 }}>
                        {categoryExpenses.slice(0, 4).map((item) => (
                          <View
                            key={item.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 4,
                              paddingHorizontal: 6,
                              borderRadius: theme.radius.sm,
                              backgroundColor: theme.colors.background,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>
                                {item.description || category.name}
                              </Text>
                              <Text variant="caption" muted style={{ fontSize: 9 }}>
                                {item.date} {item.time ? `• ${formatTime12(item.time)}` : ''}
                              </Text>
                            </View>

                            <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.text }}>
                              {formatMoney(Number(item.amount), item.currency || currency)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* ── 6. ROLL OUT / EXPAND / COLLAPSE BUTTON ── */}
          {budgetedCategories.length > 2 ? (
            <Pressable
              onPress={toggleExpandAll}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.8 : 1,
                marginTop: 2,
              })}
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={14} color={theme.colors.primary} />
                  <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '800' }}>
                    {t('category_budget_show_less') || 'Show Less'} ▴
                  </Text>
                </>
              ) : (
                <>
                  <ChevronDown size={14} color={theme.colors.primary} />
                  <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '800' }}>
                    {t('category_budget_roll_out') || 'Roll Out All Categories'} ({budgetedCategories.length}) ▾
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      )}

      {/* ── EMBEDDED CATEGORY STUDIO FORM MODAL ── */}
      <CategoryBudgetFormModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          onRefreshCategories?.();
        }}
      />
    </Card>
  );
}