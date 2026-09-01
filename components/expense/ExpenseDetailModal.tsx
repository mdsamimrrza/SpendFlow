import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CreditCard,
  Edit3,
  Image as ImageIcon,
  Landmark,
  Tag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney, formatTime12 } from '@/utils/format';

export interface ExpenseDetailModalProps {
  expense: Expense | null;
  visible: boolean;
  onClose: () => void;
  onDelete?: (expense: Expense) => void;
}

export function ExpenseDetailModal({
  expense,
  visible,
  onClose,
  onDelete,
}: ExpenseDetailModalProps) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { convert } = useExchangeRates();
  const { isPrivacyMode } = usePrivacy();
  const { t } = useLanguage();
  const router = useRouter();

  const [fullImageModalUrl, setFullImageModalUrl] = useState<string | null>(null);

  if (!expense) return null;

  const isIncome = expense.type === 'income';
  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const isDifferentCurrency = expense.currency && expense.currency !== preferredCurrency;
  const convertedAmount = isDifferentCurrency
    ? convert(Number(expense.amount), expense.currency, preferredCurrency)
    : Number(expense.amount);

  const categoryName = expense.categories?.name || (isIncome ? 'Income Source' : 'Expense');
  const categoryIcon = expense.categories?.icon || (isIncome ? 'trending-up' : 'tag');

  function handleEdit() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const id = expense?.id;
    onClose();
    if (id) {
      router.push(`/expense/${id}` as any);
    }
  }

  function handleDelete() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (expense && onDelete) {
      onDelete(expense);
      onClose();
    }
  }

  const formattedAmount = isPrivacyMode
    ? '••••••'
    : `${isIncome ? '+' : '-'}${formatMoney(convertedAmount, preferredCurrency)}`;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              maxHeight: '88%',
              backgroundColor: theme.colors.surface,
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: theme.colors.border,
              padding: 22,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 10,
              overflow: 'hidden',
            }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 16 }}
            >
              {/* ── 1. HEADER (Category Pill + Type Badge + Close Button) ── */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                  {/* Category Pill */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: theme.colors.background,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CategoryIcon
                        name={categoryIcon}
                        size={14}
                        color={isIncome ? theme.colors.income : theme.colors.primary}
                      />
                    </View>
                    <Text style={{ fontWeight: '800', fontSize: 13, color: theme.colors.text }}>
                      {categoryName}
                    </Text>
                  </View>

                  {/* Transaction Type Badge */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: theme.radius.full,
                      backgroundColor: isIncome
                        ? (theme.isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5')
                        : (theme.isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2'),
                      borderWidth: 1,
                      borderColor: isIncome
                        ? (theme.isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0')
                        : (theme.isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA'),
                    }}
                  >
                    {isIncome ? (
                      <ArrowUpRight size={13} color={theme.colors.income} strokeWidth={2.5} />
                    ) : (
                      <ArrowDownRight size={13} color={theme.isDark ? '#F87171' : '#DC2626'} strokeWidth={2.5} />
                    )}
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '800',
                        color: isIncome
                          ? theme.colors.income
                          : (theme.isDark ? '#F87171' : '#DC2626'),
                      }}
                    >
                      {isIncome ? 'Income' : 'Expense'}
                    </Text>
                  </View>
                </View>

                {/* Close Button */}
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
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
                  <X size={16} color={theme.colors.text} />
                </Pressable>
              </View>

              {/* ── 2. HERO AMOUNT SECTION ── */}
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 18,
                  backgroundColor: isIncome
                    ? (theme.isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5')
                    : (theme.isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2'),
                  borderWidth: 1,
                  borderColor: isIncome
                    ? (theme.isDark ? 'rgba(16, 185, 129, 0.25)' : '#A7F3D0')
                    : (theme.isDark ? 'rgba(239, 68, 68, 0.2)' : '#FECACA'),
                  gap: 3,
                }}
              >
                <Text
                  variant="caption"
                  muted
                  style={{
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    fontSize: 11,
                    color: isIncome ? theme.colors.income : theme.colors.textMuted,
                  }}
                >
                  {isIncome ? 'Income Received (Inflow)' : 'Expense Spent (Outflow)'}
                </Text>

                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: 32,
                    lineHeight: 38,
                    fontWeight: '900',
                    color: isIncome
                      ? theme.colors.income
                      : (theme.isDark ? '#EF4444' : '#DC2626'),
                    letterSpacing: -0.5,
                    fontVariant: ['tabular-nums'],
                    textAlign: 'center',
                    includeFontPadding: false,
                  }}
                >
                  {formattedAmount}
                </Text>

                {isDifferentCurrency && !isPrivacyMode ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 2,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderRadius: theme.radius.full,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted }}>
                      Original: {isIncome ? '+' : '-'}{formatMoney(Number(expense.amount), expense.currency)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* ── 3. TRANSACTION DETAILS CARD ── */}
              <View
                style={{
                  borderRadius: 16,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  padding: 14,
                  gap: 12,
                }}
              >
                {/* Description Row */}
                {expense.description ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Tag size={16} color={theme.colors.textMuted} />
                        <Text variant="caption" muted style={{ fontSize: 12 }}>
                          {t('expense_description') || 'Description'}
                        </Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontWeight: '700', color: theme.colors.text }}
                      >
                        {expense.description}
                      </Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />
                  </>
                ) : null}

                {/* Date & Time Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Calendar size={16} color={theme.colors.textMuted} />
                    <Text variant="caption" muted style={{ fontSize: 12 }}>
                      {t('expense_date') || 'Date & Time'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                    {expense.date} {expense.time ? `· ${formatTime12(expense.time)}` : ''}
                  </Text>
                </View>

                <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />

                {/* Account Row (Paid From / Received To) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Wallet size={16} color={theme.colors.textMuted} />
                    <Text variant="caption" muted style={{ fontSize: 12 }}>
                      {isIncome ? 'Received To' : 'Paid From'}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontWeight: '700', color: theme.colors.text }}
                  >
                    {expense.bank_accounts?.name || expense.payment_method || 'Cash'}
                  </Text>
                </View>

                {/* Payment Channel Row (UPI / Card / Cash) — only when an account is linked */}
                {expense.bank_accounts?.name ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <CreditCard size={16} color={theme.colors.textMuted} />
                      <Text variant="caption" muted style={{ fontSize: 12 }}>
                        Payment Channel
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontWeight: '700', color: theme.colors.text }}
                    >
                      {expense.payment_method || 'Cash'}
                    </Text>
                  </View>
                ) : null}

                {/* Notes (if any) */}
                {expense.notes ? (
                  <>
                    <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />
                    <View style={{ gap: 4 }}>
                      <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>
                        {t('expense_notes') || 'Notes'}
                      </Text>
                      <Text style={{ fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic', lineHeight: 18 }}>
                        "{expense.notes}"
                      </Text>
                    </View>
                  </>
                ) : null}

                {/* Receipt Image Preview (if attached) */}
                {expense.receipt_image_url ? (
                  <>
                    <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <ImageIcon size={16} color={theme.colors.textMuted} />
                          <Text variant="caption" muted style={{ fontSize: 12, fontWeight: '600' }}>
                            {t('expense_receipt') || 'Receipt Attachment'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary }}>
                          Tap to expand 🔍
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => setFullImageModalUrl(expense.receipt_image_url)}
                        style={({ pressed }) => ({
                          borderRadius: 12,
                          overflow: 'hidden',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Image
                          source={{ uri: expense.receipt_image_url }}
                          style={{ width: '100%', height: 140 }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>

              {/* ── 4. ACTION FOOTER BUTTONS (CLOSE & EDIT) ── */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                {/* Close Button */}
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 48,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text style={{ fontWeight: '700', fontSize: 14, color: theme.colors.text }}>
                    {t('common_cancel') || 'Close'}
                  </Text>
                </Pressable>

                {/* Edit Button with dynamic Income/Expense text & styling */}
                <Pressable
                  onPress={handleEdit}
                  style={({ pressed }) => ({
                    flex: 1.4,
                    height: 48,
                    borderRadius: theme.radius.md,
                    backgroundColor: isIncome ? theme.colors.income : theme.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    opacity: pressed ? 0.8 : 1,
                    shadowColor: isIncome ? theme.colors.income : theme.colors.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 4,
                  })}
                >
                  <Edit3 size={17} color="#FFFFFF" />
                  <Text style={{ fontWeight: '800', fontSize: 14, color: '#FFFFFF' }}>
                    {isIncome ? 'Edit Income' : 'Edit Expense'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Full-Screen Receipt Zoom Lightbox */}
      <ImageViewerModal
        visible={Boolean(fullImageModalUrl)}
        imageUrl={fullImageModalUrl}
        onClose={() => setFullImageModalUrl(null)}
      />
    </>
  );
}
