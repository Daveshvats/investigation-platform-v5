import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  CorrelationResult,
  DataQualityReport,
} from '@/types/investigation';

interface InvestigationExportRequest {
  result: CorrelationResult;
  quality: DataQualityReport;
  title: string;
  caseNumber?: string;
  preparedBy?: string;
  classification?: string;
}

function getSeverityColor(severity: string): [number, number, number] {
  switch (severity) {
    case 'critical': return [192, 57, 43];
    case 'high': return [231, 76, 60];
    case 'medium': return [243, 156, 18];
    case 'low': return [52, 152, 219];
    default: return [128, 128, 128];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: InvestigationExportRequest = await request.json();
    const { result, quality, title, caseNumber, preparedBy, classification } = body;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let yPos = 20;

    // Classification Banner
    if (classification && classification !== 'UNCLASSIFIED') {
      doc.setFillColor(192, 57, 43);
      doc.rect(0, 0, pageWidth, 10, 'F');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(classification, pageWidth / 2, 7, { align: 'center' });
      yPos = 25;
    }

    // Header
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('INVESTIGATION ANALYSIS REPORT', margin, yPos);
    yPos += 8;

    // Title
    doc.setFontSize(20);
    doc.setTextColor(31, 78, 121);
    doc.text(title || 'Investigation Report', margin, yPos);
    yPos += 10;

    // Subtitle
    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    let subtitle = `Generated: ${dateStr}`;
    if (caseNumber) subtitle += ` | Case: ${caseNumber}`;
    if (preparedBy) subtitle += ` | By: ${preparedBy}`;
    doc.text(subtitle, margin, yPos);
    yPos += 15;

    // Summary Statistics
    doc.setFontSize(14);
    doc.setTextColor(31, 78, 121);
    doc.text('Executive Summary', margin, yPos);
    yPos += 8;

    const summaryData = [
      ['Total Entities', result.statistics.totalEntities.toString()],
      ['Total Relationships', result.statistics.totalRelationships.toString()],
      ['Patterns Detected', result.patterns.length.toString()],
      ['Critical Patterns', result.patterns.filter(p => p.severity === 'critical').length.toString()],
      ['Data Quality Score', `${Math.round(quality.overallScore * 100)}%`],
      ['Coverage Score', `${Math.round(result.statistics.coverageScore * 100)}%`],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [31, 78, 121] },
      margin: { left: margin, right: margin },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Entity Distribution
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(31, 78, 121);
    doc.text('Entity Distribution', margin, yPos);
    yPos += 8;

    const entityData = Object.entries(result.statistics.entitiesByType).map(([type, count]) => [
      type.charAt(0).toUpperCase() + type.slice(1),
      (count as number).toString(),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Entity Type', 'Count']],
      body: entityData,
      theme: 'striped',
      headStyles: { fillColor: [31, 78, 121] },
      margin: { left: margin, right: margin },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Patterns Section
    if (result.patterns.length > 0) {
      doc.addPage();
      yPos = 20;

      doc.setFontSize(14);
      doc.setTextColor(31, 78, 121);
      doc.text('Detected Patterns', margin, yPos);
      yPos += 8;

      for (const pattern of result.patterns.slice(0, 20)) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        // Pattern header
        const severityColors = getSeverityColor(pattern.severity);
        doc.setFillColor(...severityColors);
        doc.rect(margin, yPos, 3, 20, 'F');

        doc.setFontSize(11);
        doc.setTextColor(31, 78, 121);
        doc.text(pattern.type.replace(/_/g, ' ').toUpperCase(), margin + 8, yPos + 6);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`Severity: ${pattern.severity.toUpperCase()} | Confidence: ${Math.round(pattern.confidence * 100)}%`, margin + 8, yPos + 14);

        yPos += 25;

        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        const lines = doc.splitTextToSize(pattern.description, pageWidth - 2 * margin);
        doc.text(lines, margin, yPos);
        yPos += lines.length * 4 + 8;
      }
    }

    // Quality Section
    doc.addPage();
    yPos = 20;

    doc.setFontSize(14);
    doc.setTextColor(31, 78, 121);
    doc.text('Data Quality Assessment', margin, yPos);
    yPos += 8;

    const qualityData = quality.dimensions.map(dim => [
      dim.name.charAt(0).toUpperCase() + dim.name.slice(1),
      `${Math.round(dim.score * 100)}%`,
      dim.details,
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Dimension', 'Score', 'Details']],
      body: qualityData,
      theme: 'striped',
      headStyles: { fillColor: [31, 78, 121] },
      margin: { left: margin, right: margin },
    });

    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount}${classification ? ` | ${classification}` : ''}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    const pdfBytes = doc.output('arraybuffer');
    
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="investigation_report_${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}
