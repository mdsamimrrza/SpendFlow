import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, RefreshControl, ScrollView, ToastAndroid, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronLeft,
  FileSpreadsheet,
  FileText,
  Info,
  Printer,
  Share2,
  Sparkles,
  Upload,
  Wallet,
  X,
} from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { PERIODS } from '@/constants/app';
import { exportCsv, exportExcel, exportPdf } from '@/services/export';
import { importExpensesFromCsv } from '@/services/expenses';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useRateResolver } from '@/hooks/useRateResolver';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
import { useSecurity } from '@/hooks/useSecurity';
import { useTheme } from '@/hooks/useTheme';
import { PeriodKey } from '@/types';
import { filterExpensesByPeriod, formatMoney, sumExpenses } from '@/utils/format';

export default function ExportScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();
  const { rates } = useExchangeRates();
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // ── Inline status banner ──────────────────────────────────────────────────
  // Rendered INSIDE this screen's own view tree (not the shared ToastHost):
  // export is presented as a modal, so on Android the root host can sit in a
  // lower window and toasts go unseen. The banner drops in below the header
  // and auto-hides after a few seconds; tapping it dismisses early.
  const [banner, setBanner] = useState<{ tone: 'success' | 'info' | 'error'; message: string } | null>(null);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((tone: 'success' | 'info' | 'error', message: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    console.log(`[export:${tone}] ${message}`);
    setBanner({ tone, message });
    Animated.timing(bannerOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    bannerTimer.current = setTimeout(() => {
      Animated.timing(bannerOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setBanner(null);
      });
    }, 4000);
  }, [bannerOpacity]);

  // If a native step hangs (never resolves, never rejects) the try/finally
  // would never run and all three buttons would stay disabled forever with no
  // feedback — exactly the silent dead-end users reported. Race every export
  // against a deadline so the UI always reports SOMETHING and always unlocks.
  const withWatchdog = useCallback(<T,>(p: Promise<T>, label: string): Promise<T> => {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error(`${label} timed out — the system save dialog may still be open. Cancel it and try again.`)),
          30000,
        );
      }),
    ]);
  }, []);

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  // Native OS toast on Android: rendered by the system above every window
  // (modal screens included) — guaranteed even if the in-screen banner or the
  // shared ToastHost is layered out of view.
  const notify = useCallback((tone: 'success' | 'info' | 'error', message: string) => {
    showBanner(tone, message);
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
    }
  }, [showBanner]);

  useEffect(() => {
    console.log('[export] ExportCenter mounted — status banner build');
  }, []);

  // Statements must cover the complete selected period — the default server
  // page (20 rows) would silently truncate exports for larger histories.
  const expenses = useExpenses(profile?.id, { fetchAll: true });
  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  // Filter items by chosen period (month follows the user's salary cycle)
  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const cycleEndDay = profile?.cycle_end_day ?? null;
  const filteredItems = useMemo(
    () => filterExpensesByPeriod(expenses.items, period, cycleStartDay, cycleEndDay),
    [expenses.items, period, cycleStartDay, cycleEndDay],
  );

  // Snapshot-aware total: each row converts at its own date — statements
  // match History/Dashboard exactly instead of re-valuing at today's rate.
  // Shared snapshot-resolver hook (same source as the other money screens).
  const { resolver: rateResolver } = useRateResolver(filteredItems, preferredCurrency);

  const totalAmount = useMemo(
    () => sumExpenses(filteredItems, preferredCurrency, rateResolver),
    [filteredItems, preferredCurrency, rateResolver],
  );

  const periodLabel = PERIODS.find((p) => p.value === period)?.label || 'This Month';
  // The Download flow opens Android's SAF folder picker — a separate system
  // activity that fires background→active on return. Suppress the biometric
  // lock for the export, exactly like the camera/picker round-trip.
  const { beginSystemCapture, endSystemCapture } = useSecurity();

  // 1. PDF Export Handler
  async function handleExportPdf() {
    if (filteredItems.length === 0) {
      notify('error', 'No transactions in the selected period to generate a statement.');
      return;
    }
    setIsExporting('pdf');
    notify('info', 'Generating PDF statement…');
    beginSystemCapture();
    let result: 'saved' | 'shared' | null = null;
    try {
      result = await withWatchdog(exportPdf(filteredItems, profile, preferredCurrency), 'PDF export');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not generate PDF statement.');
    } finally {
      endSystemCapture();
      setIsExporting(null);
    }
    if (result === 'saved') {
      notify('success', 'PDF statement saved to your device.');
    } else if (result === 'shared') {
      notify('info', 'PDF ready — finish saving it in the share sheet.');
    }
  }

  // 2. Excel Export Handler
  async function handleExportExcel() {
    if (filteredItems.length === 0) {
      notify('error', 'No transactions in the selected period to export.');
      return;
    }
    setIsExporting('excel');
    notify('info', 'Generating Excel file…');
    beginSystemCapture();
    let result: 'saved' | 'shared' | null = null;
    try {
      result = await withWatchdog(exportExcel(filteredItems, preferredCurrency), 'Excel export');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not generate Excel spreadsheet.');
    } finally {
      endSystemCapture();
      setIsExporting(null);
    }
    if (result === 'saved') {
      notify('success', 'Excel spreadsheet saved to your device.');
    } else if (result === 'shared') {
      notify('info', 'Excel file ready — finish saving it in the share sheet.');
    }
  }

  // 3. CSV Export Handler
  async function handleExportCsv() {
    if (filteredItems.length === 0) {
      notify('error', 'No transactions in the selected period to export.');
      return;
    }
    setIsExporting('csv');
    notify('info', 'Generating CSV file…');
    beginSystemCapture();
    let result: 'saved' | 'shared' | null = null;
    try {
      result = await withWatchdog(exportCsv(filteredItems), 'CSV export');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not generate CSV file.');
    } finally {
      endSystemCapture();
      setIsExporting(null);
    }
    if (result === 'saved') {
      notify('success', 'CSV file saved to your device.');
    } else if (result === 'shared') {
      notify('info', 'CSV file ready — finish saving it in the share sheet.');
    }
  }

  // 4. Import CSV Handler
  async function handleImportCsv() {
    if (!profile?.id) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    try {
      const csv = await fetch(result.assets[0].uri).then((response) => response.text());
      // Bound the parsed payload before any processing — the row cap inside
      // importExpensesFromCsv only runs AFTER the whole file is in memory.
      if (csv.length > 2 * 1024 * 1024) {
        notify('error', 'The CSV file is too large (max ~2 MB / 1000 rows). Split the file and try again.');
        return;
      }
      const count = await importExpensesFromCsv(profile.id, csv);
      notify('success', `${count} transactions were successfully imported.`);
      await expenses.refresh(true);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Could not import CSV.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 60 }}
      refreshControl={
        <RefreshControl
          refreshing={expenses.refreshing}
          onRefresh={() => void expenses.refresh(true)}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* ── 1. MODAL HEADER ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
            Statements & Archives
          </Text>
          <Text variant="h1" style={{ fontWeight: '800' }}>
            Export Center
          </Text>
        </View>

        <Pressable
          onPress={() => router.replace('/settings')} hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <X size={18} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* ── 2. PERIOD SELECTOR PILLS ── */}
      <View style={{ gap: 8 }}>
        <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
          Select Statement Period
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {PERIODS.map((p) => {
            const isActive = period === p.value;
            return (
              <Pressable
                key={p.value}
                onPress={() => setPeriod(p.value)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: theme.radius.full,
                  backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: isActive ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? '800' : '600',
                    color: isActive ? '#FFFFFF' : theme.colors.textMuted,
                  }}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── 3. STATEMENT PREVIEW CARD ── */}
      <Card
        style={{
          padding: theme.spacing.lg,
          gap: 12,
          backgroundColor: theme.isDark ? '#111827' : theme.colors.cardHighlight,
          borderColor: theme.colors.primary,
          borderWidth: 1.5,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Wallet size={16} color={theme.colors.primary} />
            <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
              {periodLabel} Summary
            </Text>
          </View>
          <Text variant="caption" muted style={{ fontSize: 11 }}>
            {filteredItems.length} transactions included
          </Text>
        </View>

        <View>
          <Text variant="h1" style={{ fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {formatMoney(totalAmount, preferredCurrency)}
          </Text>
          <Text variant="caption" muted style={{ marginTop: 2 }}>
            Official SpendFlow Verified Record • {preferredCurrency}
          </Text>
        </View>
      </Card>

      {/* ── 4. EXPORT ACTION BUTTONS ── */}
      <View style={{ gap: 12 }}>
        <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
          Generate Statement Files
        </Text>

        {/* PDF Statement Button (Primary Highlight) */}
        <Pressable
          disabled={Boolean(isExporting)}
          onPress={handleExportPdf}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 16,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.primary,
            opacity: isExporting === 'pdf' ? 0.7 : pressed ? 0.9 : 1,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 6,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isExporting === 'pdf' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Printer size={22} color="#FFFFFF" />
              )}
            </View>

            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
                  PDF Statement
                </Text>
                <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 10 }}>RECOMMENDED</Text>
                </View>
              </View>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>
                Full ledger, category charts & official letterhead
              </Text>
            </View>
          </View>

          <ArrowDownToLine size={20} color="#FFFFFF" />
        </Pressable>

        {/* Excel XLSX Button */}
        <Pressable
          disabled={Boolean(isExporting)}
          onPress={handleExportExcel}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 16,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: isExporting === 'excel' ? 0.7 : pressed ? 0.8 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: theme.isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isExporting === 'excel' ? (
                <ActivityIndicator size="small" color={theme.colors.success} />
              ) : (
                <FileSpreadsheet size={22} color={theme.colors.success} />
              )}
            </View>

            <View style={{ gap: 2 }}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: theme.colors.text }}>
                Excel Spreadsheet (.xlsx)
              </Text>
              <Text variant="caption" muted style={{ fontSize: 12 }}>
                Multi-sheet workbook with category pivot summary
              </Text>
            </View>
          </View>

          <Share2 size={18} color={theme.colors.textMuted} />
        </Pressable>

        {/* CSV Button */}
        <Pressable
          disabled={Boolean(isExporting)}
          onPress={handleExportCsv}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 16,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: isExporting === 'csv' ? 0.7 : pressed ? 0.8 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(14, 165, 233, 0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isExporting === 'csv' ? (
                <ActivityIndicator size="small" color="#38BDF8" />
              ) : (
                <FileText size={22} color="#38BDF8" />
              )}
            </View>

            <View style={{ gap: 2 }}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: theme.colors.text }}>
                Standard CSV Table (.csv)
              </Text>
              <Text variant="caption" muted style={{ fontSize: 12 }}>
                Raw comma-separated table for custom data analysis
              </Text>
            </View>
          </View>

          <Share2 size={18} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {/* ── 5. IMPORT SECTION ── */}
      <View style={{ gap: 10, marginTop: 4 }}>
        <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
          Data Backup & Restoration
        </Text>

        <Pressable
          onPress={handleImportCsv}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 14,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderStyle: 'dashed',
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Upload size={16} color={theme.colors.primary} />
          <Text variant="caption" style={{ fontWeight: '700', color: theme.colors.primary }}>
            Import Transactions from CSV Backup
          </Text>
        </Pressable>
      </View>

      {/* Build tag — if this line is NOT visible on screen, the device is
          running a stale JS bundle and none of the export fixes are live. */}
      <Text variant="caption" muted style={{ fontSize: 10, textAlign: 'center', opacity: 0.55 }}>
        Export build v7 · {Platform.OS}
      </Text>
    </ScrollView>

    {/* ── INLINE STATUS BANNER — lives in this screen's own window, so it is
        always visible (no dependence on the shared ToastHost / Android modal
        window layering). Auto-hides; tap to dismiss. ── */}
    {banner ? (
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 18,
          left: 16,
          right: 16,
          opacity: bannerOpacity,
          zIndex: 999,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
        }}
      >
        <Pressable
          onPress={() => {
            if (bannerTimer.current) clearTimeout(bannerTimer.current);
            Animated.timing(bannerOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setBanner(null));
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 16,
            backgroundColor:
              banner.tone === 'success'
                ? theme.colors.income
                : banner.tone === 'error'
                  ? theme.colors.danger
                  : theme.colors.primary,
          }}
        >
          {banner.tone === 'success' ? (
            <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.4} />
          ) : banner.tone === 'error' ? (
            <X size={18} color="#FFFFFF" strokeWidth={2.6} />
          ) : (
            <Info size={18} color="#FFFFFF" strokeWidth={2.4} />
          )}
          <Text
            numberOfLines={2}
            style={{ flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '800', color: '#FFFFFF', includeFontPadding: false }}
          >
            {banner.message}
          </Text>
        </Pressable>
      </Animated.View>
    ) : null}
    </View>
  );
}