/**
 * Investigation Report PDF Generator
 * Creates curated, professional investigation reports with AI insights
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InvestigationReport, ReportFinding } from './ollama-client';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface ReportGeneratorOptions {
  includeGraph?: boolean;
  includeRawData?: boolean;
  classification?: 'CONFIDENTIAL' | 'SECRET' | 'TOP SECRET' | 'UNCLASSIFIED';
  organization?: string;
  caseNumber?: string;
  investigatorName?: string;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    occurrences: number;
    connections: string[];
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

// ============================================================================
// COLORS AND STYLING
// ============================================================================

const COLORS = {
  primary: [31, 78, 121],        // Dark blue
  secondary: [68, 114, 196],     // Medium blue
  accent: [237, 125, 49],        // Orange
  success: [84, 130, 53],        // Green
  warning: [255, 192, 0],        // Yellow
  danger: [192, 0, 0],           // Red
  text: [51, 51, 51],            // Dark gray
  lightGray: [240, 240, 240],    // Light gray
  white: [255, 255, 255],
};

const SEVERITY_COLORS = {
  low: COLORS.success,
  medium: COLORS.warning,
  high: [255, 153, 0],           // Orange
  critical: COLORS.danger,
};

// ============================================================================
// REPORT GENERATOR CLASS
// ============================================================================

export class InvestigationReportGenerator {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number;
  private currentY: number;
  private options: ReportGeneratorOptions;
  private pageNumber: number;

  constructor(options: ReportGeneratorOptions = {}) {
    this.doc = new jsPDF('p', 'mm', 'a4');
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.margin = 15;
    this.currentY = this.margin;
    this.pageNumber = 1;
    this.options = {
      includeGraph: true,
      includeRawData: false,
      classification: 'CONFIDENTIAL',
      organization: 'Investigation Unit',
      ...options,
    };
  }

  /**
   * Generate complete investigation report
   */
  async generate(
    report: InvestigationReport,
    graphData?: GraphData,
    searchResults?: any[]
  ): Promise<Buffer> {
    // Cover page
    this.addCoverPage(report);

    // New page for content
    this.doc.addPage();
    this.pageNumber++;
    this.currentY = this.margin;

    // Add header
    this.addHeader();

    // Table of Contents
    this.addTableOfContents();

    // Executive Summary
    this.doc.addPage();
    this.pageNumber++;
    this.currentY = this.margin;
    this.addSection('1. Executive Summary', report.executiveSummary);

    // Methodology
    this.addSection('2. Methodology', report.methodology);

    // Findings
    this.addFindingsSection(report.findings);

    // Entity Analysis
    this.addEntityAnalysisSection(report.entityAnalysis);

    // Relationship Analysis
    this.addRelationshipAnalysisSection(report.relationshipAnalysis);

    // Correlation Graph
    if (this.options.includeGraph && graphData) {
      this.addGraphSection(graphData);
    }

    // Recommendations
    this.addRecommendationsSection(report.recommendations);

    // Risk Assessment
    this.addRiskAssessmentSection(report.riskAssessment);

    // Conclusion
    this.addSection('10. Conclusion', report.conclusion);

    // Raw Data (optional)
    if (this.options.includeRawData && searchResults && searchResults.length > 0) {
      this.addRawDataSection(searchResults);
    }

    // Add footer to all pages
    this.addFooters();

    // Add page numbers
    this.addPageNumbers();

    // Return as buffer
    return Buffer.from(this.doc.output('arraybuffer'));
  }

  /**
   * Add cover page
   */
  private addCoverPage(report: InvestigationReport): void {
    // Classification banner
    this.doc.setFillColor(...COLORS.danger);
    this.doc.rect(0, 0, this.pageWidth, 12, 'F');
    this.doc.setFontSize(10);
    this.doc.setTextColor(...COLORS.white);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.options.classification || 'CONFIDENTIAL', this.pageWidth / 2, 8, { align: 'center' });

    // Title
    this.doc.setFontSize(28);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    const titleLines = this.doc.splitTextToSize(report.title, this.pageWidth - 40);
    this.doc.text(titleLines, this.pageWidth / 2, 60, { align: 'center' });

    // Subtitle
    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.text);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text('Investigation Analysis Report', this.pageWidth / 2, 80, { align: 'center' });

    // Metadata
    this.doc.setFontSize(11);
    this.doc.setTextColor(...COLORS.text);
    const metadata = [
      `Organization: ${this.options.organization}`,
      `Case Number: ${this.options.caseNumber || 'N/A'}`,
      `Investigator: ${this.options.investigatorName || 'Automated Analysis'}`,
      `Generated: ${new Date().toLocaleString()}`,
      `AI Model: ${report.modelUsed}`,
    ];

    let yPos = 100;
    for (const line of metadata) {
      this.doc.text(line, this.pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;
    }

    // Risk indicator box
    const riskColor = SEVERITY_COLORS[report.riskAssessment.overallRisk] || COLORS.warning;
    this.doc.setFillColor(...riskColor);
    this.doc.roundedRect(this.pageWidth / 2 - 30, yPos + 10, 60, 20, 3, 3, 'F');
    this.doc.setFontSize(12);
    this.doc.setTextColor(...COLORS.white);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(
      `RISK: ${report.riskAssessment.overallRisk.toUpperCase()}`,
      this.pageWidth / 2,
      yPos + 22,
      { align: 'center' }
    );

    // Footer
    this.doc.setFontSize(9);
    this.doc.setTextColor(...COLORS.text);
    this.doc.setFont('helvetica', 'italic');
    this.doc.text(
      'This report was generated using AI-powered analysis with regex-based entity extraction.',
      this.pageWidth / 2,
      this.pageHeight - 30,
      { align: 'center' }
    );
    this.doc.text(
      'Classification: CONFIDENTIAL - For authorized personnel only',
      this.pageWidth / 2,
      this.pageHeight - 20,
      { align: 'center' }
    );
  }

  /**
   * Add header to page
   */
  private addHeader(): void {
    // Header bar
    this.doc.setFillColor(...COLORS.primary);
    this.doc.rect(0, 0, this.pageWidth, 8, 'F');

    // Header text
    this.doc.setFontSize(8);
    this.doc.setTextColor(...COLORS.white);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.options.classification || 'CONFIDENTIAL', this.margin, 5);
    this.doc.text(
      `Investigation Report - ${this.options.caseNumber || 'Case File'}`,
      this.pageWidth - this.margin,
      5,
      { align: 'right' }
    );

    this.currentY = 15;
  }

  /**
   * Add table of contents
   */
  private addTableOfContents(): void {
    this.doc.setFontSize(16);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Table of Contents', this.margin, this.currentY);
    this.currentY += 10;

    const tocItems = [
      '1. Executive Summary',
      '2. Methodology',
      '3. Findings',
      '4. Entity Analysis',
      '5. Relationship Analysis',
      '6. Correlation Graph',
      '7. Recommendations',
      '8. Risk Assessment',
      '9. Conclusion',
    ];

    this.doc.setFontSize(11);
    this.doc.setTextColor(...COLORS.text);
    this.doc.setFont('helvetica', 'normal');

    for (const item of tocItems) {
      this.doc.text(item, this.margin + 5, this.currentY);
      this.currentY += 7;
    }
  }

  /**
   * Add section with title and content
   */
  private addSection(title: string, content: string): void {
    this.checkPageBreak(30);

    // Section title
    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.margin, this.currentY);
    this.currentY += 8;

    // Section content
    this.doc.setFontSize(10);
    this.doc.setTextColor(...COLORS.text);
    this.doc.setFont('helvetica', 'normal');

    const lines = this.doc.splitTextToSize(content, this.pageWidth - 2 * this.margin);
    this.doc.text(lines, this.margin, this.currentY);
    this.currentY += lines.length * 5 + 8;
  }

  /**
   * Add findings section with severity indicators
   */
  private addFindingsSection(findings: ReportFinding[]): void {
    this.checkPageBreak(40);

    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('3. Findings', this.margin, this.currentY);
    this.currentY += 10;

    if (findings.length === 0) {
      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'italic');
      this.doc.text('No significant findings were identified during this investigation.', this.margin, this.currentY);
      this.currentY += 10;
      return;
    }

    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      this.checkPageBreak(30);

      // Finding header with severity
      const severityColor = SEVERITY_COLORS[finding.severity] || COLORS.warning;
      this.doc.setFillColor(...severityColor);
      this.doc.roundedRect(this.margin, this.currentY, 8, 5, 1, 1, 'F');

      this.doc.setFontSize(11);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(`Finding ${i + 1}: ${finding.category}`, this.margin + 12, this.currentY + 4);

      // Severity badge
      this.doc.setFontSize(8);
      this.doc.setTextColor(...severityColor);
      this.doc.text(finding.severity.toUpperCase(), this.pageWidth - this.margin - 20, this.currentY + 4);
      this.currentY += 8;

      // Description
      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'normal');
      const descLines = this.doc.splitTextToSize(finding.description, this.pageWidth - 2 * this.margin);
      this.doc.text(descLines, this.margin, this.currentY);
      this.currentY += descLines.length * 5 + 4;

      // Evidence
      if (finding.evidence && finding.evidence.length > 0) {
        this.doc.setFontSize(9);
        this.doc.setTextColor(...COLORS.secondary);
        this.doc.setFont('helvetica', 'italic');
        this.doc.text('Evidence:', this.margin, this.currentY);
        this.currentY += 4;

        for (const evidence of finding.evidence.slice(0, 3)) {
          const evLines = this.doc.splitTextToSize(`• ${evidence}`, this.pageWidth - 2 * this.margin - 5);
          this.doc.text(evLines, this.margin + 5, this.currentY);
          this.currentY += evLines.length * 4 + 2;
        }
      }

      this.currentY += 6;
    }
  }

  /**
   * Add entity analysis section
   */
  private addEntityAnalysisSection(analysis: any): void {
    this.checkPageBreak(40);

    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('4. Entity Analysis', this.margin, this.currentY);
    this.currentY += 10;

    // Summary
    if (analysis.summary) {
      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'normal');
      const summaryLines = this.doc.splitTextToSize(analysis.summary, this.pageWidth - 2 * this.margin);
      this.doc.text(summaryLines, this.margin, this.currentY);
      this.currentY += summaryLines.length * 5 + 8;
    }

    // Entity breakdown table
    if (analysis.entityBreakdown && analysis.entityBreakdown.length > 0) {
      autoTable(this.doc, {
        startY: this.currentY,
        head: [['Entity Type', 'Count', 'Significance']],
        body: analysis.entityBreakdown.map((e: any) => [
          e.type,
          e.count.toString(),
          e.significance,
        ]),
        margin: { left: this.margin, right: this.margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
        alternateRowStyles: { fillColor: COLORS.lightGray },
      });
      // @ts-ignore
      this.currentY = this.doc.lastAutoTable.finalY + 10;
    }

    // Key entities
    if (analysis.keyEntities && analysis.keyEntities.length > 0) {
      this.doc.setFontSize(11);
      this.doc.setTextColor(...COLORS.primary);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text('Key Entities:', this.margin, this.currentY);
      this.currentY += 6;

      for (const entity of analysis.keyEntities) {
        this.doc.setFontSize(10);
        this.doc.setTextColor(...COLORS.text);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(`${entity.value} (${entity.type})`, this.margin + 5, this.currentY);
        this.currentY += 5;

        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(9);
        const analysisLines = this.doc.splitTextToSize(entity.analysis, this.pageWidth - 2 * this.margin - 10);
        this.doc.text(analysisLines, this.margin + 5, this.currentY);
        this.currentY += analysisLines.length * 4 + 4;
      }
    }
  }

  /**
   * Add relationship analysis section
   */
  private addRelationshipAnalysisSection(analysis: any): void {
    this.checkPageBreak(40);

    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('5. Relationship Analysis', this.margin, this.currentY);
    this.currentY += 10;

    // Summary
    if (analysis.summary) {
      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'normal');
      const summaryLines = this.doc.splitTextToSize(analysis.summary, this.pageWidth - 2 * this.margin);
      this.doc.text(summaryLines, this.margin, this.currentY);
      this.currentY += summaryLines.length * 5 + 8;
    }

    // Connections table
    if (analysis.connections && analysis.connections.length > 0) {
      autoTable(this.doc, {
        startY: this.currentY,
        head: [['Entity 1', 'Entity 2', 'Relationship', 'Strength']],
        body: analysis.connections.slice(0, 15).map((c: any) => [
          c.entity1,
          c.entity2,
          c.relationship,
          c.strength,
        ]),
        margin: { left: this.margin, right: this.margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
        alternateRowStyles: { fillColor: COLORS.lightGray },
      });
      // @ts-ignore
      this.currentY = this.doc.lastAutoTable.finalY + 10;
    }

    // Clusters
    if (analysis.clusters && analysis.clusters.length > 0) {
      this.doc.setFontSize(11);
      this.doc.setTextColor(...COLORS.primary);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text('Identified Clusters:', this.margin, this.currentY);
      this.currentY += 6;

      for (const cluster of analysis.clusters.slice(0, 5)) {
        this.doc.setFontSize(10);
        this.doc.setTextColor(...COLORS.text);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(cluster.name, this.margin + 5, this.currentY);
        this.currentY += 5;

        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(9);
        const entityList = cluster.entities.slice(0, 5).join(', ');
        this.doc.text(`Entities: ${entityList}${cluster.entities.length > 5 ? '...' : ''}`, this.margin + 10, this.currentY);
        this.currentY += 4;

        const descLines = this.doc.splitTextToSize(cluster.description, this.pageWidth - 2 * this.margin - 15);
        this.doc.text(descLines, this.margin + 10, this.currentY);
        this.currentY += descLines.length * 4 + 4;
      }
    }
  }

  /**
   * Add correlation graph section (simplified visualization)
   */
  private addGraphSection(graphData: GraphData): void {
    this.checkPageBreak(60);

    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('6. Correlation Graph Analysis', this.margin, this.currentY);
    this.currentY += 10;

    // Graph statistics
    this.doc.setFontSize(10);
    this.doc.setTextColor(...COLORS.text);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(`Total Nodes: ${graphData.nodes.length}`, this.margin, this.currentY);
    this.doc.text(`Total Connections: ${graphData.edges.length}`, this.margin + 50, this.currentY);
    this.currentY += 8;

    // Top connected nodes table
    const topNodes = [...graphData.nodes]
      .sort((a, b) => b.connections.length - a.connections.length)
      .slice(0, 10);

    if (topNodes.length > 0) {
      autoTable(this.doc, {
        startY: this.currentY,
        head: [['Entity', 'Type', 'Connections', 'Occurrences']],
        body: topNodes.map(n => [
          n.label,
          n.type,
          n.connections.length.toString(),
          n.occurrences.toString(),
        ]),
        margin: { left: this.margin, right: this.margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
        alternateRowStyles: { fillColor: COLORS.lightGray },
      });
      // @ts-ignore
      this.currentY = this.doc.lastAutoTable.finalY + 10;
    }

    // Draw simplified network visualization
    this.drawNetworkVisualization(graphData);
  }

  /**
   * Draw simplified network visualization
   */
  private drawNetworkVisualization(graphData: GraphData): void {
    this.checkPageBreak(80);

    this.doc.setFontSize(11);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Network Visualization:', this.margin, this.currentY);
    this.currentY += 8;

    const centerX = this.pageWidth / 2;
    const centerY = this.currentY + 40;
    const radius = 35;

    // Get top connected nodes for visualization
    const topNodes = [...graphData.nodes]
      .sort((a, b) => b.connections.length - a.connections.length)
      .slice(0, 8);

    if (topNodes.length < 2) {
      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'italic');
      this.doc.text('Insufficient data for visualization', this.margin, this.currentY);
      this.currentY += 10;
      return;
    }

    // Draw nodes in a circle
    const nodePositions: { [key: string]: { x: number; y: number } } = {};

    topNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / topNodes.length;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      nodePositions[node.id] = { x, y };

      // Draw node
      const nodeSize = Math.min(6 + node.connections.length, 10);
      const nodeColor = this.getNodeColor(node.type);
      this.doc.setFillColor(...nodeColor);
      this.doc.circle(x, y, nodeSize / 2, 'F');

      // Draw label
      this.doc.setFontSize(7);
      this.doc.setTextColor(...COLORS.text);
      const label = node.label.length > 12 ? node.label.substring(0, 10) + '...' : node.label;
      this.doc.text(label, x, y + nodeSize / 2 + 3, { align: 'center' });
    });

    // Draw edges
    this.doc.setDrawColor(...COLORS.secondary);
    this.doc.setLineWidth(0.2);

    for (const edge of graphData.edges) {
      const sourcePos = nodePositions[edge.source];
      const targetPos = nodePositions[edge.target];

      if (sourcePos && targetPos) {
        this.doc.line(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y);
      }
    }

    this.currentY = centerY + radius + 20;
  }

  /**
   * Get color for node type
   */
  private getNodeColor(type: string): number[] {
    const typeColors: { [key: string]: number[] } = {
      phone: COLORS.accent,
      email: COLORS.secondary,
      person: COLORS.primary,
      address: COLORS.success,
      account: COLORS.warning,
      other: COLORS.text,
    };
    return typeColors[type] || typeColors.other;
  }

  /**
   * Add recommendations section
   */
  private addRecommendationsSection(recommendations: string[]): void {
    this.checkPageBreak(30);

    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('7. Recommendations', this.margin, this.currentY);
    this.currentY += 10;

    if (recommendations.length === 0) {
      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'italic');
      this.doc.text('No specific recommendations at this time.', this.margin, this.currentY);
      this.currentY += 10;
      return;
    }

    for (let i = 0; i < recommendations.length; i++) {
      this.checkPageBreak(15);

      // Numbered bullet
      this.doc.setFillColor(...COLORS.secondary);
      this.doc.circle(this.margin + 3, this.currentY + 1.5, 2, 'F');

      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(`${i + 1}.`, this.margin + 6, this.currentY + 3);

      const recLines = this.doc.splitTextToSize(recommendations[i], this.pageWidth - 2 * this.margin - 12);
      this.doc.text(recLines, this.margin + 12, this.currentY + 3);
      this.currentY += recLines.length * 5 + 6;
    }
  }

  /**
   * Add risk assessment section
   */
  private addRiskAssessmentSection(risk: any): void {
    this.checkPageBreak(50);

    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('8. Risk Assessment', this.margin, this.currentY);
    this.currentY += 10;

    // Risk level indicator
    const riskColor = SEVERITY_COLORS[risk.overallRisk] || COLORS.warning;
    this.doc.setFillColor(...riskColor);
    this.doc.roundedRect(this.margin, this.currentY, 40, 12, 2, 2, 'F');

    this.doc.setFontSize(12);
    this.doc.setTextColor(...COLORS.white);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(risk.overallRisk.toUpperCase(), this.margin + 20, this.currentY + 8, { align: 'center' });

    // Confidence score
    this.doc.setFontSize(10);
    this.doc.setTextColor(...COLORS.text);
    this.doc.text(`Confidence Score: ${(risk.confidenceScore * 100).toFixed(0)}%`, this.margin + 50, this.currentY + 8);
    this.currentY += 20;

    // Risk factors
    if (risk.riskFactors && risk.riskFactors.length > 0) {
      this.doc.setFontSize(11);
      this.doc.setTextColor(...COLORS.primary);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text('Risk Factors:', this.margin, this.currentY);
      this.currentY += 6;

      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'normal');

      for (const factor of risk.riskFactors) {
        const factorLines = this.doc.splitTextToSize(`• ${factor}`, this.pageWidth - 2 * this.margin - 5);
        this.doc.text(factorLines, this.margin + 5, this.currentY);
        this.currentY += factorLines.length * 5 + 2;
      }
      this.currentY += 4;
    }

    // Mitigation suggestions
    if (risk.mitigationSuggestions && risk.mitigationSuggestions.length > 0) {
      this.doc.setFontSize(11);
      this.doc.setTextColor(...COLORS.primary);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text('Mitigation Suggestions:', this.margin, this.currentY);
      this.currentY += 6;

      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'normal');

      for (const suggestion of risk.mitigationSuggestions) {
        const suggestionLines = this.doc.splitTextToSize(`• ${suggestion}`, this.pageWidth - 2 * this.margin - 5);
        this.doc.text(suggestionLines, this.margin + 5, this.currentY);
        this.currentY += suggestionLines.length * 5 + 2;
      }
    }
  }

  /**
   * Add raw data section
   */
  private addRawDataSection(results: any[]): void {
    this.doc.addPage();
    this.pageNumber++;
    this.currentY = this.margin;
    this.addHeader();

    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Appendix: Raw Search Results', this.margin, this.currentY);
    this.currentY += 10;

    // Limit to first 50 results
    const limitedResults = results.slice(0, 50);

    autoTable(this.doc, {
      startY: this.currentY,
      head: [['Table', 'Matched Fields', 'Score']],
      body: limitedResults.map(r => [
        r.tableName,
        r.matchedFields?.join(', ') || '-',
        r.score?.toFixed(2) || '-',
      ]),
      margin: { left: this.margin, right: this.margin },
      styles: { fontSize: 8 },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
      alternateRowStyles: { fillColor: COLORS.lightGray },
    });
  }

  /**
   * Check if new page is needed
   */
  private checkPageBreak(requiredSpace: number): void {
    if (this.currentY + requiredSpace > this.pageHeight - this.margin - 15) {
      this.doc.addPage();
      this.pageNumber++;
      this.currentY = this.margin;
      this.addHeader();
    }
  }

  /**
   * Add footers to all pages
   */
  private addFooters(): void {
    const totalPages = this.doc.getNumberOfPages();

    for (let i = 2; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'italic');
      this.doc.text(
        `Generated by Investigation Platform | Classification: ${this.options.classification}`,
        this.pageWidth / 2,
        this.pageHeight - 10,
        { align: 'center' }
      );
    }
  }

  /**
   * Add page numbers
   */
  private addPageNumbers(): void {
    const totalPages = this.doc.getNumberOfPages();

    for (let i = 2; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(9);
      this.doc.setTextColor(...COLORS.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(
        `Page ${i - 1} of ${totalPages - 1}`,
        this.pageWidth - this.margin,
        this.pageHeight - 10,
        { align: 'right' }
      );
    }
  }
}

// Export singleton instance
export const reportGenerator = new InvestigationReportGenerator();
