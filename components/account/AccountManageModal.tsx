import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import {
  Banknote,
  Building,
  Check,
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  Shield,
  Smartphone,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { CategoryIcon, EMOJI_TO_ICON_MAP } from '@/components/ui/CategoryIcon';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { COUNTRIES, countryForCurrency, ENABLED_COUNTRY_CODES, OTHER_COUNTRY_CODE, WIZARD_COUNTRIES } from '@/constants/countries';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { createBankAccount, deleteBankAccount, updateBankAccount } from '@/services/bankAccounts';
import { AccountType, BankAccount, BankAccountInput } from '@/types';

export const ACCOUNT_TYPES: { type: AccountType; label: string; icon: string; defaultColor: string }[] = [
  { type: 'bank', label: 'Bank Account', icon: 'landmark', defaultColor: '#3B82F6' },
  { type: 'wallet', label: 'Digital Wallet', icon: 'smartphone', defaultColor: '#10B981' },
  { type: 'cash', label: 'Cash / Pocket', icon: 'banknote', defaultColor: '#F59E0B' },
  { type: 'credit_card', label: 'Credit Card', icon: 'credit-card', defaultColor: '#6366F1' },
  { type: 'savings', label: 'Savings Deposit', icon: 'piggy-bank', defaultColor: '#EC4899' },
  { type: 'investment', label: 'Investment', icon: 'trending-up', defaultColor: '#8B5CF6' },
  { type: 'other', label: 'Other', icon: 'tag', defaultColor: '#64748B' },
];

// Preset institutions per country now live in constants/countries.ts — the
// list below only holds the country-agnostic fallback (physical cash).
const CASH_PRESET = { name: 'Physical Cash', type: 'cash' as AccountType, icon: 'banknote', color: '#10B981' };

// Every preset name across the registry — used to detect stale preset names
// when the user switches country (manually typed names are never cleared).
const ALL_PRESET_NAMES = new Set(
  COUNTRIES.flatMap((c) => [...c.banks.map((b) => b.name), ...c.wallets.map((w) => w.name)]),
);

interface AccountManageModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  accountToEdit?: BankAccount | null;
}

