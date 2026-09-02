import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Calendar, ChevronLeft, ChevronRight, CreditCard, FileText, Image as ImageIcon, Landmark, RefreshCw, Tag, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Expense } from '@/types';
import { formatMoney, formatTime12, groupByCategory } from '@/utils/format';

/* ── 🌟 REUSABLE EXPENSE DETAIL MODAL ── */
function ExpenseDetailModal({
  expense,
  currency,
  onClose,
}: {
  expense: Expense | null;
  currency: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { convert } = useExchangeRates();
  const { t } = useLanguage();
  const [fullImageModalUrl, setFullImageModalUrl] = useState<string | null>(null);

  if (!expense) return null;

  const isIncome = (expense.type || 'expense') === 'income';
  const isDifferentCurrency = expense.currency && expense.currency !== currency;
  const convertedAmount = isDifferentCurrency
    ? convert(Number(expense.amount), expense.currency, currency)
    : Number(expense.amount);

  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              maxHeight: '90%',
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            {/* Modal Top Grab Header */}
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

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
                    <CategoryIcon name={expense.categories?.icon} size={20} color={theme.colors.primary} />
                  </View>
                  <View>
                    <Text variant="h3" style={{ fontWeight: '800', fontSize: 17 }}>
                      {isIncome ? 'Income Details' : (t('expense_detail_title') || 'Expense Details')}
                    </Text>
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      {expense.categories?.name || 'Uncategorized'} · {expense.date}
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

            {/* Scrollable Content Body */}
            <ScrollView
              contentContainerStyle={{
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
                paddingBottom: theme.spacing.xl,
              }}
              showsVerticalScrollIndicator
            >
              {/* Hero Amount Banner (Primary Currency in BIG bold font) */}
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: theme.spacing.md,
                  backgroundColor: theme.isDark ? '#141E33' : theme.colors.cardHighlight,
                  borderRadius: theme.radius.md,
                  gap: 3,
                  borderWidth: 1,
                  borderColor: theme.isDark ? 'rgba(129, 140, 248, 0.2)' : theme.colors.border,
                }}
              >
                <Text variant="caption" muted style={{ fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10 }}>
                  {t('expense_amount')}
                </Text>
                  <Text
                    variant="h1"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    style={{
                      fontSize: 32,
                      fontWeight: '800',
                      color: isIncome ? '#10B981' : (theme.isDark ? '#EF4444' : '#DC2626'),
                      maxWidth: '100%',
                    }}
                  >
                  {formatMoney(convertedAmount, currency)}
                </Text>
                {isDifferentCurrency ? (
                  <Text style={{ fontWeight: '600', fontSize: 13, color: theme.colors.textMuted, marginTop: 2 }}>
                    Original: {formatMoney(Number(expense.amount), expense.currency)}
                  </Text>
                ) : null}
              </View>

              {/* Details Table */}
              <View style={{ gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}>
                {/* Category */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Tag size={15} color={theme.colors.textMuted} />
                    <Text variant="caption" muted>{t('expense_category')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}>
                    <CategoryIcon name={expense.categories?.icon} size={14} color={theme.colors.text} />
                    <Text variant="label" style={{ flexShrink: 1, textAlign: 'right', fontWeight: '700' }}>
                      {expense.categories?.name || 'Uncategorized'}
                    </Text>
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: theme.colors.border }} />

                {/* Date & Time (12-hour format) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Calendar size={15} color={theme.colors.textMuted} />
                    <Text variant="caption" muted>{t('expense_date')}</Text>
                  </View>
                  <Text variant="label" style={{ flexShrink: 1, textAlign: 'right', fontWeight: '600' }}>
                    {expense.date} {expense.time ? `· 🕒 ${formatTime12(expense.time)}` : ''}
                  </Text>
                </View>

                <View style={{ height: 1, backgroundColor: theme.colors.border }} />

                {/* Paid From / Received To (bank account) */}
                {expense.bank_accounts?.name ? (
                  <>
                    <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Landmark size={15} color={theme.colors.textMuted} />
                        <Text variant="caption" muted>{isIncome ? 'Received To' : 'Paid From'}</Text>
                      </View>
                      <Text variant="label" style={{ flexShrink: 1, textAlign: 'right', fontWeight: '700' }}>
                        {expense.bank_accounts.name}
                      </Text>
                    </View>
                  </>
                ) : null}

                {/* Payment Method */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CreditCard size={15} color={theme.colors.textMuted} />
                    <Text variant="caption" muted>{t('expense_payment_method')}</Text>
                  </View>
                  <Text variant="label" style={{ flexShrink: 1, textAlign: 'right', fontWeight: '600', textTransform: 'capitalize' }}>
                    {expense.payment_method}
                  </Text>
                </View>

                {/* Description (if provided) */}
                {expense.description ? (
                  <>
                    <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <FileText size={15} color={theme.colors.textMuted} />
                        <Text variant="caption" muted>{t('expense_description')}</Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        variant="label"
                        style={{ flexShrink: 1, textAlign: 'right', fontWeight: '700' }}
                      >
                        {expense.description}
                      </Text>
                    </View>
                  </>
                ) : null}

                {/* Notes (if provided) */}
                {expense.notes ? (
                  <>
                    <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                    <View style={{ gap: 4, paddingVertical: 4 }}>
                      <Text variant="caption" muted>{t('expense_notes')}</Text>
                      <Text variant="body" muted style={{ fontStyle: 'italic' }}>
                        "{expense.notes}"
                      </Text>
                    </View>
                  </>
                ) : null}

                {/* Receipt (if attached) */}
                {expense.receipt_image_url ? (
                  <>
                    <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                    <View style={{ gap: 6, paddingVertical: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <ImageIcon size={15} color={theme.colors.textMuted} />
                          <Text variant="caption" muted>{t('expense_receipt')}</Text>
                        </View>
                        <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                          Tap to expand 🔍
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setFullImageModalUrl(expense.receipt_image_url)}
                        style={{
                          borderRadius: theme.radius.md,
                          overflow: 'hidden',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Image
                          source={{ uri: expense.receipt_image_url }}
                          style={{ width: '100%', height: 160 }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Bottom Action Footer with Equal 50/50 Cancel and Edit Buttons */}
              <View
                style={{
                  flexDirection: 'row',
                  gap: theme.spacing.sm,
                  marginTop: 6,
                }}
              >
                <Button
                  title={t('common_cancel')}
                  variant="secondary"
                  onPress={onClose}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                />
                <Button
                  title={isIncome ? '✏️ Edit Income' : `✏️ ${t('expense_edit_btn')}`}
                  onPress={() => {
                    const id = expense.id;
                    onClose();
                    router.push(`/expense/${id}`);
                  }}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: theme.radius.md,
                  }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Full Screen Image Modal */}
      <ImageViewerModal
        visible={Boolean(fullImageModalUrl)}
        imageUrl={fullImageModalUrl}
        onClose={() => setFullImageModalUrl(null)}
      />
    </>
  );
}

const VIBRANT_PALETTE = [
  '#4F46E5', // 1. Indigo
  '#10B981', // 2. Emerald
  '#F59E0B', // 3. Amber
  '#EC4899', // 4. Pink
  '#8B5CF6', // 5. Purple
  '#06B6D4', // 6. Cyan
  '#EF4444', // 7. Red
];

/* ── 📊 INTERACTIVE SEGMENTED DONUT CATEGORY BREAKDOWN ── */
type BreakdownView = 'expense' | 'payment' | 'income';

const BREAKDOWN_VIEW_LABEL: Record<BreakdownView, string> = {
  expense: 'Categories',
  payment: 'Payment',
  income: 'Income',
};

export function CategoryBreakdown({
  expenses,
  targetCurrency,
  paymentMethods,
}: {
  expenses: Expense[];
  targetCurrency?: string;
  paymentMethods?: { method: string; total: number; count: number; pct: number }[];
}) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { rates, convert } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';

  const [isFlipped, setIsFlipped] = useState(false);
  const [flipCount, setFlipCount] = useState(0);
  const [viewA, setViewA] = useState<BreakdownView>('expense');
  const [viewB, setViewB] = useState<BreakdownView>('payment');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [inspectingExpense, setInspectingExpense] = useState<Expense | null>(null);
  // Measured heights of both faces so the wrapper resizes to the ACTIVE face
  // (prevents a blank gap below the card / pushed-down Recent Activity after flipping)
  const [frontHeight, setFrontHeight] = useState<number | null>(null);
  const [backHeight, setBackHeight] = useState<number | null>(null);

  const hasIncome = useMemo(() => expenses.some((e) => e.type === 'income'), [expenses]);

  // Flip cycle: Category → Payment Methods → Income (when present) → back to Category
  const views = useMemo<BreakdownView[]>(() => {
    const list: BreakdownView[] = ['expense'];
    if (paymentMethods && paymentMethods.length > 0) list.push('payment');
    if (hasIncome) list.push('income');
    return list;
  }, [paymentMethods, hasIncome]);

  // ── Flip Animation ──
  const flipAnim = useRef(new Animated.Value(0)).current;

  const handleFlip = () => {
    if (views.length < 2) return;
    const current = flipCount % 2 === 0 ? viewA : viewB;
    const currentIdx = views.indexOf(current);
    const next = views[(Math.max(currentIdx, 0) + 1) % views.length];
    // Load the next view onto the hidden face before revealing it
    if (flipCount % 2 === 0) setViewB(next); else setViewA(next);
    setFlipCount((c) => c + 1);
    setIsFlipped(!isFlipped);
    setSelectedCategory(null);
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  };

  const frontRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  // Pre-compute breakdown data for BOTH flow types so each card face renders independently
  const dataByType = useMemo(() => {
    const build = (ft: 'expense' | 'income') =>
      groupByCategory(expenses, currency, rates, ft)
        .slice(0, 6)
        .map((item, idx) => ({
          ...item,
          color: VIBRANT_PALETTE[idx % VIBRANT_PALETTE.length],
        }));
    return { expense: build('expense'), income: build('income') };
  }, [expenses, currency, rates]);

  // Filtered transactions for selected category, per flow type
  const filteredByType = useMemo(() => {
    const build = (ft: 'expense' | 'income') =>
      !selectedCategory
        ? []
        : expenses.filter(
            (e) => (e.type || 'expense') === ft && (e.categories?.name ?? 'Other') === selectedCategory,
          );
    return { expense: build('expense'), income: build('income') };
  }, [expenses, selectedCategory]);

  const nextOf = (view: BreakdownView) => {
    const idx = views.indexOf(view);
    return views[(Math.max(idx, 0) + 1) % views.length];
  };

  const renderBody = (view: BreakdownView) => {
    const data = view === 'payment' ? [] : dataByType[view];
    const total = data.reduce((sum, item) => sum + item.total, 0);
    const filteredCategoryExpenses = view === 'payment' ? [] : filteredByType[view];
    const selectedCategoryItem = data.find((d) => d.label === selectedCategory);
    const showFlipPill = views.length >= 2 && views.includes(view);

    return (
      <>
      {/* ── CARD HEADER ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {view === 'payment' ? <CreditCard size={16} color={theme.colors.primary} /> : null}
          <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
            {view === 'income'
              ? 'Income Streams Breakdown'
              : view === 'payment'
              ? 'Payment Method Breakdown'
              : t('charts_category_breakdown') || 'Category Breakdown'}
          </Text>
        </View>

        {/* Flip Button — cycles Category → Payment → Income */}
        {showFlipPill && (
          <Pressable
            onPress={handleFlip}
            hitSlop={10}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.16)' : 'rgba(79, 70, 229, 0.08)',
              borderWidth: 1.2,
              borderColor: theme.colors.primary,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <RefreshCw size={12} color={theme.colors.primary} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.primary }}>
              {BREAKDOWN_VIEW_LABEL[nextOf(view)]}
            </Text>
          </Pressable>
        )}

        {selectedCategory && (
          <Pressable
            onPress={() => setSelectedCategory(null)}
            hitSlop={8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary, fontSize: 10.5 }}>
              {selectedCategory} ✕
            </Text>
          </Pressable>
        )}
      </View>

      {view === 'payment' ? (
        /* ── PAYMENT METHOD ROWS ── */
        <View style={{ gap: 12 }}>
          {(paymentMethods ?? []).map((pm) => (
            <View key={pm.method} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                    {pm.method === 'Cash' ? '💵' : pm.method === 'Card' ? '💳' : pm.method === 'UPI' ? '📱' : '🪙'} {pm.method}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    ({pm.count} {pm.count === 1 ? 'tx' : 'txs'})
                  </Text>
                </View>
                <Text
                  variant="caption"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={{ flexShrink: 1, textAlign: 'right', fontWeight: '800', color: theme.colors.primary }}
                >
                  {isPrivacyMode ? '••••' : formatMoney(pm.total, currency)} ({pm.pct}%)
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={{ height: 5, borderRadius: 2.5, overflow: 'hidden', backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                <View
                  style={{
                    width: `${pm.pct}%`,
                    height: '100%',
                    backgroundColor: theme.colors.primary,
                    borderRadius: 2.5,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : total === 0 ? (
        <Text muted style={{ paddingVertical: 4, fontSize: 12 }}>
          {t('charts_no_category') || 'No category expenses logged yet.'}
        </Text>
      ) : (
        <>
          {/* ── FULL-WIDTH COMPACT CATEGORY PROGRESS BARS LIST ── */}
          <View style={{ gap: 8 }}>
            {data.map((item) => {
              const isSelected = selectedCategory === item.label;
              const pct = Math.round((item.total / total) * 100);

              return (
                <Pressable
                  key={item.label}
                  onPress={() => setSelectedCategory((cur) => (cur === item.label ? null : item.label))}
                  style={{
                    gap: 4,
                    paddingVertical: 3,
                    paddingHorizontal: 6,
                    borderRadius: theme.radius.sm,
                    backgroundColor: isSelected
                      ? (theme.isDark ? 'rgba(129, 140, 248, 0.16)' : 'rgba(79, 70, 229, 0.08)')
                      : 'transparent',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color }} />
                      <CategoryIcon name={item.icon} size={14} color={item.color} />
                      <Text style={{ fontSize: 12.5, fontWeight: isSelected ? '800' : '600', color: theme.colors.text }} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </View>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.text }}>
                        {formatMoney(item.total, currency)}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 4,
                          backgroundColor: isSelected ? theme.colors.primary : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '800', color: isSelected ? '#FFFFFF' : theme.colors.textMuted }}>
                          {pct}%
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Sleek compact progress bar */}
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      overflow: 'hidden',
                      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    }}
                  >
                    <View
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        backgroundColor: item.color,
                        borderRadius: 2,
                      }}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ── ON-CLICK CATEGORY EXPENSES LIST DRAWER ── */}
          {selectedCategoryItem && (
            <View
              style={{
                marginTop: theme.spacing.xs,
                paddingTop: theme.spacing.md,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                gap: theme.spacing.sm,
              }}
            >
              {/* Category Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CategoryIcon name={selectedCategoryItem.icon} size={16} color={selectedCategoryItem.color} />
                    <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
                      {selectedCategoryItem.label}
                    </Text>
                  </View>
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    {filteredCategoryExpenses.length} {filteredCategoryExpenses.length === 1 ? 'transaction' : 'transactions'} · {Math.round((selectedCategoryItem.total / total) * 100)}% of total
                  </Text>
                </View>

                <Text variant="h3" style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 16 }}>
                  {formatMoney(selectedCategoryItem.total, currency)}
                </Text>
              </View>

              {/* Transactions List */}
              <View style={{ gap: theme.spacing.xs }}>
                {filteredCategoryExpenses.map((expense) => {
                  const isDifferent = expense.currency && expense.currency !== currency;
                  const converted = isDifferent
                    ? convert(Number(expense.amount), expense.currency, currency)
                    : Number(expense.amount);

                  return (
                    <Pressable
                      key={expense.id}
                      onPress={() => setInspectingExpense(expense)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 9,
                        paddingHorizontal: 12,
                        backgroundColor: theme.colors.surfaceElevated,
                        borderRadius: theme.radius.md,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="label" style={{ fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                          {expense.description || expense.categories?.name || 'Expense'}
                        </Text>
                        <Text variant="caption" muted style={{ fontSize: 11 }}>
                          {expense.date} {expense.time ? `· 🕒 ${formatTime12(expense.time)}` : ''} · {expense.payment_method}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text variant="label" style={{ fontWeight: '800', color: theme.colors.text, fontSize: 14 }}>
                          {formatMoney(converted, currency)}
                        </Text>
                        {isDifferent ? (
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '600',
                              color: theme.colors.textMuted,
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            ({formatMoney(Number(expense.amount), expense.currency)})
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}
      </>

    );
  };

  return (
    <View>
      <View
        style={{
          transform: [{ perspective: 1200 }],
          height: isFlipped ? (backHeight ?? undefined) : (frontHeight ?? undefined),
        }}
      >
        {/* ═══════════ FRONT FACE: FIRST VIEW IN CYCLE ═══════════ */}
        <Animated.View
          pointerEvents={isFlipped ? 'none' : 'auto'}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setFrontHeight(Math.round(h));
          }}
          style={{
            backfaceVisibility: 'hidden',
            transform: [{ rotateY: frontRotateY }],
            opacity: frontOpacity,
          }}
        >
          <Card style={{ gap: 10, padding: 14 }}>{renderBody(viewA)}</Card>
        </Animated.View>

        {/* ═══════════ BACK FACE: NEXT VIEW IN CYCLE ═══════════ */}
        <Animated.View
          pointerEvents={isFlipped ? 'auto' : 'none'}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setBackHeight(Math.round(h));
          }}
          style={{
            backfaceVisibility: 'hidden',
            transform: [{ rotateY: backRotateY }],
            opacity: backOpacity,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          <Card style={{ gap: 10, padding: 14 }}>{renderBody(viewB)}</Card>
        </Animated.View>
      </View>

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        expense={inspectingExpense}
        currency={currency}
        onClose={() => setInspectingExpense(null)}
      />
    </View>
  );
}
