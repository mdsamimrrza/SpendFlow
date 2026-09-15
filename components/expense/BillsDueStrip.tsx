import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import { showToast } from '@/components/ui/Toast';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { notifyExpensesChanged } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import {
  listRecurringRules,
  listRuleOccurrences,
  markOccurrencePaid,
  RuleOccurrence,
} from '@/services/recurring';
import { RecurringRule } from '@/types';
import { formatMoney, isoDate } from '@/utils/format';

const MAX_ROWS = 3;

/**
 * "Bills due" strip (docs/recurring-plan.md §5): pay_on_due rules whose slot
 * is open render here with a one-tap Mark Paid. Auto_charge rules only appear
 * transiently (they book themselves on the next launch), which is exactly the
 * right behavior — the strip shows money the user still owes, not history.
 */
export function BillsDueStrip() {
  const { profile, session } = useAuth();
  const userId = profile?.id ?? session?.user?.id;
  const { t } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  const [due, setDue] = useState<{ rule: RecurringRule; overdueDays: number }[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setDue([]);
      return;
    }
    try {
      const rules = await listRecurringRules(userId);
      const open = rules.filter((r) => r.is_active && r.next_due_date <= isoDate());
      if (open.length === 0) {
        setDue([]);
        return;
      }
      const booked = await listRuleOccurrences(
        userId,
        open.map((r) => r.id),
      );
      const isBooked = (rule: RecurringRule) =>
        booked.some((o: RuleOccurrence) => o.recurring_rule_id === rule.id && o.recurring_due_date === rule.next_due_date);
      const today = parseDay(isoDate());
      setDue(
        open
          .filter((r) => !isBooked(r))
          .map((rule) => ({ rule, overdueDays: Math.max(0, dayDiff(today, parseDay(rule.next_due_date))) }))
          .sort((a, b) => a.rule.next_due_date.localeCompare(b.rule.next_due_date)),
      );
    } catch {
      // The strip is decorative urgency — a failed poll never blocks the dashboard.
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePaid(rule: RecurringRule) {
    if (!userId) return;
    setBusyId(rule.id);
    try {
      await markOccurrencePaid(userId, rule.id);
      notifyExpensesChanged();
      showToast({ message: t('recurring_marked_paid') || 'Payment recorded', type: 'success' });
      await load();
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : t('common_error'),
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  if (due.length === 0) return null;

  const visible = due.slice(0, MAX_ROWS);
  const extra = due.length - visible.length;
  const hasOverdue = due.some((d) => d.overdueDays > 0);

  return (
    <View
      style={{
        borderRadius: 22,
        backgroundColor: theme.colors.surface,
        borderWidth: 1.5,
        borderColor: hasOverdue ? (theme.isDark ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.35)') : theme.colors.border,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <AlertCircle size={15} color={hasOverdue ? '#EF4444' : theme.colors.primary} />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '900',
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              color: hasOverdue ? (theme.isDark ? '#F87171' : '#DC2626') : theme.colors.primary,
            }}
          >
            {`${t('recurring_bills_due') || 'Bills due'} · ${due.length}`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/recurring')}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
            {t('home_view_all') || 'View all'}
          </Text>
          <ArrowRight size={13} color={theme.colors.primary} />
        </Pressable>
      </View>

      {visible.map(({ rule, overdueDays }, idx) => (
        <View
          key={rule.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 11,
            borderTopWidth: idx === 0 ? 0 : 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <Text style={{ fontSize: 18 }}>{rule.categories?.icon || '💳'}</Text>
          <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '800', color: theme.colors.text }}>
              {rule.description || rule.categories?.name || 'Subscription'}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: overdueDays > 0 ? (theme.isDark ? '#F87171' : '#DC2626') : theme.colors.textMuted,
              }}
            >
              {overdueDays > 0
                ? `${t('recurring_overdue') || 'Overdue'} ${overdueDays}d · ${formatMoney(Number(rule.amount), rule.currency || preferredCurrency)}`
                : `${t('recurring_due_today') || 'Due today'} · ${formatMoney(Number(rule.amount), rule.currency || preferredCurrency)}`}
            </Text>
          </View>
          <PressableScale
            activeScale={0.92}
            onPress={() => void handlePaid(rule)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.radius.full,
              backgroundColor: busyId === rule.id ? theme.colors.textMuted : theme.colors.income,
              opacity: busyId === rule.id ? 0.6 : 1,
            }}
          >
            <CheckCircle2 size={13} color="#FFFFFF" />
            <Text style={{ fontSize: 11.5, fontWeight: '900', color: '#FFFFFF' }}>
              {t('recurring_mark_paid') || 'Mark Paid'}
            </Text>
          </PressableScale>
        </View>
      ))}

      {extra > 0 ? (
        <Pressable
          onPress={() => router.push('/recurring')}
          style={{
            paddingVertical: 9,
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.colors.primary }}>
            {`+${extra} ${t('recurring_more_due') || 'more due'} →`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Tiny local date helpers — the strip must not pull date-fns into the
// dashboard bundle just for day math.
function parseDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function dayDiff(a: number, b: number): number {
  return Math.round(a - b);
}
