import '@/utils/polyfills';
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Expense, UserProfile } from '@/types';
import { formatMoney, groupByCategory } from '@/utils/format';

function generateExportFileName(expenses: Expense[], ext: 'pdf' | 'xlsx' | 'csv'): string {
  const now = new Date();
  const months = Array.from(new Set(expenses.map((e) => e.date?.slice(0, 7)))).filter(Boolean);

  if (months.length === 1) {
    const [year, month] = months[0].split('-');
    const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', { month: 'long' });
    return `SpendFlow-Statement-${monthName}-${year}.${ext}`;
  }

  if (months.length > 1) {
    const sorted = [...months].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    return `SpendFlow-Statement-${start}-to-${end}.${ext}`;
  }

  const todayStr = now.toISOString().slice(0, 10);
  return `SpendFlow-Statement-${todayStr}.${ext}`;
}

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

/**
 * Saves the file directly to Android Downloads/chosen folder using StorageAccessFramework (SAF)
 * or falls back to system sharing dialog.
 */
async function saveOrShareFile(
  fileUri: string,
  fileName: string,
  mimeType: string,
  base64Content?: string,
) {
  if (Platform.OS === 'android') {
    try {
      if (FileSystem.StorageAccessFramework) {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const directoryUri = permissions.directoryUri;
          const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            directoryUri,
            fileName,
            mimeType,
          );

          let content = base64Content;
          if (!content) {
            content = await FileSystem.readAsStringAsync(fileUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }

          await FileSystem.writeAsStringAsync(newFileUri, content, {
            encoding: FileSystem.EncodingType.Base64,
          });

          return;
        }
      }
    } catch (err) {
      console.warn('StorageAccessFramework save error, falling back to share:', err);
    }
  }

  // iOS / Fallback: System Share/Save Sheet
  await Sharing.shareAsync(fileUri, {
    mimeType,
    dialogTitle: `Save ${fileName}`,
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
  });
}

