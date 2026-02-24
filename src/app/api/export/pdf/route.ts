import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

interface FilteredResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  matchedFilters: string[];
  matchScore: number;
  highlights: Record<string, string>;
}

interface GraphNode {
  id: string;
  type: string;
  value: string;
  count: number;
  connections: string[];
  sources: string[];
}

interface CorrelationGraph {
  nodes: GraphNode[];
  edges: Array<{ source: string; target: string; weight: number; type: string }>;
  clusters: Array<{ id: string; nodes: string[]; label: string }>;
}

interface Insights {
  summary: string;
  entityConnections: Array<{ entity: string; type: string; appearances: number; tables: string[] }>;
  patterns: string[];
  recommendations: string[];
  confidence: number;
  aiModel: string;
  localAIUsed: boolean;
}

interface ExportRequest {
  query: string;
  results: FilteredResult[];
  graph: CorrelationGraph;
  insights: Insights;
  metadata: {
    duration: number;
    apiCalls: number;
    iterations: number;
    totalFetched: number;
    duplicatesRemoved: number;
    primarySearchTerm: string;
    discoveredEntities: number;
    discoveredEntityList: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const data: ExportRequest = await request.json();
    const { query, results, graph, insights, metadata } = data;

    // Generate unique filename
    const timestamp = Date.now();
    const pdfFilename = `investigation_report_${timestamp}.pdf`;
    const pyFilename = `generate_pdf_${timestamp}.py`;
    const downloadDir = '/home/z/my-project/download';
    const pyPath = path.join(os.tmpdir(), pyFilename);
    const pdfPath = path.join(downloadDir, pdfFilename);

    // Generate Python code for PDF
    const pythonCode = generatePDFCode(query, results, graph, insights, metadata, pdfPath);

    // Write Python script
    await writeFile(pyPath, pythonCode, 'utf-8');

    // Sanitize the code
    try {
      await execAsync(`python /home/z/my-project/scripts/sanitize_code.py "${pyPath}"`);
    } catch (sanitizeError) {
      console.warn('Sanitization warning:', sanitizeError);
    }

    // Execute Python script
    const { stdout, stderr } = await execAsync(`python "${pyPath}"`);
    
    if (stderr && !stderr.includes('PDF created')) {
      console.error('PDF generation stderr:', stderr);
    }

    // Read the generated PDF
    const pdfBuffer = await readFile(pdfPath);

    // Cleanup
    try {
      await unlink(pyPath);
    } catch {
      // Ignore cleanup errors
    }

    // Return PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFilename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function generatePDFCode(
  query: string,
  results: FilteredResult[],
  graph: CorrelationGraph,
  insights: Insights,
  metadata: ExportRequest['metadata'],
  outputPath: string
): string {
  const formatDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Escape strings for Python - handle all special characters
  const escapePy = (str: string): string => {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  };

  // Generate entity connections rows
  const entityConnectionsRows = insights.entityConnections.slice(0, 15).map(conn => {
    const entity = escapePy(conn.entity.length > 25 ? conn.entity.slice(0, 25) + '...' : conn.entity);
    const type = escapePy(conn.type);
    const tables = escapePy(conn.tables.join(', ').slice(0, 30));
    return `            [Paragraph("${entity}", cell_style), Paragraph("${type}", cell_center), Paragraph("${conn.appearances}", cell_center), Paragraph("${tables}", cell_style)],`;
  }).join('\n');

  // Generate patterns
  const patternsText = insights.patterns.slice(0, 5).map(p => {
    const pattern = escapePy(p);
    return `    story.append(Paragraph("• ${pattern}", body_style))`;
  }).join('\n');

  // Generate recommendations
  const recommendationsText = insights.recommendations.slice(0, 5).map(r => {
    const rec = escapePy(r);
    return `    story.append(Paragraph("• ${rec}", body_style))`;
  }).join('\n');

  // Generate discovered entities
  const discoveredEntitiesText = metadata.discoveredEntityList?.slice(0, 20).join(', ') || '';
  
  // Generate table groups for results
  const tableGroupsCode = generateTableGroupsCode(results, escapePy);

  // Generate clusters code
  const clustersCode = graph.clusters.slice(0, 10).map((cluster, i) => {
    const label = escapePy(cluster.label);
    return `    story.append(Paragraph("<b>Cluster ${i + 1}:</b> ${label}", subheader_style))
    story.append(Paragraph("Contains ${cluster.nodes.length} related entities", body_style))`;
  }).join('\n');

  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Investigation Findings Report Generator"""

import os
import sys

# Set UTF-8 encoding for stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.units import inch, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from datetime import datetime

# Register fonts
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')

# Color scheme
HEADER_BG = colors.HexColor('#1F4E79')
HEADER_TEXT = colors.white
ROW_EVEN = colors.white
ROW_ODD = colors.HexColor('#F5F5F5')

def build_report(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm,
        title='Investigation Findings Report',
        author='Z.ai',
        creator='Z.ai',
        subject='Data investigation analysis report'
    )
    
    styles = getSampleStyleSheet()
    
    # Define styles
    cover_title = ParagraphStyle(
        name='CoverTitle',
        fontName='Times New Roman',
        fontSize=32,
        leading=40,
        alignment=TA_CENTER,
        textColor=HEADER_BG,
        spaceAfter=30
    )
    
    cover_subtitle = ParagraphStyle(
        name='CoverSubtitle',
        fontName='Times New Roman',
        fontSize=16,
        leading=22,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#64748B'),
        spaceAfter=20
    )
    
    section_header = ParagraphStyle(
        name='SectionHeader',
        fontName='Times New Roman',
        fontSize=14,
        leading=20,
        alignment=TA_LEFT,
        textColor=HEADER_BG,
        spaceBefore=16,
        spaceAfter=8
    )
    
    subheader_style = ParagraphStyle(
        name='SubHeader',
        fontName='Times New Roman',
        fontSize=12,
        leading=16,
        alignment=TA_LEFT,
        textColor=colors.HexColor('#334155'),
        spaceBefore=10,
        spaceAfter=4
    )
    
    body_style = ParagraphStyle(
        name='BodyText',
        fontName='Times New Roman',
        fontSize=10,
        leading=14,
        alignment=TA_LEFT,
        textColor=colors.black,
        spaceBefore=3,
        spaceAfter=6
    )
    
    header_style = ParagraphStyle(
        name='TableHeader',
        fontName='Times New Roman',
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
        textColor=HEADER_TEXT
    )
    
    cell_style = ParagraphStyle(
        name='TableCell',
        fontName='Times New Roman',
        fontSize=8,
        leading=11,
        alignment=TA_LEFT,
        textColor=colors.black
    )
    
    cell_center = ParagraphStyle(
        name='TableCellCenter',
        fontName='Times New Roman',
        fontSize=8,
        leading=11,
        alignment=TA_CENTER,
        textColor=colors.black
    )
    
    caption_style = ParagraphStyle(
        name='Caption',
        fontName='Times New Roman',
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#64748B'),
        spaceBefore=3,
        spaceAfter=10
    )
    
    story = []
    
    # === COVER PAGE ===
    story.append(Spacer(1, 60))
    story.append(Paragraph('<b>Investigation Findings Report</b>', cover_title))
    story.append(Spacer(1, 16))
    story.append(Paragraph('Comprehensive Data Analysis & Entity Correlation', cover_subtitle))
    story.append(Spacer(1, 30))
    
    # Query box
    query_text = "${escapePy(query)}"
    story.append(Paragraph('<b>Search Query:</b>', subheader_style))
    story.append(Paragraph('"' + query_text + '"', body_style))
    
    story.append(Spacer(1, 20))
    
    # Metadata summary table
    meta_data = [
        [Paragraph('<b>Metric</b>', header_style), Paragraph('<b>Value</b>', header_style)],
        [Paragraph('Generated', cell_style), Paragraph('${formatDate()}', cell_center)],
        [Paragraph('Total Results', cell_style), Paragraph('${results.length}', cell_center)],
        [Paragraph('Total Fetched', cell_style), Paragraph('${metadata.totalFetched.toLocaleString()}', cell_center)],
        [Paragraph('API Calls', cell_style), Paragraph('${metadata.apiCalls}', cell_center)],
        [Paragraph('Duration', cell_style), Paragraph('${(metadata.duration / 1000).toFixed(2)}s', cell_center)],
        [Paragraph('Iterations', cell_style), Paragraph('${metadata.iterations}', cell_center)],
        [Paragraph('Duplicates Removed', cell_style), Paragraph('${metadata.duplicatesRemoved}', cell_center)],
        [Paragraph('AI Model Used', cell_style), Paragraph('${escapePy(insights.aiModel)}', cell_center)],
    ]
    
    meta_table = Table(meta_data, colWidths=[5.5*cm, 5.5*cm])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_TEXT),
        ('BACKGROUND', (0, 1), (-1, -1), ROW_ODD),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    
    story.append(PageBreak())
    
    # === EXECUTIVE SUMMARY ===
    story.append(Paragraph('<b>1. Executive Summary</b>', section_header))
    
    summary_text = "${escapePy(insights.summary)}"
    story.append(Paragraph(summary_text, body_style))
    
    # Key patterns
    if ${insights.patterns.length} > 0:
        story.append(Paragraph('<b>Key Patterns Detected:</b>', subheader_style))
${patternsText}
    
    # Recommendations
    if ${insights.recommendations.length} > 0:
        story.append(Paragraph('<b>Recommendations:</b>', subheader_style))
${recommendationsText}
    
    story.append(Spacer(1, 12))
    
    # === ENTITY ANALYSIS ===
    story.append(Paragraph('<b>2. Entity Analysis</b>', section_header))
    
    story.append(Paragraph('Total entities discovered: ${graph.nodes.length}', body_style))
    story.append(Paragraph('Total connections found: ${graph.edges.length}', body_style))
    story.append(Paragraph('Entity clusters identified: ${graph.clusters.length}', body_style))
    
    story.append(Spacer(1, 8))
    
    # Entity connections table
    if ${insights.entityConnections.length} > 0:
        story.append(Paragraph('<b>Top Entity Connections:</b>', subheader_style))
        
        entity_data = [
            [Paragraph('<b>Entity</b>', header_style), 
             Paragraph('<b>Type</b>', header_style), 
             Paragraph('<b>Count</b>', header_style),
             Paragraph('<b>Source Tables</b>', header_style)],
${entityConnectionsRows}
        ]
        
        entity_table = Table(entity_data, colWidths=[4*cm, 2.2*cm, 1.8*cm, 5*cm])
        entity_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
            ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_TEXT),
            ('BACKGROUND', (0, 1), (-1, 1), ROW_EVEN),
            ('BACKGROUND', (0, 2), (-1, 2), ROW_ODD),
            ('BACKGROUND', (0, 3), (-1, 3), ROW_EVEN),
            ('BACKGROUND', (0, 4), (-1, 4), ROW_ODD),
            ('BACKGROUND', (0, 5), (-1, 5), ROW_EVEN),
            ('BACKGROUND', (0, 6), (-1, 6), ROW_ODD),
            ('BACKGROUND', (0, 7), (-1, 7), ROW_EVEN),
            ('BACKGROUND', (0, 8), (-1, 8), ROW_ODD),
            ('BACKGROUND', (0, 9), (-1, 9), ROW_EVEN),
            ('BACKGROUND', (0, 10), (-1, 10), ROW_ODD),
            ('BACKGROUND', (0, 11), (-1, 11), ROW_EVEN),
            ('BACKGROUND', (0, 12), (-1, 12), ROW_ODD),
            ('BACKGROUND', (0, 13), (-1, 13), ROW_EVEN),
            ('BACKGROUND', (0, 14), (-1, 14), ROW_ODD),
            ('BACKGROUND', (0, 15), (-1, 15), ROW_EVEN),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        story.append(entity_table)
        story.append(Paragraph('Table 1: Top entity connections found in the investigation', caption_style))
    
    story.append(PageBreak())
    
    # === DETAILED RESULTS ===
    story.append(Paragraph('<b>3. Detailed Results</b>', section_header))
    
    story.append(Paragraph('Total filtered results: ${results.length}', body_style))
    story.append(Paragraph('Primary search term: "${escapePy(metadata.primarySearchTerm)}"', body_style))
    
    discovered_text = "${escapePy(discoveredEntitiesText)}"
    if discovered_text:
        story.append(Paragraph('<b>Discovered Entities:</b>', subheader_style))
        story.append(Paragraph(discovered_text, body_style))
    
    story.append(Spacer(1, 8))
    
    # Results by table
    story.append(Paragraph('<b>Results by Data Source:</b>', subheader_style))
    
${tableGroupsCode}
    
    story.append(PageBreak())
    
    # === CLUSTER ANALYSIS ===
    story.append(Paragraph('<b>4. Cluster Analysis</b>', section_header))
    
    if ${graph.clusters.length} > 0:
        story.append(Paragraph('${graph.clusters.length} entity clusters were identified during the analysis.', body_style))
        
${clustersCode}
    else:
        story.append(Paragraph('No significant entity clusters were identified in this investigation.', body_style))
    
    story.append(Spacer(1, 12))
    
    # === METHODOLOGY ===
    story.append(Paragraph('<b>5. Methodology</b>', section_header))
    
    story.append(Paragraph(
        'This investigation was conducted using an AI-powered iterative search approach:',
        body_style
    ))
    
    story.append(Paragraph('1. <b>Entity Extraction:</b> The search query was analyzed to extract high-value identifiers (phone numbers, email addresses, ID numbers, account numbers) and medium-value identifiers (specific addresses).', body_style))
    story.append(Paragraph('2. <b>Iterative Search:</b> High-value entities were searched first, followed by discovery of new identifiers from the results.', body_style))
    story.append(Paragraph('3. <b>Full Pagination:</b> All available results were fetched using cursor-based pagination.', body_style))
    story.append(Paragraph('4. <b>Deduplication:</b> Semantic similarity was used to identify and remove duplicate records while preserving records from different source tables.', body_style))
    story.append(Paragraph('5. <b>Graph Construction:</b> A correlation graph was built to visualize entity relationships and identify clusters.', body_style))
    story.append(Paragraph('6. <b>AI Insights:</b> Local AI models were used to generate insights and recommendations.', body_style))
    
    if ${insights.localAIUsed ? 'True' : 'False'}:
        story.append(Paragraph('<b>AI Model:</b> ${escapePy(insights.aiModel)} was used for enhanced entity extraction and insight generation.', body_style))
    
    story.append(Spacer(1, 12))
    
    # === CONFIDENCE ASSESSMENT ===
    story.append(Paragraph('<b>6. Confidence Assessment</b>', section_header))
    
    confidence_percent = ${Math.round(insights.confidence * 100)}
    story.append(Paragraph('Overall confidence score: <b>' + str(confidence_percent) + '%</b>', body_style))
    
    confidence_desc = ""
    if ${insights.confidence} >= 0.8:
        confidence_desc = 'High confidence - results are well-corroborated across multiple data sources.'
    elif ${insights.confidence} >= 0.6:
        confidence_desc = 'Moderate confidence - results show reasonable consistency but may benefit from additional verification.'
    else:
        confidence_desc = 'Lower confidence - results should be verified with additional sources before drawing conclusions.'
    story.append(Paragraph(confidence_desc, body_style))
    
    # Build PDF
    doc.build(story)
    print("PDF created successfully:", output_path)
    return output_path

if __name__ == '__main__':
    output = "${escapePy(outputPath)}"
    build_report(output)
`;
}

function generateTableGroupsCode(results: FilteredResult[], escapePy: (s: string) => string): string {
  const tableGroups = new Map<string, FilteredResult[]>();
  
  for (const result of results) {
    if (!tableGroups.has(result.table)) {
      tableGroups.set(result.table, []);
    }
    tableGroups.get(result.table)!.push(result);
  }
  
  const lines: string[] = [];
  
  tableGroups.forEach((records, tableName) => {
    const tableNameEscaped = escapePy(tableName);
    lines.push(`    story.append(Paragraph("<b>${tableNameEscaped}</b> (${records.length} records)", body_style))`);
    
    const topRecords = records.slice(0, 5);
    for (let i = 0; i < topRecords.length; i++) {
      const rec = topRecords[i];
      const fields = Object.entries(rec.record)
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 25)}`)
        .join(' | ');
      const fieldsEscaped = escapePy(fields);
      const more = Object.keys(rec.record).length > 4 ? '...' : '';
      lines.push(`    story.append(Paragraph("${i + 1}. ${fieldsEscaped}${more}", body_style))`);
    }
    
    if (records.length > 5) {
      lines.push(`    story.append(Paragraph("   ... and ${records.length - 5} more records", body_style))`);
    }
    lines.push('    story.append(Spacer(1, 6))');
  });
  
  return lines.join('\n');
}
