import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Calendar, ChevronLeft, ChevronRight, CreditCard, FileText, Image as ImageIcon, RefreshCw, Tag, X } from 'lucide-react-native';
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
                    <View style={{ gap: 4, paddingVertical: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <FileText size={15} color={theme.colors.textMuted} />
                        <Text variant="caption" muted>{t('expense_description')}</Text>
                      </View>
                      <Text variant="body" style={{ fontWeight: '600' }}>
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
export function CategoryBreakdown({ expenses, targetCurrency }: { expenses: Expense[]; targetCurrency?: string }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { rates, convert } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();
  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';

  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [inspectingExpense, setInspectingExpense] = useState<Expense | null>(null);
  // Measured heights of both faces so the wrapper resizes to the ACTIVE face
  // (prevents a blank gap below the card / pushed-down Recent Activity after flipping)
  const [frontHeight, setFrontHeight] = useState<number | null>(null);
  const [backHeight, setBackHeight] = useState<number | null>(null);

  const hasIncome = useMemo(() => expenses.some((e) => e.type === 'income'), [expenses]);

  // ── Flip Animation ──
  const flipAnim = useRef(new Animated.Value(0)).current;

  const handleFlip = () => {
    const toValue = isFlipped ? 0 : 1;
    setIsFlipped(!isFlipped);
    setSelectedCategory(null);
    Animated.spring(flipAnim, {
      toValue,
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

  const renderBody = (type: 'expense' | 'income') => {
    const data = dataByType[type];
    const total = data.reduce((sum, item) => sum + item.total, 0);
    const filteredCategoryExpenses = filteredByType[type];
    const selectedCategoryItem = data.find((d) => d.label === selectedCategory);

    return (
      <>
      {/* ── CARD HEADER ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
            {type === 'income' ? 'Income Streams Breakdown' : t('charts_category_breakdown') || 'Category Breakdown'}
          </Text>
        </View>

        {/* Flip Button — red = Expense side, green = Income side */}
        {hasIncome && (
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
              backgroundColor:
                type === 'income'
                  ? (theme.isDark ? 'rgba(52, 211, 153, 0.18)' : '#DCE9E3')
                  : (theme.isDark ? 'rgba(239, 68, 68, 0.18)' : '#F1DCD3'),
              borderWidth: 1.2,
              borderColor: type === 'income' ? '#059669' : theme.colors.danger,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <RefreshCw size={12} color={type === 'income' ? '#059669' : theme.colors.danger} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: type === 'income' ? '#059669' : theme.colors.danger }}>
              {type === 'income' ? 'Income' : 'Expenses'}
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

      {total === 0 ? (
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
        {/* ═══════════ FRONT FACE: EXPENSE BREAKDOWN ═══════════ */}
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
          <Card style={{ gap: 10, padding: 14 }}>{renderBody('expense')}</Card>
        </Animated.View>

        {/* ═══════════ BACK FACE: INCOME BREAKDOWN ═══════════ */}
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
          <Card style={{ gap: 10, padding: 14 }}>{renderBody('income')}</Card>
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

/* ── 📈 7-DAY INTERACTIVE SPENDING TREND ── */
function TrendBars({ expenses, targetCurrency }: { expenses: Expense[]; targetCurrency?: string }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { rates, convert } = useExchangeRates();
  const { t, language } = useLanguage();
  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';

  // 0 = Current Week, 1 = Previous Week, 2 = 2 Weeks Ago, etc.
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [inspectingExpense, setInspectingExpense] = useState<Expense | null>(null);
  const dismissDayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectDay = (dateStr: string) => {
    if (dismissDayTimerRef.current) clearTimeout(dismissDayTimerRef.current);
    setSelectedDateStr((current) => {
      const next = current === dateStr ? null : dateStr;
      if (next !== null) {
        dismissDayTimerRef.current = setTimeout(() => {
          setSelectedDateStr(null);
        }, 5000);
      }
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (dismissDayTimerRef.current) clearTimeout(dismissDayTimerRef.current);
    };
  }, []);

  // 1. Map date -> total spent in target currency
  const spentByDate = expenses.reduce<Record<string, number>>((acc, expense) => {
    const converted = convert(Number(expense.amount), expense.currency || 'NPR', currency);
    acc[expense.date] = (acc[expense.date] ?? 0) + converted;
    return acc;
  }, {});

  // 2. Compute Monday through Sunday for the selected week offset
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const targetMonday = new Date(today);
  targetMonday.setDate(today.getDate() - distanceToMonday - weekOffset * 7);

  const weekDays: { dateStr: string; dayLabel: string; dayNum: number; fullDate: Date; amount: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(targetMonday);
    d.setDate(targetMonday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';
    const dayLabel = d.toLocaleDateString(locale, { weekday: 'short' });
    const dayNum = d.getDate();
    weekDays.push({
      dateStr,
      dayLabel,
      dayNum,
      fullDate: d,
      amount: spentByDate[dateStr] ?? 0,
    });
  }

  const locale = language === 'ne' ? 'ne-NP' : language === 'hi' ? 'hi-IN' : 'en-US';
  const startDateStr = weekDays[0].fullDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const endDateStr = weekDays[6].fullDate.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

  const maxAmount = Math.max(...weekDays.map((d) => d.amount), 1);
  const totalWeekSpend = weekDays.reduce((sum, d) => sum + d.amount, 0);
  const dailyAverage = Math.round(totalWeekSpend / 7);

  const isCurrentWeek = weekOffset === 0;

  // Selected Day Details Filter
  const selectedDayExpenses = useMemo(() => {
    if (!selectedDateStr) return [];
    return expenses.filter((e) => e.date === selectedDateStr);
  }, [expenses, selectedDateStr]);

  const selectedDayObj = weekDays.find((d) => d.dateStr === selectedDateStr);
  const selectedDayTotal = selectedDayObj ? selectedDayObj.amount : 0;

  return (
    <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
      {/* HEADER & WEEK NAVIGATION */}
      <View style={{ gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h3">{t('charts_spending_trend')}</Text>

          {/* Week Selector Controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.md, padding: 4, borderWidth: 1, borderColor: theme.colors.border }}>
            <Pressable
              hitSlop={8}
              onPress={() => {
                setWeekOffset((prev) => prev + 1);
                setSelectedDateStr(null);
              }}
              style={{ padding: 4, borderRadius: 4 }}
            >
              <ChevronLeft size={18} color={theme.colors.text} />
            </Pressable>

            <Text variant="caption" style={{ fontWeight: '700', paddingHorizontal: 4 }}>
              {isCurrentWeek ? t('charts_this_week') : `${weekOffset} ${weekOffset === 1 ? t('charts_week_ago') : t('charts_weeks_ago')}`}
            </Text>

            <Pressable
              hitSlop={8}
              disabled={isCurrentWeek}
              onPress={() => {
                setWeekOffset((prev) => Math.max(0, prev - 1));
                setSelectedDateStr(null);
              }}
              style={{ padding: 4, borderRadius: 4, opacity: isCurrentWeek ? 0.3 : 1 }}
            >
              <ChevronRight size={18} color={isCurrentWeek ? theme.colors.textMuted : theme.colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Date Range Subheader */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="caption" muted style={{ fontWeight: '600' }}>
            📅 {startDateStr} – {endDateStr}
          </Text>
          <Text variant="caption" muted style={{ fontWeight: '600' }}>
            {t('charts_avg_day')}: {formatMoney(dailyAverage, currency)}/day
          </Text>
        </View>
      </View>

      {/* ── 7-DAY INTERACTIVE CAPSULES STRIP ── */}
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'space-between' }}>
        {weekDays.map((item) => {
          const isSelected = selectedDateStr === item.dateStr;
          const isPeak = item.amount > 0 && item.amount === maxAmount;
          const fillRatio = item.amount > 0 ? Math.max(0.15, item.amount / maxAmount) : 0;

          return (
            <Pressable
              key={item.dateStr}
              accessibilityRole="button"
              accessibilityLabel={`View expenses for ${item.dayLabel} ${item.dayNum}`}
              onPress={() => handleSelectDay(item.dateStr)}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 2,
                borderRadius: theme.radius.md,
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? theme.colors.primary : isPeak ? (theme.isDark ? '#818CF8' : '#4F46E5') : theme.colors.border,
                backgroundColor: isSelected
                  ? (theme.isDark ? 'rgba(129, 140, 248, 0.22)' : 'rgba(79, 70, 229, 0.12)')
                  : theme.colors.surfaceElevated,
                minHeight: 110,
                position: 'relative',
              }}
            >
              {/* Day Name */}
              <Text
                variant="caption"
                style={{
                  fontSize: 11,
                  fontWeight: isSelected ? '800' : '600',
                  color: isSelected ? theme.colors.primary : theme.colors.textMuted,
                  textTransform: 'uppercase',
                }}
              >
                {item.dayLabel}
              </Text>

              {/* Day Number */}
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: isSelected ? '#FFFFFF' : theme.colors.text,
                  }}
                >
                  {item.dayNum}
                </Text>
              </View>

              {/* Spending Intensity Level Capsule */}
              <View
                style={{
                  width: 8,
                  height: 24,
                  borderRadius: 4,
                  backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  overflow: 'hidden',
                  justifyContent: 'flex-end',
                }}
              >
                <View
                  style={{
                    width: '100%',
                    height: `${fillRatio * 100}%`,
                    backgroundColor: theme.colors.primary,
                    opacity: item.amount > 0 ? (isSelected ? 1 : 0.8) : 0,
                    borderRadius: 4,
                  }}
                />
              </View>

              {/* Amount Label */}
              <Text
                variant="caption"
                numberOfLines={1}
                style={{
                  fontSize: 9,
                  fontWeight: '700',
                  color: item.amount > 0 ? (isSelected ? theme.colors.primary : theme.colors.text) : theme.colors.textMuted,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.amount > 0 ? `${Math.round(item.amount).toLocaleString()}` : '—'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* SUMMARY FOOTER */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Text variant="caption" muted>
          {t('charts_peak_day')}: <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>{formatMoney(maxAmount, currency)}</Text>
        </Text>
        <Text variant="caption" muted>
          {t('charts_week_total')}: <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.text }}>{formatMoney(totalWeekSpend, currency)}</Text>
        </Text>
      </View>

      {/* ── ON-CLICK DAY EXPENSES LIST ── */}
      {selectedDayObj && (
        <View
          style={{
            marginTop: theme.spacing.xs,
            paddingTop: theme.spacing.md,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            gap: theme.spacing.md,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
                {selectedDayObj.fullDate.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              <Text variant="caption" muted>
                {selectedDayExpenses.length} {selectedDayExpenses.length === 1 ? 'transaction' : 'transactions'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Text variant="h3" style={{ color: theme.colors.primary, fontWeight: '800' }}>
                {formatMoney(selectedDayTotal, currency)}
              </Text>

              <Pressable
                onPress={() => setSelectedDateStr(null)}
                hitSlop={8}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: theme.colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Transactions List */}
          {selectedDayExpenses.length === 0 ? (
            <Text variant="caption" muted style={{ paddingVertical: 4 }}>
              {t('charts_no_day_expenses')}
            </Text>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {selectedDayExpenses.map((expense) => {
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
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderRadius: theme.radius.md,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Text style={{ fontSize: 20 }}>{expense.categories?.icon || '💳'}</Text>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="label" style={{ fontWeight: '600' }} numberOfLines={1}>
                          {expense.description || expense.categories?.name || 'Expense'}
                        </Text>
                        <Text variant="caption" muted style={{ fontSize: 11 }}>
                          {expense.categories?.name} · {expense.payment_method} {expense.time ? `· 🕒 ${formatTime12(expense.time)}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text
                        variant="label"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.72}
                        style={{ fontWeight: '800', color: theme.colors.text, fontSize: 15 }}
                      >
                        {formatMoney(converted, currency)}
                      </Text>
                      {isDifferent ? (
                        <Text
                          style={{
                            fontSize: 11,
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
          )}
        </View>
      )}

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        expense={inspectingExpense}
        currency={currency}
        onClose={() => setInspectingExpense(null)}
      />
    </Card>
  );
}
