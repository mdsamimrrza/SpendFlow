import { Alert, Platform } from 'react-native';
import writeXlsxFile from 'write-excel-file/browser';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Expense, UserProfile } from '@/types';
import { formatMoney, groupByCategory } from '@/utils/format';

export function generateExportFileName(expenses: Expense[], ext: 'pdf' | 'xlsx' | 'csv'): string {
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

import { StorageAccessFramework, readAsStringAsync, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';

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
      if (StorageAccessFramework) {
        const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const directoryUri = permissions.directoryUri;
          const newFileUri = await StorageAccessFramework.createFileAsync(
            directoryUri,
            fileName,
            mimeType,
          );

          let content = base64Content;
          if (!content) {
            content = await readAsStringAsync(fileUri, {
              encoding: EncodingType.Base64,
            });
          }

          await writeAsStringAsync(newFileUri, content, {
            encoding: EncodingType.Base64,
          });

          Alert.alert('Download Complete ✅', `Statement saved to your selected folder as:\n\n${fileName}`);
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
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, fileName);
  if (file.exists) {
    file.delete();
  }
  file.write(csvContent);

  const base64Content = btoa(unescape(encodeURIComponent(csvContent)));
  await saveOrShareFile(file.uri, fileName, 'text/csv', base64Content);
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

  const workbook = await writeXlsxFile([
    { sheet: 'Expenses Ledger', data: expenseRows },
    { sheet: 'Category Analytics', data: summaryRows },
  ]);
  const blob = await workbook.toBlob();

  if (Platform.OS === 'web') {
    downloadWebFile(blob, fileName);
    return;
  }

  // Native Mobile: Write to named cache file
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, fileName);
  if (file.exists) {
    file.delete();
  }
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  file.write(bytes);

  await saveOrShareFile(
    file.uri,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64,
  );
}

