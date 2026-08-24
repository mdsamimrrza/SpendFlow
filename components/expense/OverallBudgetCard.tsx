import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { AlertCircle, CheckCircle2, Edit3, Target, X } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useTheme } from '@/hooks/useTheme';
import { updateProfile } from '@/services/auth';
import { Expense } from '@/types';
import { formatMoney } from '@/utils/format';

interface OverallBudgetCardProps {
  expenses: Expense[];
  targetCurrency?: string;
}

export function OverallBudgetCard({ expenses, targetCurrency }: OverallBudgetCardProps) {
  const theme = useTheme();
  const { profile, refreshProfile } = useAuth();
  const { convert } = useExchangeRates();
  const [modalVisible, setModalVisible] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);

  const currency = targetCurrency ?? profile?.preferred_currency ?? 'NPR';
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Calculate total spending in current month in target currency
  const totalMonthlySpend = expenses
    .filter((e) => e.date.startsWith(currentMonth))
    .reduce((sum, e) => sum + convert(Number(e.amount), e.currency || 'NPR', currency), 0);

  const monthlyBudget = profile?.monthly_budget ? Number(profile.monthly_budget) : 0;
  const isBudgetSet = monthlyBudget > 0;

  const ratio = isBudgetSet ? totalMonthlySpend / monthlyBudget : 0;
  const isOverBudget = isBudgetSet && totalMonthlySpend > monthlyBudget;
  const isNearingLimit = isBudgetSet && !isOverBudget && ratio >= 0.8;
  const remaining = isBudgetSet ? monthlyBudget - totalMonthlySpend : 0;

  const progressColor = isOverBudget
    ? theme.colors.danger
    : isNearingLimit
    ? '#F59E0B'
    : theme.colors.success;

  function openEditModal() {
    setBudgetInput(monthlyBudget > 0 ? String(monthlyBudget) : '');
    setModalVisible(true);
  }

  async function handleSaveBudget() {
    const val = budgetInput.trim();
    const numeric = val ? Number(val) : null;
    if (val && (isNaN(Number(val)) || Number(val) < 0)) {
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ monthly_budget: numeric });
      await refreshProfile();
      setModalVisible(false);
    } catch {
      // Handled gracefully in auth service
      setModalVisible(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Target size={20} color={theme.colors.primary} />
            <Text variant="h3">Monthly Budget Target</Text>
          </View>
          <Pressable
            onPress={openEditModal}
            hitSlop={8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.surfaceElevated,
            }}
          >
            <Edit3 size={14} color={theme.colors.primary} />
            <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '600' }}>
              {isBudgetSet ? 'Change' : 'Set Budget'}
            </Text>
          </Pressable>
        </View>

        {!isBudgetSet ? (
          <View
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceElevated,
              gap: theme.spacing.xs,
              alignItems: 'center',
            }}
          >
            <Text style={{ textAlign: 'center', color: theme.colors.textMuted }}>
              No overall monthly budget set yet. Set a budget to track whether you stay under your spending limit!
            </Text>
            <Button title="⚡ Set Monthly Budget" onPress={openEditModal} style={{ marginTop: theme.spacing.xs }} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text variant="caption" muted>
                  Spent this month
                </Text>
                <Text variant="h2" style={{ color: progressColor }}>
                  {formatMoney(totalMonthlySpend, currency)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="caption" muted>
                  Target Limit
                </Text>
                <Text variant="h3">{formatMoney(monthlyBudget, currency)}</Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={{ height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: theme.colors.surfaceElevated }}>
              <View
                style={{
                  width: `${Math.min(ratio * 100, 100)}%`,
                  height: '100%',
                  backgroundColor: progressColor,
                  borderRadius: 5,
                }}
              />
            </View>

            {/* Status Footer */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isOverBudget ? (
                  <AlertCircle size={15} color={theme.colors.danger} />
                ) : (
                  <CheckCircle2 size={15} color={progressColor} />
                )}
                <Text
                  variant="caption"
                  style={{
                    color: progressColor,
                    fontWeight: '600',
                  }}
                >
                  {isOverBudget
                    ? `Over budget by ${formatMoney(Math.abs(remaining), currency)}!`
                    : `${formatMoney(remaining, currency)} remaining`}
                </Text>
              </View>

              <Text variant="caption" muted>
                {Math.round(ratio * 100)}% used
              </Text>
            </View>
          </View>
        )}
      </Card>

      {/* Edit Monthly Budget Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: theme.spacing.lg }}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.xl,
              gap: theme.spacing.lg,
            }}
            onPress={(e) => e.stopPropagation()}
          >

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="h2">Set Monthly Budget</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                <X size={20} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <Text muted>
              Enter the maximum target spending limit for this month ({currency}):
            </Text>

            <Input
              label={`Monthly Budget Limit (${currency})`}
              placeholder="e.g. 50000"
              keyboardType="numeric"
              value={budgetInput}
              onChangeText={setBudgetInput}
              autoFocus
            />

            <View style={{ flexDirection: 'row', gap: theme.spacing.md, justifyContent: 'flex-end' }}>
              <Button title="Cancel" variant="secondary" onPress={() => setModalVisible(false)} />
              <Button title="Save Budget" loading={saving} onPress={handleSaveBudget} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
