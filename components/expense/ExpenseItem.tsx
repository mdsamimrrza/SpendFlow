import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Alert } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Expense } from '@/types';
import { formatMoney, formatTime12 } from '@/utils/format';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui/Text';

import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';

export function ExpenseItem({ expense, onDelete }: { expense: Expense; onDelete?: (expense: Expense) => void }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { convert } = useExchangeRates();

  const preferredCurrency = profile?.preferred_currency ?? 'NPR';
  const isDifferentCurrency = expense.currency && expense.currency !== preferredCurrency;
  const convertedAmount = isDifferentCurrency
    ? convert(Number(expense.amount), expense.currency, preferredCurrency)
    : Number(expense.amount);

  return (
    <Link href={`/expense/${expense.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        style={{
          minHeight: 76,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.full,
            backgroundColor: expense.categories?.color ?? theme.colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text>{expense.categories?.icon ?? '📌'}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>
            {expense.description || expense.categories?.name || 'Expense'}
          </Text>
          <Text variant="caption" muted>
            {expense.date} {expense.time ? `· 🕒 ${formatTime12(expense.time)}` : ''} · {expense.payment_method}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="label" style={{ fontVariant: ['tabular-nums'], fontSize: 16, fontWeight: '800', color: theme.colors.text }}>
            {formatMoney(convertedAmount, preferredCurrency)}
          </Text>
          {isDifferentCurrency ? (
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

        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete expense"
            onPress={() => {
              Alert.alert('Delete expense?', 'This expense will be removed from your history.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                    onDelete(expense);
                  },
                },
              ]);
            }}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Trash2 size={18} color={theme.colors.danger} />
          </Pressable>
        ) : null}
      </Pressable>
    </Link>
  );
}
