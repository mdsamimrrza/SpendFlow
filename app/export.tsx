import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronLeft,
  FileSpreadsheet,
  FileText,
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
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/hooks/useLanguage';
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

  const expenses = useExpenses(profile?.id);
  const preferredCurrency = profile?.preferred_currency ?? 'NPR';

  // Filter items by chosen period
  const filteredItems = useMemo(
    () => filterExpensesByPeriod(expenses.items, period),
    [expenses.items, period],
  );

  const totalAmount = useMemo(
    () => sumExpenses(filteredItems, preferredCurrency, rates),
    [filteredItems, preferredCurrency, rates],
  );

  const periodLabel = PERIODS.find((p) => p.value === period)?.label || 'This Month';

  // 1. PDF Export Handler
  async function handleExportPdf() {
    if (filteredItems.length === 0) {
      Alert.alert('No Transactions', 'There are no expenses in the selected period to generate a statement.');
      return;
    }
    setIsExporting('pdf');
    try {
      await exportPdf(filteredItems, profile, preferredCurrency);
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF statement.');
    } finally {
      setIsExporting(null);
    }
  }

  // 2. Excel Export Handler
  async function handleExportExcel() {
    if (filteredItems.length === 0) {
      Alert.alert('No Transactions', 'There are no expenses in the selected period to export.');
      return;
    }
    setIsExporting('excel');
    try {
      await exportExcel(filteredItems, preferredCurrency);
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate Excel spreadsheet.');
    } finally {
      setIsExporting(null);
    }
  }

  // 3. CSV Export Handler
  async function handleExportCsv() {
    if (filteredItems.length === 0) {
      Alert.alert('No Transactions', 'There are no expenses in the selected period to export.');
      return;
    }
    setIsExporting('csv');
    try {
      await exportCsv(filteredItems);
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate CSV file.');
    } finally {
      setIsExporting(null);
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
      const count = await importExpensesFromCsv(profile.id, csv);
      Alert.alert('Import Complete', `${count} transactions were successfully imported.`);
      await expenses.refresh(true);
    } catch (error) {
      Alert.alert('Import Failed', error instanceof Error ? error.message : 'Could not import CSV.');
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
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
          onPress={() => router.back()}
          hitSlop={8}
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
    </ScrollView>
  );
}
