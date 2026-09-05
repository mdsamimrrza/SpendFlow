import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpDown,
  Calendar,
  Check,
  ReceiptText,
  Search,
  Trash2,
  X,
} from 'lucide-react-native';
import { CalendarModal, DateRange } from '@/components/ui/CalendarModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { countryFlag } from '@/constants/countries';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTransfers } from '@/hooks/useTransfers';
import { useTheme } from '@/hooks/useTheme';
import { Transfer } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { formatMoney, isoDate } from '@/utils/format';

const PAGE_SIZE = 50;

type TransferSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
type TransferPeriod = 'all' | 'month' | '3m' | 'year' | 'custom';

/** Earliest date (YYYY-MM-DD) whose transfers stay visible for the period, null = all time. */
function periodCutoff(period: TransferPeriod): string | null {
  const now = new Date();
  if (period === 'month') return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  if (period === '3m') return isoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  if (period === 'year') return `${now.getFullYear()}-01-01`;
  return null;
}

export default function TransferHistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { profile, session } = useAuth();
  const { t } = useLanguage();

  const userId = profile?.id ?? session?.user?.id;
  const { transfers, loading, remove, refresh } = useTransfers(userId);

  const [refreshing, setRefreshing] = useState(false);
  const [toDelete, setToDelete] = useState<Transfer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Search / filter / sort / pagination state
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<TransferPeriod>('all');
  const [sort, setSort] = useState<TransferSort>('date_desc');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const anyPopoverOpen = periodOpen || sortOpen;
  const closeAllPopovers = () => {
    setPeriodOpen(false);
    setSortOpen(false);
  };

  // New filter inputs always start from a fresh first page.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, period, sort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = periodCutoff(period);
    const list = transfers.filter((item) => {
      if (cutoff && item.date < cutoff) return false;
      if (period === 'custom' && customRange?.startDate && customRange.endDate) {
        if (item.date < customRange.startDate || item.date > customRange.endDate) return false;
      }
      if (!q) return true;
      return [
        item.from_account?.name,
        item.to_account?.name,
        item.notes,
        item.from_currency,
        item.to_currency,
        String(item.amount),
        String(item.converted_amount),
      ].some((field) => (field ?? '').toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'date_asc':
          return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        case 'amount_desc':
          return b.amount - a.amount;
        case 'amount_asc':
          return a.amount - b.amount;
        default:
          return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      }
    });
  }, [transfers, search, period, sort, customRange]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visible.length < filtered.length;

  const loadMore = () => {
    if (hasMore) setVisibleCount((current) => current + PAGE_SIZE);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await remove(toDelete.id);
      setToDelete(null);
    } catch (err) {
      showToast({
        message: getErrorMessage(err, t('common_error')),
        type: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/accounts' as any);
    }
  };

  const customLabel =
    customRange?.startDate && customRange.endDate
      ? `${new Date(customRange.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(
          customRange.endDate,
        ).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
      : t('transfer_period_custom');

  const periodOptions: { label: string; value: TransferPeriod }[] = [
    { label: t('transfer_period_all'), value: 'all' },
    { label: t('transfer_period_month'), value: 'month' },
    { label: t('transfer_period_3m'), value: '3m' },
    { label: t('transfer_period_year'), value: 'year' },
    { label: customLabel, value: 'custom' },
  ];

  const sortOptions: { label: string; value: TransferSort }[] = [
    { label: t('transfer_sort_newest'), value: 'date_desc' },
    { label: t('transfer_sort_oldest'), value: 'date_asc' },
    { label: t('transfer_sort_high'), value: 'amount_desc' },
    { label: t('transfer_sort_low'), value: 'amount_asc' },
  ];

  const iconBtnStyle = {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const renderPopoverOption = (
    option: { label: string; value: string },
    isSelected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={option.value}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 9,
        backgroundColor: isSelected
          ? theme.isDark
            ? 'rgba(99, 102, 241, 0.15)'
            : 'rgba(79, 70, 229, 0.08)'
          : 'transparent',
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: isSelected ? '800' : '600',
          color: isSelected ? theme.colors.primary : theme.colors.text,
        }}
      >
        {option.label}
      </Text>
      {isSelected && <Check size={14} color={theme.colors.primary} />}
    </Pressable>
  );

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
            {t('transfer_history')}
          </Text>
          <Text variant="caption" muted style={{ fontSize: 10.5, lineHeight: 13 }}>
            {filtered.length} {filtered.length === 1 ? 'transfer' : 'transfers'}
          </Text>
        </View>

        <View style={{ width: 32 }} />
      </View>

      {/* ── SEARCH + FILTER TOOLBAR ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, zIndex: 50 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: search ? theme.colors.primary : theme.colors.border,
              borderRadius: 12,
              paddingHorizontal: 10,
            }}
          >
            <Search size={15} color={theme.colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('transfer_search')}
              placeholderTextColor={theme.colors.textMuted}
              style={{ flex: 1, height: 40, fontSize: 13, fontWeight: '600', color: theme.colors.text }}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={6}>
                <X size={14} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => {
              setPeriodOpen((o) => !o);
              setSortOpen(false);
            }}
            style={[iconBtnStyle, periodOpen ? { borderColor: theme.colors.primary } : null]}
          >
            <Calendar
              size={16}
              color={period !== 'all' || periodOpen ? theme.colors.primary : theme.colors.textMuted}
            />
          </Pressable>

          <Pressable
            onPress={() => {
              setSortOpen((o) => !o);
              setPeriodOpen(false);
            }}
            style={[iconBtnStyle, sortOpen ? { borderColor: theme.colors.primary } : null]}
          >
            <ArrowUpDown
              size={16}
              color={sort !== 'date_desc' || sortOpen ? theme.colors.primary : theme.colors.textMuted}
            />
          </Pressable>

          {/* Period Popover (in-place, below the calendar icon) */}
          {periodOpen ? (
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 50,
                right: 48,
                width: 190,
                backgroundColor: theme.colors.surface,
                borderRadius: 16,
                borderWidth: 1.2,
                borderColor: theme.colors.border,
                padding: 6,
                gap: 2,
                elevation: 25,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.25,
                shadowRadius: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: theme.colors.textMuted,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                {t('transfer_filter_period')}
              </Text>
              {periodOptions.map((option) =>
                renderPopoverOption(option, period === option.value, () => {
                  setPeriod(option.value as TransferPeriod);
                  if (option.value === 'custom') {
                    // Keep the popover open under the calendar; applying a range closes both.
                    setCalendarOpen(true);
                  } else {
                    setPeriodOpen(false);
                  }
                }),
              )}
            </Pressable>
          ) : null}

          {/* Sort Popover (in-place, below the sort icon) */}
          {sortOpen ? (
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 50,
                right: 0,
                width: 200,
                backgroundColor: theme.colors.surface,
                borderRadius: 16,
                borderWidth: 1.2,
                borderColor: theme.colors.border,
                padding: 6,
                gap: 2,
                elevation: 25,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.25,
                shadowRadius: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: theme.colors.textMuted,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                {t('transfer_filter_sort')}
              </Text>
              {sortOptions.map((option) =>
                renderPopoverOption(option, sort === option.value, () => {
                  setSort(option.value as TransferSort);
                  setSortOpen(false);
                }),
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── LIST (scrim sits above it to dismiss popovers on outside tap) ── */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 28 }}
            scrollEnabled={!anyPopoverOpen}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon={ReceiptText}
                title={t('transfer_history')}
                message={t('transfer_history_empty')}
              />
            }
            ListFooterComponent={
              filtered.length > 0 ? (
                <View style={{ alignItems: 'center', gap: 8, paddingTop: 10 }}>
                  {hasMore ? (
                    <Pressable
                      onPress={loadMore}
                      style={{
                        paddingHorizontal: 18,
                        paddingVertical: 9,
                        borderRadius: theme.radius.full,
                        backgroundColor: theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.primary }}>
                        {t('transfer_load_more')}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text variant="caption" muted style={{ fontSize: 11 }}>
                    {t('transfer_showing')} {visible.length} / {filtered.length}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const crossCurrency = item.from_currency !== item.to_currency;
              const fromFlag = countryFlag(item.from_account?.country, item.from_currency);
              const toFlag = countryFlag(item.to_account?.country, item.to_currency);
              const fromName = item.from_account?.name ?? '—';
              const toName = item.to_account?.name ?? '—';
              const dateLabel = new Date(item.date).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });
              return (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: theme.colors.surface,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      backgroundColor: `${item.from_account?.color || theme.colors.primary}18`,
                      borderWidth: 1,
                      borderColor: `${item.from_account?.color || theme.colors.primary}30`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowLeftRight size={17} color={item.from_account?.color || theme.colors.primary} />
                  </View>

                  <View style={{ flex: 1, gap: 3 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '800', color: theme.colors.text }}>
                      {fromFlag} {fromName} → {toFlag} {toName}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.text }}>
                      {formatMoney(item.amount, item.from_currency)}
                      <Text style={{ color: theme.colors.textMuted }}>{'  →  '}</Text>
                      {formatMoney(item.converted_amount, item.to_currency)}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10.5 }}>
                      {crossCurrency
                        ? `1 ${item.from_currency} = ${Number(item.exchange_rate).toFixed(4)} ${item.to_currency} · `
                        : ''}
                      {dateLabel}
                      {item.fee > 0 ? ` · ${t('transfer_fee_optional')}: ${formatMoney(item.fee, item.from_currency)}` : ''}
                    </Text>
                    {item.notes ? (
                      <Text variant="caption" muted numberOfLines={2} style={{ fontSize: 10.5, fontStyle: 'italic' }}>
                        {item.notes}
                      </Text>
                    ) : null}
                  </View>

                  <Pressable onPress={() => setToDelete(item)} hitSlop={8}>
                    <Trash2 size={16} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        {/* Universal tap-outside dismissal for the floating popovers */}
        {anyPopoverOpen ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeAllPopovers}
          />
        ) : null}
      </View>

      {/* ── CUSTOM DATE RANGE CALENDAR ── */}
      <CalendarModal
        visible={calendarOpen}
        onClose={() => {
          setCalendarOpen(false);
          setPeriodOpen(false);
        }}
        onApply={(range) => {
          setCustomRange(range);
          setPeriod('custom');
          setCalendarOpen(false);
          setPeriodOpen(false);
        }}
        initialRange={customRange ?? undefined}
      />

      <ConfirmDialog
        visible={!!toDelete}
        title={t('transfer_delete_title')}
        message={t('transfer_delete_message')}
        confirmLabel={t('common_delete')}
        loading={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </View>
  );
}
