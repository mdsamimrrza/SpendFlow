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
  ChevronRight,
  CreditCard,
  Edit2,
  Landmark,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react-native';
import { AccountManageModal, ACCOUNT_TYPES } from '@/components/account/AccountManageModal';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import {
  computeAccountBalances,
  listBankAccounts,
  seedDefaultAccounts,
} from '@/services/bankAccounts';
import { BankAccount } from '@/types';
import { formatMoney } from '@/utils/format';

export default function AccountsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { profile, session } = useAuth();
  const { rates } = useExchangeRates();
  const { t } = useLanguage();
  const { isPrivacyMode } = usePrivacy();

  const userId = profile?.id ?? session?.user?.id;
  const preferredCurrency = profile?.preferred_currency || 'NPR';

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<BankAccount | null>(null);

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
    await loadData();
  };

  // Compute live balance for each account using all transactions
  const accountsWithLiveBalances = computeAccountBalances(accounts, expenses.items);

  // Total Net Liquid Worth
  const totalNetLiquidWorth = accountsWithLiveBalances.reduce((sum, acc) => sum + acc.live_balance, 0);

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

        <Pressable
          onPress={handleOpenAdd}
          hitSlop={10}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary,
          }}
        >
          <Plus size={14} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' }}>Add</Text>
        </Pressable>
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
            <PrivacyEyeButton size={26} iconSize={16} />
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
        </Card>

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
                        {item.name}
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
                      color: item.live_balance >= 0 ? '#10B981' : theme.colors.danger,
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
      </ScrollView>

      {/* Account Management Modal (Add / Edit / Delete) */}
      <AccountManageModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSaved={loadData}
        accountToEdit={accountToEdit}
      />
    </View>
  );
}
