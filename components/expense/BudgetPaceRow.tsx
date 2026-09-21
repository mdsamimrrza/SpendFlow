import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/format';

interface BudgetPaceRowProps {
  actual: number;
  expected: number;
  currency: string;
  onTrack: boolean;
  /** Stored budget currency — when it differs from the display currency we
   * flag it, since the converted figure often surprises (e.g. a budget
   * saved as USD rendered in NPR). */
  budgetCurrency?: string | null;
}

/**
 * Shared "Budget vs actual" pace card: clearly labeled Spent (big, colored)
 * vs Expected-by-now (muted) figures plus a progress bar and status pill —
 * so the two numbers can never be confused.
 */
export function BudgetPaceRow({ actual, expected, currency, onTrack, budgetCurrency }: BudgetPaceRowProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { isDark } = theme;
  const storedCcy = (budgetCurrency || '').toUpperCase();
  const showCcyNote = storedCcy !== '' && storedCcy !== currency.toUpperCase();

  const good = isDark ? '#34D399' : '#0F5C4D';
  const bad = isDark ? '#F87171' : '#A5442B';
  const statusColor = onTrack ? good : bad;
  const barColor = onTrack ? theme.colors.income : theme.colors.danger;
  const ratio = expected > 0 ? Math.min(actual / expected, 1) : 0;

  return (
    <View
      style={[
        styles.box,
        { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <Text variant="caption" muted style={styles.title}>
          {t('digest_budget_actual')}
        </Text>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: onTrack ? (isDark ? 'rgba(52, 211, 153, 0.18)' : '#DCE9E3') : (isDark ? 'rgba(239, 68, 68, 0.18)' : '#F1DCD3') },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {onTrack ? t('digest_on_track') : t('digest_off_track')}
          </Text>
        </View>
      </View>

      <View style={styles.amounts}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="caption" muted style={styles.label}>
            {t('pace_spent')}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.actual, { color: barColor }]}
          >
            {formatMoney(actual, currency)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 1 }}>
          <Text variant="caption" muted style={styles.label}>
            {t('pace_expected')}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.expected, { color: theme.colors.textMuted }]}
          >
            {formatMoney(expected, currency)}
          </Text>
        </View>
      </View>

      <View style={[styles.bar, { backgroundColor: isDark ? 'rgba(127, 140, 160, 0.25)' : theme.colors.surface }]}>
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: barColor }]} />
      </View>

      {showCcyNote && (
        <Text variant="caption" muted style={styles.ccyNote}>
          {t('pace_budget_in')} · {storedCcy}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    gap: 7,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  amounts: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  label: {
    fontWeight: '600',
    fontSize: 11,
  },
  actual: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  expected: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  bar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  ccyNote: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default BudgetPaceRow;
