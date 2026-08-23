import * as DocumentPicker from 'expo-document-picker';
import { FileSpreadsheet, FileText, Upload } from 'lucide-react-native';
import { Alert, ScrollView } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { PERIODS } from '@/constants/app';
import { exportCsv, exportExcel } from '@/services/export';
import { importExpensesFromCsv } from '@/services/expenses';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useTheme } from '@/hooks/useTheme';
import { PeriodKey } from '@/types';
import { useState } from 'react';

export default function ExportScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const [period, setPeriod] = useState<PeriodKey>('month');
  const expenses = useExpenses(profile?.id);

  async function importCsv() {
    if (!profile?.id) return;
    const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values'], copyToCacheDirectory: true });
    if (result.canceled) return;
    try {
      const csv = await fetch(result.assets[0].uri).then((response) => response.text());
      const count = await importExpensesFromCsv(profile.id, csv);
      Alert.alert('Import complete', `${count} expenses were imported.`);
      await expenses.refresh();
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Could not import CSV.');
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
      <Text variant="h1">Export</Text>
      <Text muted>Generate shareable files from the currently cached expense period.</Text>
      <Select label="Period" value={period} options={PERIODS} onChange={setPeriod} />
      <Button title="Export Excel" icon={FileSpreadsheet} onPress={() => exportExcel(expenses.items)} />
      <Button title="Export CSV" variant="secondary" icon={FileText} onPress={() => exportCsv(expenses.items)} />
      <Button title="Import CSV" variant="secondary" icon={Upload} onPress={importCsv} />
    </ScrollView>
  );
}
