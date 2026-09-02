import React, { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Edit3, Trash2 } from 'lucide-react-native';
import { ExpenseDetailModal } from '@/components/expense/ExpenseDetailModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { Expense } from '@/types';
import { formatMoney, formatTime12 } from '@/utils/format';

interface ExpenseItemProps {
  expense: Expense;
  onDelete?: (expense: Expense) => void;
  onPress?: (expense: Expense) => void;
  /** Pre-converted amount in the preferred currency (historical-rate aware). */
  displayAmount?: number;
}

export function ExpenseItem({ expense, onDelete, onPress, displayAmount }: ExpenseItemProps) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { convert } = useExchangeRates();
  const { isPrivacyMode } = usePrivacy();
  const router = useRouter();

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipedRef = useRef(false);

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const isDifferentCurrency = expense.currency && expense.currency !== preferredCurrency;
  const convertedAmount =
    displayAmount ??
    (isDifferentCurrency
      ? convert(Number(expense.amount), expense.currency, preferredCurrency)
      : Number(expense.amount));

  // Swipe Left PanResponder Gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Trigger only on horizontal gestures
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 15;
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        // Allow swiping left (negative dx) up to -140px, or slightly right to close if already swiped
        const initial = isSwipedRef.current ? -120 : 0;
        const newX = Math.min(0, Math.max(-140, initial + gestureState.dx));
        translateX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -40 || (isSwipedRef.current && gestureState.dx < 30)) {
          // Snap open
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          isSwipedRef.current = true;
          Animated.spring(translateX, {
            toValue: -120,
            friction: 7,
            tension: 60,
            useNativeDriver: true,
          }).start();
        } else {
          // Snap closed
          isSwipedRef.current = false;
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            tension: 60,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  function closeSwipe() {
    isSwipedRef.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      friction: 7,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }

  function handleCardPress() {
    if (isSwipedRef.current) {
      closeSwipe();
    } else if (onPress) {
      onPress(expense);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setDetailModalOpen(true);
    }
  }

  function handleDeletePress() {
    closeSwipe();
    setDeleteConfirmOpen(true);
  }

  function handleEditPress() {
    closeSwipe();
    router.push(`/expense/${expense.id}` as any);
  }

  return (
    <>
      <View style={{ position: 'relative', overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        {/* ── BACKGROUND ACTION TRAY (Revealed on Swipe) ── */}
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 120,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          {/* Edit Button */}
          <Pressable
            onPress={handleEditPress}
            style={{
              width: 55,
              height: '100%',
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <Edit3 size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>Edit</Text>
          </Pressable>

          {/* Delete Button */}
          <Pressable
            onPress={handleDeletePress}
            style={{
              width: 65,
              height: '100%',
              backgroundColor: theme.colors.danger,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <Trash2 size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>Delete</Text>
          </Pressable>
        </View>

        {/* ── FOREGROUND SWIPEABLE ITEM CARD ── */}
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            transform: [{ translateX }],
            backgroundColor: theme.colors.background,
            width: '100%',
            zIndex: 1,
          }}
        >
          <Pressable
            onPress={handleCardPress}
            style={({ pressed }) => ({
              minHeight: 74,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: 4,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            {/* Category Icon Badge */}
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <CategoryIcon
                name={expense.categories?.icon}
                size={20}
                color={expense.type === 'income' ? theme.colors.income : theme.colors.primary}
              />
            </View>

            {/* Description & Metadata */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" numberOfLines={1} style={{ fontWeight: '700', fontSize: 14 }}>
                {expense.description || expense.categories?.name || (expense.type === 'income' ? 'Income' : 'Expense')}
              </Text>
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                {expense.date} {expense.time ? `· ${formatTime12(expense.time)}` : ''} · {expense.payment_method}
              </Text>
            </View>

            {/* Amount Display */}
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text
                variant="label"
                style={{
                  fontVariant: ['tabular-nums'],
                  fontSize: 16,
                  fontWeight: '900',
                  color: expense.type === 'income' ? theme.colors.income : theme.colors.text,
                }}
              >
                {expense.type === 'income' ? '+' : '-'} {formatMoney(convertedAmount, preferredCurrency)}
              </Text>
              {isDifferentCurrency ? (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: expense.type === 'income' ? theme.colors.income : theme.colors.textMuted,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  ({expense.type === 'income' ? '+' : '-'}{formatMoney(Number(expense.amount), expense.currency)})
                </Text>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      </View>

      {/* ── FULL EXPENSE DETAIL PREVIEW MODAL ── */}
      <ExpenseDetailModal
        expense={expense}
        visible={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onDelete={onDelete}
      />
      <ConfirmDialog
        visible={deleteConfirmOpen}
        title="Delete Expense?"
        message="This transaction will be permanently removed from your history."
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          onDelete?.(expense);
        }}
      />
    </>
  );
}