// ── 3. LUXURY PDF STATEMENT EXPORT ──
export async function exportPdf(
  expenses: Expense[],
  profile?: UserProfile | null,
  customTitle?: string,
  currency = 'NPR',
) {
  const fileName = generateExportFileName(expenses, 'pdf');
  const totalAmount = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const categories = groupByCategory(expenses, currency);
  const avgPerTx = expenses.length > 0 ? Math.round(totalAmount / expenses.length) : 0;
  const userName = profile?.display_name || profile?.email?.split('@')[0] || 'SpendFlow User';
  const userEmail = profile?.email || '';
  const now = new Date();
  const statementDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const statementId = `SF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Find month title for header banner
  const months = Array.from(new Set(expenses.map((e) => e.date?.slice(0, 7)))).filter(Boolean);
  let periodTitle = customTitle || 'Financial Statement';
  if (!customTitle) {
    if (months.length === 1) {
      const [year, month] = months[0].split('-');
      const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', { month: 'long' });
      periodTitle = `Monthly Statement — ${monthName} ${year}`;
    } else if (months.length > 1) {
      const sorted = [...months].sort();
      periodTitle = `Statement (${sorted[0]} to ${sorted[sorted.length - 1]})`;
    }
  }

  // Category table rows HTML
  const categoryRowsHtml = categories
    .map((c) => {
      const pct = totalAmount > 0 ? Math.round((c.total / totalAmount) * 100) : 0;
      return `
        <tr>
          <td><span style="font-size: 16px; margin-right: 6px;">${c.icon}</span> <strong>${c.label}</strong></td>
          <td style="text-align: right; font-weight: 700;">${formatMoney(c.total, currency)}</td>
          <td style="text-align: right;">${pct}%</td>
          <td style="width: 140px;">
            <div style="background: #F1F5F9; border-radius: 4px; height: 8px; overflow: hidden;">
              <div style="background: #4F46E5; width: ${pct}%; height: 100%; border-radius: 4px;"></div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Transaction table rows HTML
  const transactionRowsHtml = expenses
    .map((e, idx) => `
      <tr style="${idx % 2 === 1 ? 'background-color: #F8FAFC;' : ''}">
        <td style="color: #94A3B8; font-size: 11px;">#${idx + 1}</td>
        <td><strong>${e.date}</strong> ${e.time ? `<span style="color:#64748B; font-size:11px;">${e.time}</span>` : ''}</td>
        <td>${e.categories?.icon || '🏷️'} ${e.categories?.name || 'Other'}</td>
        <td>
          <div style="font-weight: 600;">${e.description || 'Expense'}</div>
          ${e.notes ? `<div style="font-size: 10px; color: #64748B;">${e.notes}</div>` : ''}
        </td>
        <td><span style="display:inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #E2E8F0; color: #334155;">${e.payment_method}</span></td>
        <td style="text-align: right; font-weight: 800; color: #DC2626;">-${formatMoney(Number(e.amount), e.currency || currency)}</td>
      </tr>
    `)
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${fileName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #0F172A;
          background: #FFFFFF;
          padding: 40px 32px;
          line-height: 1.5;
        }

        /* Header */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 24px;
          border-bottom: 2px solid #E2E8F0;
          margin-bottom: 24px;
        }
        .logo-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-badge {
          width: 44px;
          height: 44px;
          background: #4F46E5;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          font-size: 22px;
          font-weight: 900;
        }
        .app-title {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.5px;
          color: #0F172A;
        }
        .app-subtitle {
          font-size: 11px;
          color: #64748B;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .statement-meta {
          text-align: right;
        }
        .statement-id {
          font-size: 12px;
          font-weight: 700;
          color: #4F46E5;
        }
        .statement-date {
          font-size: 11px;
          color: #64748B;
          margin-top: 2px;
        }

        /* Statement Banner */
        .banner {
          background: #0F172A;
          color: #FFFFFF;
          border-radius: 12px;
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .banner-user-name {
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 2px;
        }
        .banner-user-email {
          font-size: 12px;
          color: #94A3B8;
        }
        .banner-period-tag {
          background: rgba(255, 255, 255, 0.15);
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Executive Summary Grid */
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 28px;
        }
        .summary-card {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 16px;
        }
        .summary-card.highlight {
          background: #EEF2FF;
          border-color: #C7D2FE;
        }
        .summary-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: #64748B;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 24px;
          font-weight: 900;
          color: #0F172A;
        }
        .summary-value.primary { color: #4F46E5; }

        /* Section Headings */
        .section-title {
          font-size: 16px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 12px;
          padding-bottom: 6px;
          border-bottom: 1px solid #E2E8F0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Tables */
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 28px;
          font-size: 12px;
        }
        th {
          text-align: left;
          background: #F8FAFC;
          padding: 10px 12px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #E2E8F0;
        }
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #F1F5F9;
          color: #1E293B;
        }

        /* Footer */
        .footer-note {
          margin-top: 36px;
          padding-top: 16px;
          border-top: 1px solid #E2E8F0;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #94A3B8;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="header">
        <div class="logo-container">
          <div class="logo-badge">⚡</div>
          <div>
            <div class="app-title">SpendFlow</div>
            <div class="app-subtitle">Financial Intelligence Platform</div>
          </div>
        </div>
        <div class="statement-meta">
          <div class="statement-id">${statementId}</div>
          <div class="statement-date">Generated: ${statementDate}</div>
        </div>
      </div>

      <!-- Banner -->
      <div class="banner">
        <div>
          <div class="banner-user-name">${userName}</div>
          <div class="banner-user-email">${userEmail}</div>
        </div>
        <div class="banner-period-tag">${periodTitle}</div>
      </div>

      <!-- Key Metrics -->
      <div class="summary-grid">
        <div class="summary-card highlight">
          <div class="summary-label">Total Outflows</div>
          <div class="summary-value primary">${formatMoney(totalAmount, currency)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Transactions</div>
          <div class="summary-value">${expenses.length}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Average Outflow</div>
          <div class="summary-value">${formatMoney(avgPerTx, currency)}</div>
        </div>
      </div>

      <!-- Category Allocation -->
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
  const { File, Paths } = await import('expo-file-system');
  const tempFile = new File(tempUri);
  const targetFile = new File(Paths.cache, fileName);
  if (targetFile.exists) {
    targetFile.delete();
  }
  tempFile.copy(targetFile);

  await saveOrShareFile(targetFile.uri, fileName, 'application/pdf');
}
