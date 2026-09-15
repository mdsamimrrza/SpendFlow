import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Repeat, Trash2, RotateCcw } from 'lucide-react-native';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import {
  binDaysLeft,
  deleteBinItemForever,
  drainBinReceiptOrphans,
  emptyBin,
  listBinItems,
  restoreBinItem,
} from '@/services/bin';
import { getErrorMessage } from '@/utils/errors';
import { formatMoney } from '@/utils/format';
import { BinItem } from '@/types';

/** Countdown badge: calm near 60 days, warning under a week, urgent near purge. */
function daysLeftTone(theme: ReturnType<typeof useTheme>, days: number) {
  if (days <= 7) return theme.colors.danger;
  if (days <= 21) return theme.isDark ? '#FBBF24' : '#B45309';
  return theme.colors.income;
}

function itemTitle(item: BinItem, fallback: string): string {
  const entity = item.kind === 'expense' ? item.expense : item.rule;
  return (
    entity.description?.trim() ||
    entity.categories?.name?.trim() ||
    fallback
  );
}

export default function BinScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuth();
  const userId = profile?.id ?? session?.user?.id;

  const [items, setItems] = useState<BinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<BinItem | null>(null);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [emptying, setEmptying] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setItems(await listBinItems(userId));
    } catch (err) {
      showToast({ type: 'error', message: getErrorMessage(err, 'Could not load the Bin') });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    // Cron purges un-root receipt files SQL-side; claim + remove them best-effort.
    void drainBinReceiptOrphans(userId);
  }, [load, userId]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleRestore(item: BinItem) {
    if (!userId || workingId) return;
    setWorkingId(item.id);
    try {
      await restoreBinItem(userId, item);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      showToast({ type: 'success', message: t('bin_restored') });
    } catch (err) {
      showToast({ type: 'error', message: getErrorMessage(err, 'Could not restore this item') });
    } finally {
      setWorkingId(null);
    }
  }

  async function confirmPurge() {
    if (!userId || !purgeTarget) return;
    setWorkingId(purgeTarget.id);
    try {
      await deleteBinItemForever(userId, purgeTarget);
      setItems((current) => current.filter((entry) => entry.id !== purgeTarget.id));
      showToast({ type: 'success', message: t('bin_purged') });
    } catch (err) {
      showToast({ type: 'error', message: getErrorMessage(err, 'Could not delete this item') });
    } finally {
      setWorkingId(null);
      setPurgeTarget(null);
    }
  }

  async function confirmEmptyBin() {
    if (!userId) return;
    setEmptying(true);
    try {
      await emptyBin(userId);
      setItems([]);
      showToast({ type: 'success', message: t('bin_emptied') });
    } catch (err) {
      showToast({ type: 'error', message: getErrorMessage(err, 'Could not empty the Bin') });
      await load();
    } finally {
      setEmptying(false);
      setEmptyConfirmOpen(false);
    }
  }

  const renderItem = ({ item }: { item: BinItem }) => {
    const days = binDaysLeft(item.deleted_at);
    const tone = daysLeftTone(theme, days);
    const entity = item.kind === 'expense' ? item.expense : item.rule;
    const iconColor = entity.categories?.color ?? theme.colors.primary;
    const busy = workingId === item.id;

    return (
      <Pressable
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: 18,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: theme.isDark ? 0.3 : 0.06,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Pressable
          onPress={() => void handleRestore(item)}
          disabled={busy}
          hitSlop={4}
          style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.isDark ? `${iconColor}26` : `${iconColor}1A`,
            opacity: busy ? 0.5 : 1,
          }}
        >
          {item.kind === 'expense' ? (
            <CategoryIcon name={entity.categories?.icon} size={20} color={iconColor} />
          ) : (
            <Repeat size={20} color={iconColor} />
          )}
        </Pressable>

        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '700', color: theme.colors.text }}>
            {itemTitle(item, item.kind === 'expense' ? t('bin_item_expense') : t('bin_item_recurring'))}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.textMuted, fontVariant: ['tabular-nums'] }}
            >
              {formatMoney(Number(entity.amount), entity.currency)}
              {item.kind === 'expense' && item.expense.type === 'income' ? ` · ${t('bin_type_income')}` : ''}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 7,
                paddingVertical: 2.5,
                borderRadius: 8,
                backgroundColor: `${tone}1F`,
              }}
            >
              <Trash2 size={10} color={tone} />
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: tone }}>
                {t('bin_days_left').replace('{days}', String(days))}
              </Text>
            </View>
          </View>
        </View>

        {busy ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              onPress={() => void handleRestore(item)}
              hitSlop={10}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 10,
                backgroundColor: theme.isDark ? 'rgba(129, 140, 248, 0.12)' : 'rgba(15, 92, 77, 0.08)',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <RotateCcw size={13} color={theme.colors.primary} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.primary }}>
                {t('bin_restore')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPurgeTarget(item)}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.isDark ? 'rgba(248, 113, 113, 0.12)' : 'rgba(180, 83, 9, 0.08)',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Trash2 size={15} color={theme.colors.danger} />
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ── HEADER ── */}
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
          onPress={() => router.back()}
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
            {t('bin_title')}
          </Text>
          {items.length > 0 && (
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: theme.colors.textMuted }}>
              {t('bin_item_count').replace('{count}', String(items.length))}
            </Text>
          )}
        </View>

        <Pressable
          onPress={() => setEmptyConfirmOpen(true)}
          disabled={items.length === 0}
          hitSlop={6}
          style={({ pressed }) => ({
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
            opacity: items.length === 0 ? 0.35 : pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.danger }}>
            {t('bin_empty_bin')}
          </Text>
        </Pressable>
      </View>

      {/* ── RETENTION NOTICE ── */}
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 12,
          padding: 12,
          borderRadius: 14,
          backgroundColor: theme.isDark ? 'rgba(251, 191, 36, 0.08)' : 'rgba(180, 83, 9, 0.06)',
          borderWidth: 1,
          borderColor: theme.isDark ? 'rgba(251, 191, 36, 0.22)' : 'rgba(180, 83, 9, 0.18)',
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text, lineHeight: 17 }}>
          {t('bin_subtitle')}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: Math.max(insets.bottom, 16) + 36 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={theme.colors.textMuted}
              colors={[theme.colors.textMuted]}
            />
          }
          ListEmptyComponent={
            <View style={{ paddingTop: 24 }}>
              <EmptyState
                icon={Trash2}
                title={t('bin_empty_title')}
                message={t('bin_empty_message')}
              />
            </View>
          }
        />
      )}

      <ConfirmDialog
        visible={purgeTarget !== null}
        title={t('bin_purge_title')}
        message={t('bin_purge_message')}
        confirmLabel={t('bin_delete_forever')}
        loading={workingId !== null && purgeTarget?.id === workingId}
        onCancel={() => setPurgeTarget(null)}
        onConfirm={() => void confirmPurge()}
      />

      <ConfirmDialog
        visible={emptyConfirmOpen}
        title={t('bin_empty_bin')}
        message={t('bin_empty_confirm_message')}
        confirmLabel={t('bin_empty_bin')}
        loading={emptying}
        onCancel={() => setEmptyConfirmOpen(false)}
        onConfirm={() => void confirmEmptyBin()}
      />
    </View>
  );
}
