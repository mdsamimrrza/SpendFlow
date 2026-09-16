"use client";

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react-native';
import { Pressable, View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

export interface TodayRateLineProps {
  frozen: { income: number; expense: number };
  today: { income: number; expense: number } | null;
  fmt: (n: number) => string;
  style?: ViewStyle;
}

/**
 * "At today's rate" second view (brokerage cost-basis/market-value pattern):
 * period totals stay HEADLINE-FROZEN at each day's rate (QuickBooks/Xero behavior);
 * this optional card shows what the SAME money is worth at today's live cross.
 * Collapsible: starts CLOSED — tap the header to reveal the two figures,
 * tap again to fold it back. Hides itself entirely when the two bases agree
 * (nothing to explain) or while today's rates are unresolved.
 * Callers pass masked formatters so privacy mode applies like every other figure.
 */
export function TodayRateLine({ frozen, today, fmt, style }: TodayRateLineProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (!today) return null;
  const drift = Math.abs(frozen.income - today.income) + Math.abs(frozen.expense - today.expense);
  if (drift < 0.01) return null;

  return (
    <View style={[styles.container, { borderColor: theme.colors.border }, style]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header as ViewStyle}
      >
        <Text style={styles.headerText as TextStyle}>{t('curAtTodayRate')}</Text>
        <ChevronDown
          size={14}
          color={theme.colors.textMuted}
          style={[
            styles.chevron as ViewStyle,
            open ? (styles.chevronOpen as ViewStyle) : null,
          ]}
        />
      </Pressable>
      {open && (
        <View style={styles.content as ViewStyle}>
          <View style={styles.row as ViewStyle}>
            <View style={styles.rowLeft as ViewStyle}>
              <View style={[styles.dot as ViewStyle, { backgroundColor: theme.colors.income }]} />
              <Text style={styles.rowLabel as TextStyle}>{t('pl_income')}</Text>
            </View>
            <Text style={[styles.rowValue as TextStyle, { color: theme.colors.income }]}>{fmt(today.income)}</Text>
          </View>
          <View style={styles.row as ViewStyle}>
            <View style={styles.rowLeft as ViewStyle}>
              <View style={[styles.dot as ViewStyle, { backgroundColor: theme.colors.danger }]} />
              <Text style={styles.rowLabel as TextStyle}>{t('pl_expense')}</Text>
            </View>
            <Text style={[styles.rowValue as TextStyle, { color: theme.colors.danger }]}>{fmt(today.expense)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.02)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  headerText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: '#64748B',
  },
  chevron: {},
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  rowValue: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});