export function AccountManageModal({
  visible,
  onClose,
  onSaved,
  accountToEdit,
}: AccountManageModalProps) {
  const theme = useTheme();
  const { profile, session } = useAuth();
  const { t } = useLanguage();
  const userId = profile?.id ?? session?.user?.id;

  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('bank');
  const [initialBalance, setInitialBalance] = useState('');
  const [last4, setLast4] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [icon, setIcon] = useState('landmark');
  const [isDefault, setIsDefault] = useState(false);
  // The country drives the bank/wallet dropdown AND the account currency;
  // it defaults from the profile's preferred currency (or the account being edited).
  const [countryCode, setCountryCode] = useState<string>(OTHER_COUNTRY_CODE);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCountry = COUNTRIES.find((c) => c.code === countryCode) ?? null;
  const activeCurrency = (activeCountry?.currency || profile?.preferred_currency || 'NPR').toUpperCase();

  useEffect(() => {
    setShowDeleteConfirm(false);
    if (accountToEdit) {
      setName(accountToEdit.name);
      setAccountType(accountToEdit.account_type);
      setInitialBalance(String(accountToEdit.initial_balance || 0));
      setLast4(accountToEdit.account_number_last4 || '');
      setColor(accountToEdit.color || '#3B82F6');
      const rawIcon = accountToEdit.icon || 'landmark';
      setIcon(EMOJI_TO_ICON_MAP[rawIcon] || rawIcon);
      setIsDefault(accountToEdit.is_default || false);
      setCountryCode(countryForCurrency(accountToEdit.currency)?.code ?? OTHER_COUNTRY_CODE);
    } else {
      setName('');
      setAccountType('bank');
      setInitialBalance('0');
      setLast4('');
      setColor('#3B82F6');
      setIcon('landmark');
      setIsDefault(false);
      // Start from the profile's country/currency so the preset list feels local.
      // Only preselect it when the country is currently offered in the wizard.
      const match = countryForCurrency(profile?.preferred_currency);
      setCountryCode(
        match && ENABLED_COUNTRY_CODES.includes(match.code) ? match.code : OTHER_COUNTRY_CODE,
      );
    }
    setError(null);
  }, [accountToEdit, visible, profile?.preferred_currency]);

  const handleApplyPreset = (presetName: string, presetColor: string, type: AccountType, icon: string) => {
    setName(presetName);
    setAccountType(type);
    setIcon(icon);
    setColor(presetColor);
  };

  // Institutions for the selected country, as dropdown options. The selection
  // is derived from the name field, so edit mode highlights the right bank
  // without extra state.
  const institutionChoices = useMemo(() => {
    const list: { key: string; label: string; name: string; color: string; type: AccountType; icon: string }[] = [];
    if (activeCountry) {
      activeCountry.banks.forEach((b) =>
        list.push({ key: `bank:${b.name}`, label: `🏦 ${b.name}`, name: b.name, color: b.color, type: 'bank', icon: 'landmark' }),
      );
      activeCountry.wallets.forEach((w) =>
        list.push({ key: `wallet:${w.name}`, label: `📱 ${w.name}`, name: w.name, color: w.color, type: 'wallet', icon: 'smartphone' }),
      );
    }
    list.push({
      key: 'cash',
      label: `💵 ${CASH_PRESET.name}`,
      name: CASH_PRESET.name,
      color: CASH_PRESET.color,
      type: CASH_PRESET.type,
      icon: CASH_PRESET.icon,
    });
    return list;
  }, [activeCountry]);

  const matchedInstitution = institutionChoices.find((c) => c.name === name.trim());
  // Non-empty name that matches no preset = the user's own custom account.
  const institutionValue = matchedInstitution?.key ?? (name.trim() ? 'custom' : '');

  const institutionOptions = [
    ...institutionChoices.map((c) => ({ label: c.label, value: c.key })),
    { label: t('account_custom'), value: 'custom' },
  ];

  const handleInstitutionChange = (key: string) => {
    // "Custom" keeps the name field as the source of truth — nothing to apply.
    if (key === 'custom') return;
    const choice = institutionChoices.find((c) => c.key === key);
    if (choice) handleApplyPreset(choice.name, choice.color, choice.type, choice.icon);
  };

  const countryOptions = [
    ...WIZARD_COUNTRIES.map((c) => ({ label: `${c.flag} ${c.name}`, value: c.code })),
    { label: `🌐 ${t('account_other_country')}`, value: OTHER_COUNTRY_CODE },
  ];

  const handleCountryChange = (code: string) => {
    setCountryCode(code);
    // If the name came from a previously chosen preset, clear it so it can't
    // mismatch the new country's institution list (typed names stay untouched).
    if (ALL_PRESET_NAMES.has(name.trim())) setName('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter an account name.');
      return;
    }
    if (!userId) {
      setError('User not authenticated.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const cleaned = initialBalance.replace(/[^0-9.]/g, '');
      const balanceNum = Math.max(0, parseFloat(cleaned) || 0);
      const payload: BankAccountInput = {
        name: name.trim(),
        account_type: accountType,
        currency: activeCurrency,
        country: countryCode === OTHER_COUNTRY_CODE ? null : countryCode,
        initial_balance: balanceNum,
        color,
        icon,
        account_number_last4: last4.trim() || null,
        is_default: isDefault,
      };

      if (accountToEdit) {
        await updateBankAccount(accountToEdit.id, userId, payload);
      } else {
        await createBankAccount(userId, payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!accountToEdit || !userId) return;

    setDeleting(true);
    setError(null);
    try {
      await deleteBankAccount(accountToEdit.id, userId);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not delete account.');
    } finally {
      setDeleting(false);
    }
  };

  const currentTypeConfig = ACCOUNT_TYPES.find((a) => a.type === accountType) || ACCOUNT_TYPES[0];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              maxHeight: '88%',
              backgroundColor: theme.colors.surface,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingBottom: 24,
              overflow: 'hidden',
              elevation: 28,
              shadowColor: '#000',
              shadowOpacity: 0.28,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
            }}
          >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: color,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: color,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 4,
                  elevation: 3,
                }}
              >
                <CategoryIcon name={icon} size={20} color="#FFFFFF" />
              </View>
              <Text variant="h3" style={{ fontWeight: '800' }}>
                {accountToEdit ? 'Edit Account' : t('transfer_add_account')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: theme.colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} showsVerticalScrollIndicator={false}>
            {error ? (
              <View
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                }}
              >
                <Text style={{ color: theme.colors.danger, fontSize: 13, fontWeight: '600' }}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* ── Country dropdown: drives the bank/wallet list AND the account currency ── */}
            <Select
              label={`🌍 ${t('account_country')}`}
              value={countryCode}
              options={countryOptions}
              onChange={handleCountryChange}
            />

            {/* ── Bank / Wallet dropdown for the chosen country ── */}
            <Select
              label={`🏦 ${t('account_choose_bank')}`}
              value={institutionValue}
              options={institutionOptions}
              onChange={handleInstitutionChange}
            />

            <Text variant="caption" muted style={{ fontSize: 11, marginTop: -10 }}>
              {t('account_currency_label')}: {activeCurrency}
            </Text>

            {/* Currency change warning (editing an existing account) */}
            {accountToEdit && (accountToEdit.currency || '').toUpperCase() !== activeCurrency ? (
              <View
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(245, 158, 11, 0.35)',
                  gap: 4,
                }}
              >
                <Text style={{ color: '#D97706', fontSize: 13, fontWeight: '800' }}>
                  {t('account_currency_change_title')}
                </Text>
                <Text style={{ color: theme.colors.text, fontSize: 12, lineHeight: 17 }}>
                  {t('account_currency_change_note')} {(accountToEdit.currency || '').toUpperCase()} → {activeCurrency}.
                </Text>
              </View>
            ) : null}

            {/* Account Name */}
            <View style={{ gap: 6 }}>
              <Text variant="label" style={{ fontWeight: '700', fontSize: 13 }}>
                Account Name *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. HDFC Bank, Nabil Bank, eSewa, Cash"
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  height: 48,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  fontSize: 15,
                  fontWeight: '600',
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              />
            </View>

            {/* Account Type Selector */}
            <View style={{ gap: 8 }}>
              <Text variant="label" style={{ fontWeight: '700', fontSize: 13 }}>
                Account Type
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {ACCOUNT_TYPES.map((tItem) => {
                  const selected = accountType === tItem.type;
                  return (
                    <Pressable
                      key={tItem.type}
                      onPress={() => {
                        setAccountType(tItem.type);
                        setIcon(tItem.icon);
                        setColor(tItem.defaultColor);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: theme.radius.full,
                        backgroundColor: selected ? (tItem.defaultColor || theme.colors.primary) : theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: selected ? (tItem.defaultColor || theme.colors.primary) : theme.colors.border,
                      }}
                    >
                      <CategoryIcon
                        name={tItem.icon}
                        size={15}
                        color={selected ? '#FFFFFF' : theme.colors.text}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: selected ? '800' : '600',
                          color: selected ? '#FFFFFF' : theme.colors.text,
                        }}
                      >
                        {tItem.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Initial Balance & Last 4 Digits */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="label" style={{ fontWeight: '700', fontSize: 13 }}>
                  Starting Balance ({activeCurrency})
                </Text>
                <TextInput
                  value={initialBalance}
                  onChangeText={(text) => setInitialBalance(text.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  keyboardType="numeric"
                  placeholderTextColor={theme.colors.textMuted}
                  style={{
                    height: 48,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    fontWeight: '700',
                    color: theme.colors.text,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                />
              </View>

              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="label" style={{ fontWeight: '700', fontSize: 13 }}>
                  Last 4 Digits (Optional)
                </Text>
                <TextInput
                  value={last4}
                  onChangeText={setLast4}
                  placeholder="e.g. 4092"
                  maxLength={4}
                  keyboardType="numeric"
                  placeholderTextColor={theme.colors.textMuted}
                  style={{
                    height: 48,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    fontWeight: '600',
                    color: theme.colors.text,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                />
              </View>
            </View>



            {/* Default Account Checkbox */}
            <Pressable
              onPress={() => setIsDefault(!isDefault)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                borderRadius: 14,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  backgroundColor: isDefault ? theme.colors.primary : 'transparent',
                  borderWidth: 1.5,
                  borderColor: isDefault ? theme.colors.primary : theme.colors.textMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isDefault ? <Check size={14} color="#FFFFFF" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                  Set as Default Account
                </Text>
                <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>
                  Pre-selected automatically on new expenses and income
                </Text>
              </View>
            </Pressable>

            {/* Save & Delete Action Buttons */}
            <View style={{ gap: 10, marginTop: 8 }}>
              {showDeleteConfirm ? (
                <View
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Trash2 size={18} color={theme.colors.danger} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.danger }}>
                      Delete "{accountToEdit?.name}"?
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>
                    Transactions linked to this account will remain safely intact with their amount and category.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <Pressable
                      onPress={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                        Cancel
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleConfirmDelete}
                      disabled={deleting}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: theme.colors.danger,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6,
                      }}
                    >
                      {deleting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Trash2 size={15} color="#FFFFFF" />
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                            Yes, Delete
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <Button
                    title={accountToEdit ? 'Save Changes' : `Create ${currentTypeConfig.label}`}
                    onPress={handleSave}
                    loading={saving}
                    disabled={saving || deleting}
                  />

                  {accountToEdit ? (
                    <Pressable
                      onPress={() => setShowDeleteConfirm(true)}
                      disabled={saving || deleting}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 12,
                        borderRadius: 14,
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        borderWidth: 1,
                        borderColor: 'rgba(239, 68, 68, 0.25)',
                      }}
                    >
                      <Trash2 size={16} color={theme.colors.danger} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.danger }}>
                        Delete This Account
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
