import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronRight,
  CreditCard,
  Edit2,
  History,
  Landmark,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react-native';
import { AccountManageModal, ACCOUNT_TYPES } from '@/components/account/AccountManageModal';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { countryFlag } from '@/constants/countries';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { useTransfers } from '@/hooks/useTransfers';
import {
  computeAccountBalances,
  listBankAccounts,
  seedDefaultAccounts,
} from '@/services/bankAccounts';
import { BankAccount, Transfer } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { convertCurrency, formatMoney } from '@/utils/format';

export default function AccountsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { profile, session } = useAuth();
  const { rates, status: rateStatus } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();

  const userId = profile?.id ?? session?.user?.id;
  const preferredCurrency = profile?.preferred_currency || 'NPR';

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<BankAccount | null>(null);

  // Transfers move money between accounts — they affect live balances and get
  // their own recent-activity section below the account list.
  const { transfers, remove: removeTransfer, refresh: refreshTransfers } = useTransfers(userId);
  const [transferToDelete, setTransferToDelete] = useState<Transfer | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState(false);

  // Load all expenses to compute live balance accurately
  const expenses = useExpenses(userId, { fetchAll: true });

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      let list = await listBankAccounts(userId);
      if (list.length === 0) {
        list = await seedDefaultAccounts(userId, preferredCurrency);
      }
      setAccounts(list);
    } catch (err) {
      console.warn('Error loading bank accounts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, preferredCurrency]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await expenses.refresh(true);
    await refreshTransfers();
    await loadData();
  };

  // Compute live balance for each account using all transactions. Async because
  // each transaction is converted into the account's currency (INR/NPR mix).
  const [accountsWithLiveBalances, setAccountsWithLiveBalances] = useState<
    (BankAccount & { live_balance: number })[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    // Paint initial balances immediately so the list never flashes the empty
    // state while the (async) currency conversions resolve.
    setAccountsWithLiveBalances((current) =>
      current.length === 0 && accounts.length > 0
        ? accounts.map((a) => ({ ...a, live_balance: Number(a.initial_balance || 0) }))
        : current,
    );
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

  // Total Net Liquid Worth (converted from each account's currency to preferredCurrency)
  const totalNetLiquidWorth = accountsWithLiveBalances.reduce((sum, acc) => {
    const accCurrency = acc.currency || preferredCurrency;
    const converted = convertCurrency(acc.live_balance, accCurrency, preferredCurrency, rates);
    return sum + converted;
  }, 0);

  const handleOpenAdd = () => {
    setAccountToEdit(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (acc: BankAccount) => {
    setAccountToEdit(acc);
    setModalVisible(true);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings' as any);
    }
  };

  const handleDeleteTransfer = async () => {
    if (!transferToDelete) return;
    setDeletingTransfer(true);
    try {
      await removeTransfer(transferToDelete.id);
      setTransferToDelete(null);
    } catch (err) {
      showToast({
        message: getErrorMessage(err, t('common_error')),
        type: 'error',
      });
    } finally {
      setDeletingTransfer(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ── 1. HEADER ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 14,
          paddingBottom: 14,
          paddingHorizontal: 16,
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
            Accounts & Wallets
          </Text>
          <Text variant="caption" muted style={{ fontSize: 10.5, lineHeight: 13 }}>
            {accounts.length} active {accounts.length === 1 ? 'account' : 'accounts'}
          </Text>
        </View>

        {/* Actions live in the Quick Actions row below the balance card */}
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 10, gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* ── 2. NET WORTH / TOTAL BALANCE CARD ── */}
        <Card
          style={{
            gap: 1,
            padding: 10,
            backgroundColor: theme.colors.surface,
            borderColor: theme.isDark ? 'rgba(16, 185, 129, 0.35)' : theme.colors.border,
            borderWidth: 1.5,
            borderRadius: 16,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Wallet size={14} color={theme.colors.primary} />
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
                TOTAL LIQUID BALANCE
              </Text>
            </View>
            <PrivacyEyeButton size={32} iconSize={19} />
          </View>

          <Text
            variant="h1"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontSize: 21,
              lineHeight: 25,
              fontWeight: '900',
              color: totalNetLiquidWorth >= 0 ? theme.colors.text : theme.colors.danger,
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.5,
              includeFontPadding: false,
              marginVertical: 0,
            }}
          >
            {formatMoney(totalNetLiquidWorth, preferredCurrency)}
          </Text>

          <Text variant="caption" muted style={{ fontSize: 11, marginTop: 1 }}>
            Across all connected banks, digital wallets, and cash reserves.
          </Text>
          {rateStatus === 'estimated' ? (
            <Text variant="caption" style={{ fontSize: 10, marginTop: 4, color: theme.colors.textMuted, fontStyle: 'italic' }}>
              ⚠ {t('rates_estimated_notice') || 'Offline rates in use — figures are estimates, not live market rates.'}
            </Text>
          ) : null}
        </Card>

        {/* ── 2b. QUICK ACTIONS: Add Account · New Transfer · Transfer History ── */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          {(
            [
              { icon: Plus, label: t('transfer_add_account'), onPress: handleOpenAdd },
              { icon: ArrowLeftRight, label: t('transfer_new'), onPress: () => router.push('/transfer' as any) },
              { icon: History, label: t('transfer_history'), onPress: () => router.push('/transfer-history' as any) },
            ] as const
          ).map((action) => {
            const Icon = action.icon;
            return (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.surface,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  paddingVertical: 14,
                  paddingHorizontal: 4,
                  alignItems: 'center',
                  gap: 8,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: `${theme.colors.primary}18`,
                    borderWidth: 1,
                    borderColor: `${theme.colors.primary}30`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={17} color={theme.colors.primary} />
                </View>
                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '800', color: theme.colors.text }}>
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── 3. LIST OF ACCOUNTS ── */}
        <View style={{ gap: 10, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
              Your Accounts & Wallets
            </Text>
            <Text variant="caption" muted style={{ fontSize: 12 }}>
              Tap any to edit
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.primary} />
          ) : accountsWithLiveBalances.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No Bank Accounts Found"
              message="Create a bank account or cash wallet to organize transactions."
              actionLabel="Add Bank Account"
              onAction={handleOpenAdd}
            />
          ) : (
            accountsWithLiveBalances.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => handleOpenEdit(item)}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: item.is_default
                    ? `${theme.colors.primary}60`
                    : theme.colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                {/* Left: Icon & Names */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      backgroundColor: `${item.color || theme.colors.primary}18`,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: `${item.color || theme.colors.primary}30`,
                    }}
                  >
                    <CategoryIcon name={item.icon} size={22} color={item.color || theme.colors.primary} />
                  </View>

                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text
                        variant="label"
                        numberOfLines={1}
                        style={{ fontWeight: '800', fontSize: 15, color: theme.colors.text }}
                      >
                        {countryFlag(item.country, item.currency)} {item.name}
                      </Text>
                      {item.is_default ? (
                        <View
                          style={{
                            backgroundColor: `${theme.colors.primary}20`,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: theme.radius.full,
                            borderWidth: 1,
                            borderColor: `${theme.colors.primary}40`,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9.5,
                              fontWeight: '800',
                              color: theme.colors.primary,
                            }}
                          >
                            ⭐ DEFAULT
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: item.color || theme.colors.primary }}>
                        {ACCOUNT_TYPES.find((a) => a.type === item.account_type)?.label || item.account_type}
                      </Text>
                      {item.account_number_last4 ? (
                        <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>
                          •••• {item.account_number_last4}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Right: Live Balance & Edit Icon */}
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '900',
                      color: item.live_balance >= 0 ? theme.colors.income : theme.colors.danger,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {formatMoney(item.live_balance, item.currency || preferredCurrency)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text variant="caption" muted style={{ fontSize: 10 }}>
                      Initial: {formatMoney(item.initial_balance, item.currency || preferredCurrency)}
                    </Text>
                    <ChevronRight size={14} color={theme.colors.textMuted} />
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>
        {/* ── 4. RECENT TRANSFERS ── */}
        {transfers.length > 0 ? (
          <View style={{ gap: 8, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
                {t('transfer_recent')}
              </Text>
              <Pressable onPress={() => router.push('/transfer-history' as any)} hitSlop={6}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.primary }}>
                  {t('transfer_see_all')}
                </Text>
              </Pressable>
            </View>

            {transfers.slice(0, 5).map((tr) => {
              const crossCurrency = tr.from_currency !== tr.to_currency;
              const fromName = tr.from_account?.name ?? '—';
              const toName = tr.to_account?.name ?? '—';
              const dateLabel = new Date(tr.date).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              });
              return (
                <View
                  key={tr.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: theme.colors.surface,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      backgroundColor: `${tr.from_account?.color || theme.colors.primary}18`,
                      borderWidth: 1,
                      borderColor: `${tr.from_account?.color || theme.colors.primary}30`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowLeftRight size={15} color={tr.from_account?.color || theme.colors.primary} />
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: theme.colors.text }}>
                      {countryFlag(tr.from_account?.country, tr.from_currency)} {fromName}
                      {' → '}
                      {countryFlag(tr.to_account?.country, tr.to_currency)} {toName}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10.5 }}>
                      {formatMoney(tr.amount, tr.from_currency)}
                      {' → '}
                      {formatMoney(tr.converted_amount, tr.to_currency)}
                      {crossCurrency
                        ? ` · 1 ${tr.from_currency} = ${Number(tr.exchange_rate).toFixed(4)} ${tr.to_currency}`
                        : ''}
                      {` · ${dateLabel}`}
                    </Text>
                  </View>

                  <Pressable onPress={() => setTransferToDelete(tr)} hitSlop={8}>
                    <Trash2 size={15} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      {/* Account Management Modal (Add / Edit / Delete) */}
      <AccountManageModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSaved={loadData}
        accountToEdit={accountToEdit}
      />

      {/* Delete Transfer Confirmation */}
      <ConfirmDialog
        visible={!!transferToDelete}
        title={t('transfer_delete_title')}
        message={t('transfer_delete_message')}
        confirmLabel={t('common_delete')}
        loading={deletingTransfer}
        onCancel={() => setTransferToDelete(null)}
        onConfirm={handleDeleteTransfer}
      />
    </View>
  );
}
