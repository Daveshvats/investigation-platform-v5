import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TableRow } from '@/types/api';

interface PDFExportOptions {
  title?: string;
  subtitle?: string;
  tableName: string;
  records: TableRow[];
  selectedFields?: string[];
  date?: Date;
}

interface MultiTableExportOptions {
  title?: string;
  tables: Array<{
    tableName: string;
    records: TableRow[];
  }>;
  date?: Date;
}

/**
 * Format a value for PDF display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value).substring(0, 50);
  }
  const str = String(value);
  return str.length > 50 ? str.substring(0, 50) + '...' : str;
}

/**
 * Truncate field name for display
 */
function truncateFieldName(name: string): string {
  return name.length > 20 ? name.substring(0, 20) + '..' : name;
}

/**
 * Export single table to PDF
 */
export async function exportToPDF(options: PDFExportOptions): Promise<Blob> {
  const {
    title = 'Data Export Report',
    tableName,
    records,
    selectedFields,
    date = new Date(),
  } = options;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let yPos = 20;

  // Header
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('HIGHPERF DESKTOP', margin, yPos);
  yPos += 6;

  // Title
  doc.setFontSize(18);
  doc.setTextColor(31, 78, 121); // Dark blue
  doc.text(title, margin, yPos);
  yPos += 8;

  // Subtitle with table info
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Table: ${tableName}  ${dateStr} • ${records.length} records`, margin, yPos);
  yPos += 10;

  // Process records
  if (records.length === 0) {
    doc.setFontSize(12);
    doc.setTextColor(150);
    doc.text('No records to display', margin, yPos);
    return doc.output('blob');
  }

  // Get fields to display
  const fields = selectedFields || Object.keys(records[0]).filter(k => !k.startsWith('_'));
  
  // Create table data
  const tableData: string[][] = [];
  
  records.forEach((record, index) => {
    const row: string[] = [String(index + 1)]; // Row number
    fields.forEach(field => {
      row.push(formatValue(record[field]));
    });
    tableData.push(row);
  });

  // Create headers
  const headers = ['#', ...fields.map(truncateFieldName)];

  // Generate table
  autoTable(doc, {
    startY: yPos,
    head: [headers],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [31, 78, 121],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: 50,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    margin: { left: margin, right: margin },
    styles: {
      cellPadding: 3,
      overflow: 'linebreak',
      cellWidth: 'wrap',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' }, // Row number column
    },
    didDrawPage: (data) => {
      // Footer
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Confidential ${data.pageNumber} / ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    },
  });

  return doc.output('blob');
}

/**
 * Download single table PDF
 */
export async function downloadPDF(options: PDFExportOptions): Promise<void> {
  const blob = await exportToPDF(options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.tableName}_export_${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export multiple tables to PDF
 */
export async function exportMultiTablePDF(options: MultiTableExportOptions): Promise<Blob> {
  const { title = 'Data Export Report', tables, date = new Date() } = options;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let yPos = 20;
  let isFirstTable = true;

  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  tables.forEach((table, tableIndex) => {
    // Add page break for tables after the first
    if (!isFirstTable) {
      doc.addPage();
      yPos = 20;
    }
    isFirstTable = false;

    // Header
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('HIGHPERF DESKTOP', margin, yPos);
    yPos += 6;

    // Title
    doc.setFontSize(18);
    doc.setTextColor(31, 78, 121);
    doc.text(title, margin, yPos);
    yPos += 8;

    // Subtitle
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Table: ${table.tableName}  ${dateStr} • ${table.records.length} records`, margin, yPos);
    yPos += 10;

    if (table.records.length === 0) {
      doc.setFontSize(12);
      doc.setTextColor(150);
      doc.text('No records to display', margin, yPos);
      return;
    }

    // Get fields
    const fields = Object.keys(table.records[0]).filter(k => !k.startsWith('_'));
    
    // Create table data
    const tableData: string[][] = [];
    table.records.forEach((record, index) => {
      const row: string[] = [String(index + 1)];
      fields.forEach(field => {
        row.push(formatValue(record[field]));
      });
      tableData.push(row);
    });

    const headers = ['#', ...fields.map(truncateFieldName)];

    autoTable(doc, {
      startY: yPos,
      head: [headers],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [31, 78, 121],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: 50,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { left: margin, right: margin },
      styles: {
        cellPadding: 3,
        overflow: 'linebreak',
        cellWidth: 'wrap',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
      },
      didDrawPage: (data) => {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Confidential ${data.pageNumber} / ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      },
    });

    // Update yPos for potential next content
    yPos = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : yPos + 50;
  });

  return doc.output('blob');
}

/**
 * Download multi-table PDF
 */
export async function downloadMultiTablePDF(options: MultiTableExportOptions): Promise<void> {
  const blob = await exportMultiTablePDF(options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `multi_table_export_${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
