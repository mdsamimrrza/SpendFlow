import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { CategoryIcon, EMOJI_TO_ICON_MAP, SELECTABLE_ICONS } from '@/components/ui/CategoryIcon';
import { Text } from '@/components/ui/Text';
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

const BANK_PRESETS = [
  { name: 'HDFC Bank', type: 'bank' as AccountType, icon: 'landmark', color: '#1E3A8A' },
  { name: 'State Bank of India', type: 'bank' as AccountType, icon: 'landmark', color: '#0284C7' },
  { name: 'ICICI Bank', type: 'bank' as AccountType, icon: 'landmark', color: '#DC2626' },
  { name: 'Axis Bank', type: 'bank' as AccountType, icon: 'landmark', color: '#991B1B' },
  { name: 'Nabil Bank', type: 'bank' as AccountType, icon: 'landmark', color: '#047857' },
  { name: 'NIC Asia Bank', type: 'bank' as AccountType, icon: 'landmark', color: '#B91C1C' },
  { name: 'Global IME', type: 'bank' as AccountType, icon: 'landmark', color: '#1D4ED8' },
  { name: 'eSewa Wallet', type: 'wallet' as AccountType, icon: 'smartphone', color: '#16A34A' },
  { name: 'Khalti Wallet', type: 'wallet' as AccountType, icon: 'smartphone', color: '#7C3AED' },
  { name: 'Google Pay / UPI', type: 'wallet' as AccountType, icon: 'smartphone', color: '#2563EB' },
  { name: 'Paytm Wallet', type: 'wallet' as AccountType, icon: 'smartphone', color: '#0284C7' },
  { name: 'Physical Cash', type: 'cash' as AccountType, icon: 'banknote', color: '#10B981' },
];

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } else {
      setName('');
      setAccountType('bank');
      setInitialBalance('0');
      setLast4('');
      setColor('#3B82F6');
      setIcon('landmark');
      setIsDefault(false);
    }
    setError(null);
  }, [accountToEdit, visible]);

  const handleApplyPreset = (preset: typeof BANK_PRESETS[0]) => {
    setName(preset.name);
    setAccountType(preset.type);
    setIcon(preset.icon);
    setColor(preset.color);
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
        currency: profile?.preferred_currency || 'NPR',
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            maxHeight: '92%',
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingBottom: 24,
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
                {accountToEdit ? 'Edit Account' : `Add ${currentTypeConfig.label}`}
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

            {/* Quick Bank Presets (When creating new account) */}
            {!accountToEdit && (
              <View style={{ gap: 8 }}>
                <Text variant="label" style={{ fontWeight: '700', fontSize: 12, color: theme.colors.textMuted }}>
                  ⚡ Quick Presets
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {BANK_PRESETS.map((p) => (
                    <Pressable
                      key={p.name}
                      onPress={() => handleApplyPreset(p)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        backgroundColor: theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: name === p.name ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <CategoryIcon name={p.icon} size={14} color={p.color} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

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
                  Starting Balance ({profile?.preferred_currency || 'NPR'})
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



            {/* Custom Icon Picker */}
            <View style={{ gap: 8 }}>
              <Text variant="label" style={{ fontWeight: '700', fontSize: 13 }}>
                Select Icon
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SELECTABLE_ICONS.map((item) => {
                  const isSel = icon === item.name;
                  return (
                    <Pressable
                      key={item.name}
                      onPress={() => setIcon(item.name)}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: isSel ? color : theme.colors.surfaceElevated,
                        borderWidth: isSel ? 2 : 1,
                        borderColor: isSel ? color : theme.colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: isSel ? color : 'transparent',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isSel ? 0.35 : 0,
                        shadowRadius: 4,
                        elevation: isSel ? 2 : 0,
                      }}
                    >
                      <CategoryIcon
                        name={item.name}
                        size={20}
                        color={isSel ? '#FFFFFF' : theme.colors.text}
                      />
                    </Pressable>
                  );
                })}
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
        </View>
      </View>
    </Modal>
  );
}
