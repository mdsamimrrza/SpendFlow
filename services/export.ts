import { Platform } from 'react-native';
import writeXlsxFile from 'write-excel-file/browser';
import { Expense } from '@/types';
import { formatMoney, groupByCategory } from '@/utils/format';

function rowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
}

function downloadWebFile(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function exportCsv(expenses: Expense[]) {
  const rows = [
    ['Date', 'Amount', 'Currency', 'Category', 'Payment Method', 'Description', 'Notes'],
    ...expenses.map((expense) => [
      expense.date,
      String(expense.amount),
      expense.currency,
      expense.categories?.name ?? 'Other',
      expense.payment_method,
      expense.description ?? '',
      expense.notes ?? '',
    ]),
  ];

  const csvContent = rowsToCsv(rows);

  if (Platform.OS === 'web') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadWebFile(blob, 'spendflow-expenses.csv');
    return;
  }

  // Native Mobile (Android / iOS)
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, 'spendflow-expenses.csv');
  file.write(csvContent);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Share SpendFlow CSV' });
}

export async function exportExcel(expenses: Expense[]) {
  const summary = groupByCategory(expenses);
  const expenseRows = [
    [{ value: 'Date' }, { value: 'Amount' }, { value: 'Currency' }, { value: 'Category' }, { value: 'Payment Method' }, { value: 'Description' }],
    ...expenses.map((expense) => [
      { value: expense.date },
      { value: Number(expense.amount) },
      { value: expense.currency },
      { value: expense.categories?.name ?? 'Other' },
      { value: expense.payment_method },
      { value: expense.description ?? '' },
    ]),
  ];
  const summaryRows = [
    [{ value: 'Category' }, { value: 'Total' }],
    ...summary.map((item) => [{ value: `${item.icon} ${item.label}` }, { value: formatMoney(item.total, expenses[0]?.currency ?? 'NPR') }]),
  ];

  const workbook = await writeXlsxFile([
    { sheet: 'Expenses', data: expenseRows },
    { sheet: 'Category Summary', data: summaryRows },
  ]);
  const blob = await workbook.toBlob();

  if (Platform.OS === 'web') {
    downloadWebFile(blob, 'spendflow-expenses.xlsx');
    return;
  }

  // Native Mobile (Android / iOS)
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, 'spendflow-expenses.xlsx');
  const arrayBuffer = await blob.arrayBuffer();
  file.write(new Uint8Array(arrayBuffer));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Share SpendFlow Excel',
  });
}
