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
  Calendar,
  CreditCard,
  Edit3,
  Image as ImageIcon,
  Tag,
  Trash2,
  X,
} from 'lucide-react-native';
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

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const isDifferentCurrency = expense.currency && expense.currency !== preferredCurrency;
  const convertedAmount = isDifferentCurrency
    ? convert(Number(expense.amount), expense.currency, preferredCurrency)
    : Number(expense.amount);

  const categoryName = expense.categories?.name || 'Expense';
  const categoryIcon = expense.categories?.icon || '📌';
  const categoryColor = expense.categories?.color || theme.colors.primary;

  function handleEdit() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const id = expense?.id;
    onClose();
    if (id) {
      router.push(`/expense/${id}` as any);
    }
  }

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
              {/* ── 1. HEADER (Category Pill + Close Button) ── */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                {/* Category Pill */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: categoryColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{categoryIcon}</Text>
                  </View>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: theme.colors.text }}>
                    {categoryName}
                  </Text>
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
                  backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.08)' : '#EEF2FF',
                  borderWidth: 1,
                  borderColor: theme.isDark ? 'rgba(99, 102, 241, 0.25)' : '#C7D2FE',
                  gap: 4,
                }}
              >
                <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
                  {t('expense_amount') || 'Expense Amount'}
                </Text>

                <Text
                  style={{
                    fontSize: 34,
                    fontWeight: '900',
                    color: theme.colors.primary,
                    letterSpacing: -0.5,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {isPrivacyMode ? '••••••' : formatMoney(convertedAmount, preferredCurrency)}
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
                      Original: {formatMoney(Number(expense.amount), expense.currency)}
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
                {/* Description */}
                {expense.description ? (
                  <View style={{ gap: 3 }}>
                    <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>
                      {t('expense_description') || 'Description'}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>
                      {expense.description}
                    </Text>
                  </View>
                ) : null}

                {expense.description ? (
                  <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.6 }} />
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

                {/* Payment Method Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CreditCard size={16} color={theme.colors.textMuted} />
                    <Text variant="caption" muted style={{ fontSize: 12 }}>
                      {t('expense_payment_method') || 'Payment Method'}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.text }}>
                      💳 {expense.payment_method}
                    </Text>
                  </View>
                </View>

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

                {/* Edit Button */}
                <Pressable
                  onPress={handleEdit}
                  style={({ pressed }) => ({
                    flex: 1.3,
                    height: 48,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    opacity: pressed ? 0.8 : 1,
                    shadowColor: theme.colors.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 4,
                  })}
                >
                  <Edit3 size={17} color="#FFFFFF" />
                  <Text style={{ fontWeight: '800', fontSize: 14, color: '#FFFFFF' }}>
                    {t('expense_edit_btn') || 'Edit Expense'}
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

