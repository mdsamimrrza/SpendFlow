import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Wallet,
  X,
} from 'lucide-react-native';
import { AccountManageModal } from '@/components/account/AccountManageModal';
import { Button } from '@/components/ui/Button';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { countryFlag } from '@/constants/countries';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { useTransfers } from '@/hooks/useTransfers';
import { useTheme } from '@/hooks/useTheme';
import { computeAccountBalances, listBankAccounts, seedDefaultAccounts } from '@/services/bankAccounts';
import { getRate } from '@/services/exchange';
import { BankAccount } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { formatMoney, isoDate } from '@/utils/format';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export default function TransferScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { profile, session } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const userId = profile?.id ?? session?.user?.id;

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [rawAmount, setRawAmount] = useState('');
  const [rawFee, setRawFee] = useState('');
  const [notes, setNotes] = useState('');
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<{
    available: number;
    required: number;
    currency: string;
  } | null>(null);
  const [preview, setPreview] = useState<{ converted: number; rate: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  // Live balances need every transaction plus transfers (the same trio the
  // Accounts screen uses), so the guard reflects real post-transfer availability.
  const expenses = useExpenses(userId, { fetchAll: true });
  const { transfers, save } = useTransfers(userId);

  const loadAccounts = useCallback(async () => {
    if (!userId) {
      setLoadingAccounts(false);
      return;
    }
    try {
      let list = await listBankAccounts(userId);
      if (list.length === 0) {
        list = await seedDefaultAccounts(userId, profile?.preferred_currency || 'NPR');
      }
      setAccounts(list);
    } catch (err) {
      console.warn('Error loading bank accounts for transfer:', err);
    } finally {
      setLoadingAccounts(false);
    }
  }, [userId, profile?.preferred_currency]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const [accountsWithLiveBalances, setAccountsWithLiveBalances] = useState<
    (BankAccount & { live_balance: number })[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    computeAccountBalances(accounts, expenses.items, transfers)
      .then((next) => {
        if (!cancelled) setAccountsWithLiveBalances(next);
      })
      .catch(() => {
        // Keep the last successfully computed balances on failure
      });
    return () => {
      cancelled = true;
    };
  }, [accounts, expenses.items, transfers]);

  const liveBalanceOf = useCallback(
    (id: string | null) => {
      if (!id) return 0;
      const entry = accountsWithLiveBalances.find((a) => a.id === id);
      if (entry) return entry.live_balance;
      return Number(accounts.find((a) => a.id === id)?.initial_balance ?? 0);
    },
    [accountsWithLiveBalances, accounts],
  );

  const fromAccount = accounts.find((a) => a.id === fromId) ?? null;
  const toAccount = accounts.find((a) => a.id === toId) ?? null;
  const accFlag = (acc: BankAccount | null) => (acc ? countryFlag(acc.country, acc.currency) : '🌐');
  const fromCurrency = (fromAccount?.currency || 'NPR').toUpperCase();
  const toCurrency = (toAccount?.currency || 'NPR').toUpperCase();
  const sameCurrency = Boolean(fromAccount && toAccount) && fromCurrency === toCurrency;

  const amountNum = Number(rawAmount) || 0;

  // Live conversion preview: same authoritative rate pipeline the saved transfer
  // will lock (DB cache → exchangerate.host → pegs/fallbacks), debounced while typing.
  useEffect(() => {
    setError(null);
    setInsufficient(null);
    if (!fromAccount || !toAccount || amountNum <= 0) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    if (fromCurrency === toCurrency) {
      setPreview({ converted: round2(amountNum), rate: 1 });
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const date = isoDate();
        const [fromUsdPerUnit, toUsdPerUnit] = await Promise.all([
          getRate(fromCurrency, date),
          getRate(toCurrency, date),
        ]);
        if (cancelled) return;
        const rate = round8(fromUsdPerUnit / toUsdPerUnit);
        setPreview({ converted: round2(amountNum * rate), rate });
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAccount?.id, toAccount?.id, rawAmount, fromCurrency, toCurrency]);

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
    setRawAmount(normalized);
  };

  const handleAddQuickAmount = (inc: number) => {
    const base = Number(rawAmount) || 0;
    setRawAmount(String(round2(base + inc)));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const closeAllDropdowns = () => {
    if (fromOpen) setFromOpen(false);
    if (toOpen) setToOpen(false);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/accounts' as any);
    }
  };

  const submit = async () => {
    if (saving) return;
    setError(null);
    setInsufficient(null);
    if (!fromAccount || !toAccount) {
      setError(t('transfer_err_accounts'));
      return;
    }
    if (amountNum <= 0) {
      setError(t('transfer_err_amount'));
      return;
    }
    if (fromAccount.id === toAccount.id) {
      setError(t('transfer_err_same'));
      return;
    }
    const fee = Number(rawFee) || 0;
    const available = liveBalanceOf(fromAccount.id);
    const required = round2(amountNum + (fee > 0 ? fee : 0));
    if (required > available) {
      setInsufficient({ available, required, currency: fromCurrency });
      setError(t('transfer_err_insufficient'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      const created = await save({
        from_account_id: fromAccount.id,
        to_account_id: toAccount.id,
        amount: amountNum,
        date: isoDate(),
        time: null,
        notes: notes.trim() || null,
        fee: fee > 0 ? fee : undefined,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({
        message: `${t('transfer_done')}: ${formatMoney(created.amount, created.from_currency)} → ${formatMoney(
          created.converted_amount,
          created.to_currency,
        )}`,
      });
      router.back();
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(getErrorMessage(err, t('common_error')));
    } finally {
      setSaving(false);
    }
  };

  const renderPicker = (
    labelText: string,
    options: BankAccount[],
    selectedId: string | null,
    which: 'from' | 'to',
    onSelect: (id: string) => void,
  ) => {
    const isOpen = which === 'from' ? fromOpen : toOpen;
    const setOpen = (open: boolean) => {
      // Opening one picker always closes the other, mirroring ExpenseForm's toolbar.
      if (which === 'from') {
        setFromOpen(open);
        setToOpen(false);
      } else {
        setToOpen(open);
        setFromOpen(false);
      }
    };
    const selected = accounts.find((a) => a.id === selectedId) ?? null;
    const liveBalance = liveBalanceOf(selectedId);
    return (
      <View>
        <Text variant="label" style={{ fontWeight: '800', fontSize: 12.5, marginBottom: 6, color: theme.colors.textMuted }}>
          {labelText}
        </Text>

        {/* Trigger Box */}
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setOpen(!isOpen);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 12,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceElevated,
            borderWidth: 1.5,
            borderColor: isOpen ? theme.colors.primary : theme.colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {selected ? (
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: `${selected.color || theme.colors.primary}18`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: `${selected.color || theme.colors.primary}30`,
                }}
              >
                <CategoryIcon name={selected.icon} size={18} color={selected.color || theme.colors.primary} />
              </View>
            ) : (
              <Wallet size={18} color={theme.colors.textMuted} />
            )}
            <View style={{ gap: 2, flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: theme.colors.text }}>
                {selected ? `${accFlag(selected)} ${selected.name}` : t('transfer_select_account')}
              </Text>
              {selected ? (
                <Text
                  variant="caption"
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: liveBalance >= 0 ? theme.colors.income : theme.colors.danger,
                  }}
                >
                  {t('transfer_available')}: {formatMoney(liveBalance, selected.currency)}
                </Text>
              ) : (
                <Text variant="caption" muted style={{ fontSize: 11 }}>
                  {t('transfer_select_hint')}
                </Text>
              )}
            </View>
          </View>

          <ChevronDown
            size={18}
            color={theme.colors.textMuted}
            style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
          />
        </Pressable>

        {/* Expanded Options */}
        {isOpen && (
          <View
            style={{
              gap: 4,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.md,
              borderWidth: 1.2,
              borderColor: theme.colors.border,
              padding: 6,
              marginTop: 2,
              elevation: 25,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
            }}
          >
            <ScrollView nestedScrollEnabled style={{ maxHeight: 230 }}>
              {options.length === 0 ? (
                <Text variant="caption" muted style={{ fontSize: 12, padding: 10 }}>
                  {t('transfer_need_two_accounts')}
                </Text>
              ) : (
                options.map((acc) => {
                  const isSelected = selectedId === acc.id;
                  const accLive = liveBalanceOf(acc.id);
                  return (
                    <Pressable
                      key={acc.id}
                      onPress={() => {
                        onSelect(acc.id);
                        setOpen(false);
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: theme.radius.sm,
                        backgroundColor: isSelected
                          ? theme.isDark
                            ? 'rgba(99, 102, 241, 0.18)'
                            : 'rgba(79, 70, 229, 0.08)'
                          : 'transparent',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <CategoryIcon name={acc.icon} size={18} color={acc.color || theme.colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{ fontSize: 13.5, fontWeight: isSelected ? '800' : '600', color: theme.colors.text }}
                          >
                            {countryFlag(acc.country, acc.currency)} {acc.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 10.5,
                              fontWeight: '700',
                              color: accLive >= 0 ? theme.colors.income : theme.colors.danger,
                            }}
                          >
                            {acc.currency} · {t('transfer_available')}: {formatMoney(accLive, acc.currency)}
                          </Text>
                        </View>
                      </View>
                      {isSelected && <Check size={16} color={theme.colors.primary} />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const fromOptions = useMemo(
    () => accounts.filter((a) => a.id !== toId),
    [accounts, toId],
  );
  const toOptions = useMemo(
    () => accounts.filter((a) => a.id !== fromId),
    [accounts, fromId],
  );

  const canTransfer = accounts.length >= 2;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 36}
    >
      <View style={{ flex: 1 }}>
        {/* ── HEADER ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Pressable
            onPress={handleBack}
            hitSlop={10}
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
            <ArrowLeft size={16} color={theme.colors.text} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text variant="h3" style={{ fontWeight: '800', fontSize: 17.5, lineHeight: 22 }}>
              {t('transfer_title')}
            </Text>
            <Text variant="caption" muted style={{ fontSize: 10.5, lineHeight: 13 }}>
              {fromAccount && toAccount
                ? `${accFlag(fromAccount)} ${fromCurrency} → ${accFlag(toAccount)} ${toCurrency}`
                : t('transfer_select_hint')}
            </Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            gap: 18,
            paddingBottom: insets.bottom + 36,
          }}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={closeAllDropdowns}
        >
          {loadingAccounts ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />
          ) : !canTransfer ? (
            <EmptyState
              icon={ArrowLeftRight}
              title={t('transfer_title')}
              message={t('transfer_need_two_accounts')}
              actionLabel={t('transfer_add_account')}
              onAction={() => setAccountModalOpen(true)}
            />
          ) : (
            <>
              {/* ── FROM / TO ACCOUNT PICKERS ── */}
              {renderPicker(t('transfer_from'), fromOptions, fromId, 'from', setFromId)}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: -8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: `${theme.colors.primary}18`,
                    borderWidth: 1,
                    borderColor: `${theme.colors.primary}35`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ArrowDown size={15} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
              </View>

              {renderPicker(t('transfer_to'), toOptions, toId, 'to', setToId)}

              {/* ── AMOUNT ── */}
              <View>
                <Text
                  variant="label"
                  style={{ fontWeight: '800', fontSize: 12.5, marginBottom: 6, color: theme.colors.textMuted }}
                >
                  {t('transfer_amount')} {fromAccount ? `(${fromCurrency})` : ''}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 10,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1.5,
                    borderColor: theme.colors.border,
                  }}
                >
                  {fromAccount ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: theme.radius.full,
                        backgroundColor: `${theme.colors.primary}18`,
                        borderWidth: 1,
                        borderColor: `${theme.colors.primary}30`,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '900', color: theme.colors.primary }}>
                        {fromCurrency}
                      </Text>
                    </View>
                  ) : null}
                  <TextInput
                    placeholder="0.00"
                    placeholderTextColor={theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}
                    keyboardType="numeric"
                    value={rawAmount}
                    onChangeText={handleAmountChange}
                    style={{
                      fontSize: 32,
                      lineHeight: 38,
                      paddingTop: 2,
                      fontWeight: '900',
                      color: theme.colors.text,
                      paddingVertical: 0,
                      minWidth: 100,
                      textAlign: 'center',
                      includeFontPadding: false,
                    }}
                  />
                  {rawAmount ? (
                    <Pressable
                      onPress={() => setRawAmount('')}
                      hitSlop={8}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: 2,
                      }}
                    >
                      <X size={14} color={theme.colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  {[100, 500, 1000, 5000].map((inc) => (
                    <Pressable
                      key={inc}
                      onPress={() => handleAddQuickAmount(inc)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: theme.radius.full,
                        backgroundColor: theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                        +{inc}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* ── CONVERSION PREVIEW ── */}
              <View
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1.5,
                  borderColor: fromAccount && toAccount && amountNum > 0
                    ? `${theme.colors.primary}45`
                    : theme.colors.border,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ArrowLeftRight size={13} color={theme.colors.primary} />
                  <Text
                    variant="caption"
                    style={{
                      color: theme.colors.primary,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                      fontWeight: '700',
                      fontSize: 10.5,
                    }}
                  >
                    {t('transfer_receive')}
                  </Text>
                </View>

                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{
                    fontSize: 24,
                    lineHeight: 30,
                    fontWeight: '900',
                    color: theme.colors.text,
                    fontVariant: ['tabular-nums'],
                    includeFontPadding: false,
                  }}
                >
                  {previewLoading ? (
                    '…'
                  ) : preview ? (
                    formatMoney(preview.converted, toCurrency)
                  ) : (
                    '—'
                  )}
                </Text>

                <Text variant="caption" muted style={{ fontSize: 11 }}>
                  {previewLoading
                    ? t('transfer_rate_loading')
                    : preview
                    ? sameCurrency
                      ? t('transfer_same_currency')
                      : `1 ${fromCurrency} = ${preview.rate.toFixed(4)} ${toCurrency} · ${t('transfer_rate_hint')}`
                    : fromAccount && toAccount
                    ? t('transfer_err_amount')
                    : t('transfer_err_accounts')}
                </Text>
              </View>

              {/* ── FEE & NOTE ── */}
              <View style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.textMuted }}>
                    {t('transfer_fee_optional')}
                  </Text>
                  <TextInput
                    placeholder="0.00"
                    placeholderTextColor={theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}
                    keyboardType="numeric"
                    value={rawFee}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9.]/g, '');
                      const parts = cleaned.split('.');
                      setRawFee(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned);
                    }}
                    style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text, paddingVertical: 8 }}
                  />
                  {fromAccount ? (
                    <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.textMuted }}>
                      {fromCurrency}
                    </Text>
                  ) : null}
                </View>

                <TextInput
                  placeholder={t('transfer_note_optional')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  style={{
                    fontSize: 13.5,
                    color: theme.colors.text,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    minHeight: 44,
                    textAlignVertical: 'top',
                  }}
                />
              </View>

              {/* ── INSUFFICIENT BALANCE BANNER ── */}
              {insufficient ? (
                <View
                  style={{
                    padding: 12,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.08)',
                    borderWidth: 1,
                    borderColor: `${theme.colors.danger}50`,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.danger }}>
                    {t('transfer_insufficient_title')}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption" muted style={{ fontSize: 12 }}>
                      {t('transfer_available')}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                      {formatMoney(insufficient.available, insufficient.currency)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption" muted style={{ fontSize: 12 }}>
                      {t('transfer_required')}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.danger }}>
                      {formatMoney(insufficient.required, insufficient.currency)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* ── ERROR BANNER ── */}
              {error ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    padding: 12,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.08)',
                    borderWidth: 1,
                    borderColor: `${theme.colors.danger}50`,
                  }}
                >
                  <AlertCircle size={16} color={theme.colors.danger} />
                  <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: theme.colors.danger }}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* ── SUBMIT ── */}
              <Button
                title={t('transfer_title')}
                loading={saving}
                onPress={submit}
                icon={ArrowLeftRight}
                style={{ height: 52 }}
              />
            </>
          )}
        </ScrollView>
      </View>

      <AccountManageModal
        visible={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        onSaved={loadAccounts}
        accountToEdit={null}
      />
    </KeyboardAvoidingView>
  );
}