// ── 1. CSV EXPORT ──
export async function exportCsv(expenses: Expense[]) {
  const fileName = generateExportFileName(expenses, 'csv');
  const rows = [
    ['Date', 'Time', 'Amount', 'Currency', 'Category', 'Payment Method', 'Description', 'Notes'],
    ...expenses.map((expense) => [
      expense.date,
      expense.time || '',
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
    downloadWebFile(blob, fileName);
    return;
  }

  // Native Mobile (Android / iOS)
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const base64Content = btoa(unescape(encodeURIComponent(csvContent)));
  await saveOrShareFile(fileUri, fileName, 'text/csv', base64Content);
}

// ── 2. EXCEL (XLSX) EXPORT ──
export async function exportExcel(expenses: Expense[], currency = 'NPR') {
  const fileName = generateExportFileName(expenses, 'xlsx');
  const summary = groupByCategory(expenses, currency);
  const totalAmount = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const expenseRows = [
    [
      { value: 'Date' },
      { value: 'Time' },
      { value: 'Amount' },
      { value: 'Currency' },
      { value: 'Category' },
      { value: 'Payment Method' },
      { value: 'Description' },
      { value: 'Notes' },
    ],
    ...expenses.map((expense) => [
      { value: expense.date },
      { value: expense.time || '' },
      { value: Number(expense.amount) },
      { value: expense.currency },
      { value: expense.categories?.name ?? 'Other' },
      { value: expense.payment_method },
      { value: expense.description ?? '' },
      { value: expense.notes ?? '' },
    ]),
  ];

  const summaryRows = [
    [{ value: 'Category' }, { value: 'Total' }, { value: 'Share %' }],
    ...summary.map((item) => [
      { value: `${item.icon} ${item.label}` },
      { value: formatMoney(item.total, currency) },
      { value: `${totalAmount > 0 ? Math.round((item.total / totalAmount) * 100) : 0}%` },
    ]),
  ];

  const writeXlsxFileModule = await import('write-excel-file');
  const writeXlsxFile = writeXlsxFileModule.default;

  const blob = await writeXlsxFile([expenseRows, summaryRows], {
    sheets: ['Expenses Ledger', 'Category Analytics'],
  });

  if (Platform.OS === 'web') {
    downloadWebFile(blob, fileName);
    return;
  }

  // Native Mobile: Write to named cache file
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await saveOrShareFile(
    fileUri,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64,
  );
}

// ── 3. PDF EXPORT (COMPREHENSIVE PROFESSIONAL FINANCIAL STATEMENT) ──
export async function exportPdf(expenses: Expense[], profile?: UserProfile | null, currency = 'NPR') {
  const fileName = generateExportFileName(expenses, 'pdf');
  const now = new Date();
  const generatedDateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Calculate Aggregates
  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalTransactions = expenses.length;
  const categorySummary = groupByCategory(expenses, currency);
  const topCategory = categorySummary[0]?.label ?? 'N/A';
  const averageSpent = totalTransactions > 0 ? Math.round(totalSpent / totalTransactions) : 0;

  // Render Category Breakdown Rows
  const categoryRowsHtml = categorySummary
    .map((item) => {
      const percentage = totalSpent > 0 ? Math.round((item.total / totalSpent) * 100) : 0;
      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">${item.icon}</span>
              <span style="font-weight: 600; color: #1E293B;">${item.label}</span>
            </div>
          </td>
          <td style="text-align: right; font-weight: 700; color: #0F172A;">${formatMoney(item.total, currency)}</td>
          <td style="text-align: right; font-weight: 600; color: #0F5C4D;">${percentage}%</td>
          <td>
            <div style="background-color: #E2E8F0; border-radius: 999px; height: 6px; width: 100%; overflow: hidden;">
              <div style="background-color: #0F5C4D; height: 100%; width: ${percentage}%;"></div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Render Transaction Rows
  const transactionRowsHtml = expenses
    .map((e, index) => {
      const categoryName = e.categories?.name ?? 'Uncategorized';
      const categoryIcon = e.categories?.icon ?? '💳';
      const desc = e.description || e.notes || '—';
      const subNotes = e.description && e.notes ? `<div style="font-size: 11px; color: #64748B;">${e.notes}</div>` : '';

      return `
        <tr style="background-color: ${index % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="color: #94A3B8; font-size: 11px; font-weight: 600;">#${index + 1}</td>
          <td style="font-weight: 600; color: #334155; white-space: nowrap;">${e.date} ${e.time ? `<span style="font-size: 11px; color: #94A3B8;">${e.time}</span>` : ''}</td>
          <td>
            <span style="font-size: 13px;">${categoryIcon}</span>
            <span style="font-weight: 600; color: #1E293B;">${categoryName}</span>
          </td>
          <td>
            <div style="font-weight: 500; color: #334155;">${desc}</div>
            ${subNotes}
          </td>
          <td>
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: #F1F5F9; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase;">${e.payment_method}</span>
          </td>
          <td style="text-align: right; font-weight: 800; color: #0F5C4D; white-space: nowrap;">${formatMoney(Number(e.amount), e.currency || currency)}</td>
        </tr>
      `;
    })
    .join('');

  const userName = profile?.display_name || 'SpendFlow User';
  const userEmail = profile?.email || '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>SpendFlow Statement</title>
      <style>
        @page {
          size: A4;
          margin: 18mm 15mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0F172A;
          margin: 0;
          padding: 0;
          font-size: 12px;
          line-height: 1.5;
          background-color: #FFFFFF;
        }
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0F5C4D;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .brand-title {
          font-size: 26px;
          font-weight: 900;
          color: #0F5C4D;
          letter-spacing: -0.5px;
          margin: 0;
        }
        .brand-subtitle {
          font-size: 11px;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 2px;
        }
        .meta-box {
          text-align: right;
          font-size: 11px;
          color: #475569;
        }
        .meta-title {
          font-size: 14px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 4px;
        }
        .summary-cards {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }
        .card {
          flex: 1;
          background-color: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 12px;
        }
        .card-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .card-value {
          font-size: 18px;
          font-weight: 800;
          color: #0F5C4D;
          margin-top: 4px;
        }
        .card-subtext {
          font-size: 10px;
          color: #94A3B8;
          margin-top: 2px;
        }
        .section-title {
          font-size: 14px;
          font-weight: 800;
          color: #0F172A;
          margin-top: 20px;
          margin-bottom: 10px;
          border-bottom: 1px solid #E2E8F0;
          padding-bottom: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          background-color: #F1F5F9;
          color: #475569;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 8px 10px;
          text-align: left;
          border-bottom: 1px solid #CBD5E1;
        }
        td {
          padding: 9px 10px;
          border-bottom: 1px solid #E2E8F0;
          vertical-align: middle;
        }
        .footer-note {
          margin-top: 30px;
          padding-top: 12px;
          border-top: 1px dashed #CBD5E1;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #94A3B8;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="header-container">
        <div>
          <h1 class="brand-title">SpendFlow</h1>
          <div class="brand-subtitle">Official Financial Statement</div>
          <div style="margin-top: 10px; font-size: 12px; font-weight: 700; color: #1E293B;">
            Account Holder: <span style="color: #0F5C4D;">${userName}</span>
            ${userEmail ? `<span style="font-weight: 400; color: #64748B;"> (${userEmail})</span>` : ''}
          </div>
        </div>
        <div class="meta-box">
          <div class="meta-title">EXPENSE REPORT</div>
          <div><strong>Generated:</strong> ${generatedDateStr}</div>
          <div><strong>Currency:</strong> ${currency}</div>
          <div><strong>Total Transactions:</strong> ${totalTransactions}</div>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="summary-cards">
        <div class="card">
          <div class="card-label">Total Outflow</div>
          <div class="card-value">${formatMoney(totalSpent, currency)}</div>
          <div class="card-subtext">Across ${totalTransactions} expense records</div>
        </div>
        <div class="card">
          <div class="card-label">Top Category</div>
          <div class="card-value" style="font-size: 15px; color: #1E293B; margin-top: 6px;">${topCategory}</div>
          <div class="card-subtext">Highest expenditure sector</div>
        </div>
        <div class="card">
          <div class="card-label">Average Spend</div>
          <div class="card-value" style="color: #2563EB;">${formatMoney(averageSpent, currency)}</div>
          <div class="card-subtext">Per transaction average</div>
        </div>
      </div>

      <!-- Category Breakdown -->
      <div class="section-title">📊 Category Breakdown</div>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th style="text-align: right;">Total Spent</th>
            <th style="text-align: right;">Share</th>
            <th style="width: 140px;">Distribution</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRowsHtml || '<tr><td colspan="4" style="text-align:center; color:#94A3B8;">No categorized expenses</td></tr>'}
        </tbody>
      </table>

      <!-- Itemized Ledger -->
      <div class="section-title">🧾 Itemized Transaction Ledger</div>
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Date</th>
            <th>Category</th>
            <th>Description & Notes</th>
            <th>Method</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transactionRowsHtml || '<tr><td colspan="6" style="text-align:center; color:#94A3B8;">No transactions found in this period</td></tr>'}
        </tbody>
      </table>

      <!-- Footer -->
      <div class="footer-note">
        <div>🔒 Verified by SpendFlow Financial Observability & Security Engine</div>
        <div>Page 1 • Auto-Generated Confidential Report</div>
      </div>
    </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  // Native Mobile: Generate PDF file, copy to named cache file
  const { uri: tempUri } = await Print.printToFileAsync({ html });
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.copyAsync({ from: tempUri, to: fileUri });

  await saveOrShareFile(fileUri, fileName, 'application/pdf');
}
