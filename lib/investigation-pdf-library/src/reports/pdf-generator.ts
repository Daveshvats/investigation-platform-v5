/**
 * Investigation PDF Generator
 * Comprehensive PDF generation for investigation reports
 */

import {
  PDFDocument,
  PDFPage,
  rgb,
  StandardFonts,
  PDFFont,
  PDFImage,
} from 'pdf-lib';

import {
  PDFReportConfig,
  ReportSection,
  SectionContent,
  BaseEntity,
  Relationship,
  DetectedPattern,
  TimelineEvent,
  EntityCluster,
  CorrelationStatistics,
  DataQualityReport,
  NetworkGraphConfig,
  ChartConfig,
} from '../core/types';

import {
  formatDate,
  formatNumber,
  truncateString,
  getEntityTypeDisplayName,
  getEntityTypeColor,
  getSeverityColor,
  escapeXml,
} from '../utils/helpers';

export interface PDFGeneratorOptions {
  fontRegular?: Uint8Array | ArrayBuffer;
  fontBold?: Uint8Array | ArrayBuffer;
  logoImage?: Uint8Array | ArrayBuffer;
}

export class InvestigationPDFGenerator {
  private doc: PDFDocument | null = null;
  private fontRegular: PDFFont | null = null;
  private fontBold: PDFFont | null = null;
  private logoImage: PDFImage | null = null;
  private currentPage: PDFPage | null = null;
  private yPosition: number = 0;
  private pageHeight: number = 792; // Letter size
  private pageWidth: number = 612; // Letter size
  private margin: number = 50;
  private lineHeight: number = 14;
  private config: PDFReportConfig | null = null;
  private pageNumber: number = 0;
  private totalPages: number = 0;

  constructor(private options?: PDFGeneratorOptions) {}

  /**
   * Generate a complete investigation report PDF
   */
  public async generateReport(
    config: PDFReportConfig,
    sections: ReportSection[]
  ): Promise<Uint8Array> {
    this.config = config;
    this.doc = await PDFDocument.create();
    this.pageNumber = 0;

    // Load fonts
    await this.loadFonts();

    // Load logo if provided
    if (this.options?.logoImage) {
      this.logoImage = await this.doc.embedPng(this.options.logoImage);
    }

    // Create cover page
    await this.createCoverPage();

    // Create table of contents if requested
    if (config.tableOfContents) {
      await this.createTableOfContents(sections);
    }

    // Generate each section
    for (const section of sections) {
      await this.generateSection(section);
    }

    // Add page numbers to all pages
    this.addPageNumbers();

    // Set PDF metadata
    this.setMetadata();

    return await this.doc!.save();
  }

  /**
   * Load custom fonts or use standard fonts
   */
  private async loadFonts(): Promise<void> {
    if (this.options?.fontRegular) {
      this.fontRegular = await this.doc!.embedFont(this.options.fontRegular);
    } else {
      this.fontRegular = await this.doc!.embedFont(StandardFonts.Helvetica);
    }

    if (this.options?.fontBold) {
      this.fontBold = await this.doc!.embedFont(this.options.fontBold);
    } else {
      this.fontBold = await this.doc!.embedFont(StandardFonts.HelveticaBold);
    }
  }

  /**
   * Create cover page
   */
  private async createCoverPage(): Promise<void> {
    this.addNewPage();
    this.yPosition = this.pageHeight - 100;

    // Add logo
    if (this.logoImage && this.config?.logo) {
      const logoConfig = this.config.logo;
      this.currentPage!.drawImage(this.logoImage, {
        x: this.margin,
        y: this.yPosition - logoConfig.height,
        width: logoConfig.width,
        height: logoConfig.height,
      });
      this.yPosition -= logoConfig.height + 20;
    }

    // Add classification banner if classified
    if (this.config?.classification && this.config.classification !== 'UNCLASSIFIED') {
      this.drawClassificationBanner();
    }

    // Add title
    const title = this.config?.title || 'Investigation Report';
    this.yPosition -= 40;
    this.drawText(title, this.margin, this.yPosition, {
      font: this.fontBold!,
      size: 28,
      color: rgb(0.1, 0.2, 0.4),
    });

    // Add subtitle
    if (this.config?.subtitle) {
      this.yPosition -= 25;
      this.drawText(this.config.subtitle, this.margin, this.yPosition, {
        font: this.fontRegular!,
        size: 16,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    // Add case number
    if (this.config?.caseNumber) {
      this.yPosition -= 25;
      this.drawText(`Case Number: ${this.config.caseNumber}`, this.margin, this.yPosition, {
        font: this.fontRegular!,
        size: 12,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    // Add date
    this.yPosition -= 30;
    const dateStr = formatDate(this.config?.date || new Date(), 'long');
    this.drawText(`Date: ${dateStr}`, this.margin, this.yPosition, {
      font: this.fontRegular!,
      size: 12,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Add prepared by
    if (this.config?.preparedBy) {
      this.yPosition -= 40;
      this.drawText('Prepared by:', this.margin, this.yPosition, {
        font: this.fontBold!,
        size: 11,
        color: rgb(0.3, 0.3, 0.3),
      });
      this.yPosition -= 18;
      this.drawText(this.config.preparedBy.name, this.margin + 20, this.yPosition, {
        font: this.fontRegular!,
        size: 11,
        color: rgb(0.3, 0.3, 0.3),
      });
      if (this.config.preparedBy.title) {
        this.yPosition -= 14;
        this.drawText(this.config.preparedBy.title, this.margin + 20, this.yPosition, {
          font: this.fontRegular!,
          size: 10,
          color: rgb(0.4, 0.4, 0.4),
        });
      }
    }

    // Add organization
    if (this.config?.organization) {
      this.yPosition -= 40;
      this.drawText(this.config.organization.name, this.margin, this.yPosition, {
        font: this.fontBold!,
        size: 12,
        color: rgb(0.2, 0.2, 0.2),
      });
      if (this.config.organization.address) {
        this.yPosition -= 16;
        this.drawText(this.config.organization.address, this.margin, this.yPosition, {
          font: this.fontRegular!,
          size: 10,
          color: rgb(0.4, 0.4, 0.4),
        });
      }
    }

    // Add watermark
    if (this.config?.watermark) {
      this.addWatermark();
    }
  }

  /**
   * Create table of contents
   */
  private async createTableOfContents(sections: ReportSection[]): Promise<void> {
    this.addNewPage();
    this.yPosition = this.pageHeight - this.margin;

    this.drawText('Table of Contents', this.margin, this.yPosition, {
      font: this.fontBold!,
      size: 18,
      color: rgb(0.1, 0.2, 0.4),
    });

    this.yPosition -= 10;
    this.drawHorizontalLine(this.yPosition);
    this.yPosition -= 20;

    for (const section of sections) {
      if (!section.includeInTOC) continue;

      this.drawText(section.title, this.margin + 10, this.yPosition, {
        font: this.fontRegular!,
        size: 11,
        color: rgb(0.2, 0.2, 0.2),
      });
      this.yPosition -= this.lineHeight;
    }
  }

  /**
   * Generate a section
   */
  private async generateSection(section: ReportSection): Promise<void> {
    // Handle page breaks
    if (section.pageBreak === 'before' || section.pageBreak === 'both') {
      this.addNewPage();
    }

    // Check if we need a new page
    if (this.yPosition < this.margin + 100) {
      this.addNewPage();
    }

    // Draw section title
    this.yPosition -= 10;
    this.drawText(section.title, this.margin, this.yPosition, {
      font: this.fontBold!,
      size: 16,
      color: rgb(0.1, 0.2, 0.4),
    });
    this.yPosition -= 5;
    this.drawHorizontalLine(this.yPosition);
    this.yPosition -= 15;

    // Generate section content
    await this.generateSectionContent(section.content);

    if (section.pageBreak === 'after' || section.pageBreak === 'both') {
      this.addNewPage();
    }
  }

  /**
   * Generate section content based on type
   */
  private async generateSectionContent(content: SectionContent): Promise<void> {
    switch (content.type) {
      case 'text':
        this.generateTextContent(content.content);
        break;
      case 'table':
        this.generateTableContent(content.data, content.headers, content.title);
        break;
      case 'entities':
        this.generateEntitiesContent(content.entities);
        break;
      case 'relationships':
        this.generateRelationshipsContent(content.relationships, content.entities);
        break;
      case 'patterns':
        this.generatePatternsContent(content.patterns);
        break;
      case 'timeline':
        this.generateTimelineContent(content.events);
        break;
      case 'statistics':
        this.generateStatisticsContent(content.stats);
        break;
      case 'quality_report':
        this.generateQualityReportContent(content.report);
        break;
      case 'chart':
        // Chart generation would require additional libraries
        this.drawText('[Chart visualization would be rendered here]', this.margin, this.yPosition, {
          font: this.fontRegular!,
          size: 10,
          color: rgb(0.5, 0.5, 0.5),
        });
        break;
      case 'network_graph':
        this.generateNetworkGraphSummary(content.config);
        break;
    }
  }

  /**
   * Generate text content
   */
  private generateTextContent(text: string): void {
    const lines = this.wrapText(text, this.pageWidth - 2 * this.margin);
    
    for (const line of lines) {
      if (this.yPosition < this.margin + this.lineHeight) {
        this.addNewPage();
      }
      this.drawText(line, this.margin, this.yPosition, {
        font: this.fontRegular!,
        size: 10,
        color: rgb(0.2, 0.2, 0.2),
      });
      this.yPosition -= this.lineHeight;
    }
  }

  /**
   * Generate table content
   */
  private generateTableContent(
    data: unknown[][],
    headers: string[],
    title?: string
  ): void {
    if (title) {
      this.drawText(title, this.margin, this.yPosition, {
        font: this.fontBold!,
        size: 12,
        color: rgb(0.2, 0.2, 0.2),
      });
      this.yPosition -= 15;
    }

    const colWidth = (this.pageWidth - 2 * this.margin) / headers.length;
    const rowHeight = 20;

    // Draw header
    this.currentPage!.drawRectangle({
      x: this.margin,
      y: this.yPosition - rowHeight,
      width: this.pageWidth - 2 * this.margin,
      height: rowHeight,
      color: rgb(0.12, 0.31, 0.47),
    });

    for (let i = 0; i < headers.length; i++) {
      this.drawText(
        truncateString(headers[i], Math.floor(colWidth / 6)),
        this.margin + i * colWidth + 5,
        this.yPosition - 15,
        {
          font: this.fontBold!,
          size: 9,
          color: rgb(1, 1, 1),
        }
      );
    }

    this.yPosition -= rowHeight;

    // Draw data rows
    for (let rowIdx = 0; rowIdx < Math.min(data.length, 50); rowIdx++) {
      const row = data[rowIdx];
      const isAlternate = rowIdx % 2 === 1;

      if (this.yPosition < this.margin + rowHeight) {
        this.addNewPage();
      }

      // Draw row background
      if (isAlternate) {
        this.currentPage!.drawRectangle({
          x: this.margin,
          y: this.yPosition - rowHeight,
          width: this.pageWidth - 2 * this.margin,
          height: rowHeight,
          color: rgb(0.96, 0.96, 0.96),
        });
      }

      // Draw cell content
      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const value = row[colIdx] !== undefined && row[colIdx] !== null
          ? String(row[colIdx])
          : '—';
        this.drawText(
          truncateString(value, Math.floor(colWidth / 5)),
          this.margin + colIdx * colWidth + 5,
          this.yPosition - 15,
          {
            font: this.fontRegular!,
            size: 8,
            color: rgb(0.2, 0.2, 0.2),
          }
        );
      }

      this.yPosition -= rowHeight;
    }

    if (data.length > 50) {
      this.yPosition -= 10;
      this.drawText(
        `... and ${data.length - 50} more rows`,
        this.margin,
        this.yPosition,
        {
          font: this.fontRegular!,
          size: 9,
          color: rgb(0.5, 0.5, 0.5),
        }
      );
    }

    this.yPosition -= 10;
  }

  /**
   * Generate entities content
   */
  private generateEntitiesContent(entities: BaseEntity[]): void {
    this.drawText(`Total Entities: ${formatNumber(entities.length)}`, this.margin, this.yPosition, {
      font: this.fontBold!,
      size: 11,
      color: rgb(0.2, 0.2, 0.2),
    });
    this.yPosition -= 20;

    // Group by type
    const byType: Record<string, number> = {};
    for (const entity of entities) {
      byType[entity.type] = (byType[entity.type] || 0) + 1;
    }

    for (const [type, count] of Object.entries(byType)) {
      if (this.yPosition < this.margin + this.lineHeight) {
        this.addNewPage();
      }
      this.drawText(
        `${getEntityTypeDisplayName(type as any)}: ${formatNumber(count)}`,
        this.margin + 20,
        this.yPosition,
        {
          font: this.fontRegular!,
          size: 10,
          color: rgb(0.3, 0.3, 0.3),
        }
      );
      this.yPosition -= this.lineHeight;
    }

    this.yPosition -= 10;

    // List entities
    const displayEntities = entities.slice(0, 100);
    for (const entity of displayEntities) {
      if (this.yPosition < this.margin + 30) {
        this.addNewPage();
      }

      // Draw entity bullet
      this.currentPage!.drawCircle({
        x: this.margin + 5,
        y: this.yPosition - 3,
        size: 3,
        color: this.hexToRgb(getEntityTypeColor(entity.type)),
      });

      this.drawText(
        `${entity.name} (${getEntityTypeDisplayName(entity.type)})`,
        this.margin + 15,
        this.yPosition,
        {
          font: this.fontRegular!,
          size: 10,
          color: rgb(0.2, 0.2, 0.2),
        }
      );
      this.yPosition -= this.lineHeight;
    }

    if (entities.length > 100) {
      this.drawText(
        `... and ${entities.length - 100} more entities`,
        this.margin + 15,
        this.yPosition,
        {
          font: this.fontRegular!,
          size: 9,
          color: rgb(0.5, 0.5, 0.5),
        }
      );
    }
  }

  /**
   * Generate relationships content
   */
  private generateRelationshipsContent(
    relationships: Relationship[],
    entities: BaseEntity[]
  ): void {
    this.drawText(
      `Total Relationships: ${formatNumber(relationships.length)}`,
      this.margin,
      this.yPosition,
      {
        font: this.fontBold!,
        size: 11,
        color: rgb(0.2, 0.2, 0.2),
      }
    );
    this.yPosition -= 20;

    const entityMap = new Map(entities.map(e => [e.id, e]));

    for (const rel of relationships.slice(0, 100)) {
      if (this.yPosition < this.margin + 30) {
        this.addNewPage();
      }

      const source = entityMap.get(rel.sourceId);
      const target = entityMap.get(rel.targetId);

      const sourceName = source?.name || rel.sourceId;
      const targetName = target?.name || rel.targetId;

      this.drawText(
        `${sourceName} → ${targetName} (${rel.type}, ${(rel.strength * 100).toFixed(0)}%)`,
        this.margin + 15,
        this.yPosition,
        {
          font: this.fontRegular!,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        }
      );
      this.yPosition -= this.lineHeight;
    }

    if (relationships.length > 100) {
      this.drawText(
        `... and ${relationships.length - 100} more relationships`,
        this.margin + 15,
        this.yPosition,
        {
          font: this.fontRegular!,
          size: 9,
          color: rgb(0.5, 0.5, 0.5),
        }
      );
    }
  }

  /**
   * Generate patterns content
   */
  private generatePatternsContent(patterns: DetectedPattern[]): void {
    this.drawText(
      `Detected Patterns: ${formatNumber(patterns.length)}`,
      this.margin,
      this.yPosition,
      {
        font: this.fontBold!,
        size: 11,
        color: rgb(0.2, 0.2, 0.2),
      }
    );
    this.yPosition -= 20;

    for (const pattern of patterns) {
      if (this.yPosition < this.margin + 60) {
        this.addNewPage();
      }

      // Draw severity indicator
      const severityColor = this.hexToRgb(getSeverityColor(pattern.severity));
      this.currentPage!.drawRectangle({
        x: this.margin,
        y: this.yPosition - 40,
        width: 4,
        height: 40,
        color: severityColor,
      });

      // Pattern header
      this.drawText(
        `${pattern.type.replace(/_/g, ' ').toUpperCase()}`,
        this.margin + 10,
        this.yPosition,
        {
          font: this.fontBold!,
          size: 10,
          color: rgb(0.2, 0.2, 0.2),
        }
      );

      this.drawText(
        `Severity: ${pattern.severity.toUpperCase()} | Confidence: ${(pattern.confidence * 100).toFixed(0)}%`,
        this.margin + 10,
        this.yPosition - 14,
        {
          font: this.fontRegular!,
          size: 9,
          color: rgb(0.4, 0.4, 0.4),
        }
      );

      // Description
      const descLines = this.wrapText(pattern.description, this.pageWidth - 2 * this.margin - 20);
      for (const line of descLines.slice(0, 2)) {
        this.drawText(line, this.margin + 10, this.yPosition - 28, {
          font: this.fontRegular!,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        });
      }

      this.yPosition -= 50;
    }
  }

  /**
   * Generate timeline content
   */
  private generateTimelineContent(events: TimelineEvent[]): void {
    this.drawText(`Timeline Events: ${formatNumber(events.length)}`, this.margin, this.yPosition, {
      font: this.fontBold!,
      size: 11,
      color: rgb(0.2, 0.2, 0.2),
    });
    this.yPosition -= 20;

    // Draw timeline
    const timelineX = this.margin + 20;
    const lineX = timelineX + 5;

    // Draw vertical line
    this.currentPage!.drawLine({
      start: { x: lineX, y: this.yPosition },
      end: { x: lineX, y: this.yPosition - Math.min(events.length * 30, 300) },
      thickness: 2,
      color: rgb(0.7, 0.7, 0.7),
    });

    for (const event of events.slice(0, 20)) {
      if (this.yPosition < this.margin + 40) {
        this.addNewPage();
      }

      // Draw event marker
      this.currentPage!.drawCircle({
        x: lineX,
        y: this.yPosition - 5,
        size: 5,
        color: rgb(0.12, 0.31, 0.47),
      });

      // Event date
      this.drawText(formatDate(event.timestamp), timelineX + 15, this.yPosition, {
        font: this.fontBold!,
        size: 9,
        color: rgb(0.2, 0.2, 0.2),
      });

      // Event title
      this.drawText(event.title, timelineX + 15, this.yPosition - 12, {
        font: this.fontRegular!,
        size: 9,
        color: rgb(0.3, 0.3, 0.3),
      });

      this.yPosition -= 30;
    }

    if (events.length > 20) {
      this.drawText(
        `... and ${events.length - 20} more events`,
        timelineX + 15,
        this.yPosition,
        {
          font: this.fontRegular!,
          size: 9,
          color: rgb(0.5, 0.5, 0.5),
        }
      );
    }
  }

  /**
   * Generate statistics content
   */
  private generateStatisticsContent(stats: CorrelationStatistics): void {
    const statItems = [
      ['Total Entities', formatNumber(stats.totalEntities)],
      ['Total Relationships', formatNumber(stats.totalRelationships)],
      ['Avg. Connections/Entity', stats.averageConnectionsPerEntity.toFixed(2)],
      ['Max Cluster Size', formatNumber(stats.maxClusterSize)],
      ['Data Quality Score', (stats.dataQualityScore * 100).toFixed(1) + '%'],
      ['Coverage Score', (stats.coverageScore * 100).toFixed(1) + '%'],
    ];

    this.generateTableContent(statItems, ['Metric', 'Value'], 'Analysis Statistics');
  }

  /**
   * Generate quality report content
   */
  private generateQualityReportContent(report: DataQualityReport): void {
    this.drawText(
      `Overall Quality Score: ${(report.overallScore * 100).toFixed(1)}%`,
      this.margin,
      this.yPosition,
      {
        font: this.fontBold!,
        size: 12,
        color: rgb(0.2, 0.2, 0.2),
      }
    );
    this.yPosition -= 20;

    // Dimension scores
    const dimensionData = report.dimensions.map(d => [
      d.name.charAt(0).toUpperCase() + d.name.slice(1),
      (d.score * 100).toFixed(1) + '%',
      d.weight.toFixed(2),
    ]);

    this.generateTableContent(dimensionData, ['Dimension', 'Score', 'Weight'], 'Quality Dimensions');

    // Issues
    if (report.issues.length > 0) {
      this.yPosition -= 10;
      this.drawText('Data Quality Issues:', this.margin, this.yPosition, {
        font: this.fontBold!,
        size: 11,
        color: rgb(0.2, 0.2, 0.2),
      });
      this.yPosition -= 15;

      for (const issue of report.issues.slice(0, 20)) {
        if (this.yPosition < this.margin + this.lineHeight) {
          this.addNewPage();
        }
        this.drawText(
          `[${issue.severity.toUpperCase()}] ${issue.field}: ${issue.description}`,
          this.margin + 15,
          this.yPosition,
          {
            font: this.fontRegular!,
            size: 9,
            color: rgb(0.3, 0.3, 0.3),
          }
        );
        this.yPosition -= this.lineHeight;
      }
    }
  }

  /**
   * Generate network graph summary
   */
  private generateNetworkGraphSummary(config: NetworkGraphConfig): void {
    this.drawText(
      `Network Graph: ${config.nodes.length} nodes, ${config.edges.length} edges`,
      this.margin,
      this.yPosition,
      {
        font: this.fontBold!,
        size: 11,
        color: rgb(0.2, 0.2, 0.2),
      }
    );
    this.yPosition -= 20;

    // Summary table
    const nodeByType: Record<string, number> = {};
    for (const node of config.nodes) {
      nodeByType[node.type] = (nodeByType[node.type] || 0) + 1;
    }

    const summaryData = Object.entries(nodeByType).map(([type, count]) => [
      type,
      formatNumber(count),
    ]);

    this.generateTableContent(summaryData, ['Entity Type', 'Count'], 'Node Distribution');

    // Legend
    this.yPosition -= 10;
    this.drawText('Legend:', this.margin, this.yPosition, {
      font: this.fontBold!,
      size: 10,
      color: rgb(0.2, 0.2, 0.2),
    });
    this.yPosition -= 15;

    for (const item of config.legend) {
      this.currentPage!.drawCircle({
        x: this.margin + 10,
        y: this.yPosition - 3,
        size: 5,
        color: this.hexToRgb(item.color),
      });
      this.drawText(item.label, this.margin + 25, this.yPosition, {
        font: this.fontRegular!,
        size: 9,
        color: rgb(0.3, 0.3, 0.3),
      });
      this.yPosition -= this.lineHeight;
    }
  }

  /**
   * Add a new page
   */
  private addNewPage(): void {
    this.currentPage = this.doc!.addPage([this.pageWidth, this.pageHeight]);
    this.pageNumber++;
    this.totalPages++;
    this.yPosition = this.pageHeight - this.margin;

    // Add header
    if (this.config?.header) {
      this.addHeader();
    }

    // Add footer
    if (this.config?.footer) {
      this.addFooter();
    }
  }

  /**
   * Add header to current page
   */
  private addHeader(): void {
    if (!this.config?.header) return;

    const y = this.pageHeight - 30;

    if (this.config.header.includeTitle) {
      this.drawText(this.config.title, this.margin, y, {
        font: this.fontBold!,
        size: 10,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    if (this.config.header.includeCaseNumber && this.config.caseNumber) {
      this.drawText(
        `Case: ${this.config.caseNumber}`,
        this.pageWidth - this.margin - 100,
        y,
        {
          font: this.fontRegular!,
          size: 9,
          color: rgb(0.4, 0.4, 0.4),
        }
      );
    }

    // Draw header line
    this.currentPage!.drawLine({
      start: { x: this.margin, y: y - 10 },
      end: { x: this.pageWidth - this.margin, y: y - 10 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
  }

  /**
   * Add footer to current page
   */
  private addFooter(): void {
    if (!this.config?.footer) return;

    const y = 30;

    if (this.config.footer.text) {
      this.drawText(this.config.footer.text, this.margin, y, {
        font: this.fontRegular!,
        size: 8,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    if (this.config.footer.includeClassification && this.config.classification) {
      this.drawText(
        this.config.classification,
        this.pageWidth / 2 - 30,
        y,
        {
          font: this.fontBold!,
          size: 8,
          color: rgb(0.4, 0.4, 0.4),
        }
      );
    }
  }

  /**
   * Add page numbers
   */
  private addPageNumbers(): void {
    const pages = this.doc!.getPages();
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const text = `Page ${i + 1} of ${pages.length}`;
      
      page.drawText(text, {
        x: this.pageWidth / 2 - 30,
        y: 20,
        size: 8,
        font: this.fontRegular!,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  /**
   * Draw classification banner
   */
  private drawClassificationBanner(): void {
    if (!this.config?.classification) return;

    const bannerY = this.pageHeight - 40;
    const text = this.config.classification;

    this.currentPage!.drawRectangle({
      x: 0,
      y: bannerY - 5,
      width: this.pageWidth,
      height: 20,
      color: rgb(0.8, 0.2, 0.2),
    });

    this.drawText(text, this.pageWidth / 2 - 50, bannerY, {
      font: this.fontBold!,
      size: 10,
      color: rgb(1, 1, 1),
    });
  }

  /**
   * Add watermark
   */
  private addWatermark(): void {
    if (!this.config?.watermark) return;

    const pages = this.doc!.getPages();
    
    for (const page of pages) {
      if (this.config.watermark!.text) {
        page.drawText(this.config.watermark!.text, {
          x: this.pageWidth / 2 - 100,
          y: this.pageHeight / 2,
          size: this.config.watermark!.fontSize || 40,
          font: this.fontRegular!,
          color: rgb(0.9, 0.9, 0.9),
          rotate: { angle: this.config.watermark!.rotation || -45, type: 'degrees' },
          opacity: this.config.watermark!.opacity || 0.3,
        });
      }
    }
  }

  /**
   * Set PDF metadata
   */
  private setMetadata(): void {
    this.doc!.setTitle(this.config?.title || 'Investigation Report');
    this.doc!.setAuthor(this.config?.preparedBy?.name || 'Investigation Tools');
    this.doc!.setCreator('Investigation PDF Library v2.0');
    this.doc!.setSubject(`Investigation Report - ${this.config?.caseNumber || 'No Case Number'}`);
    this.doc!.setKeywords(['investigation', 'correlation', 'analysis', 'report']);
    this.doc!.setProducer('Investigation PDF Library');
    this.doc!.setCreationDate(new Date());
  }

  /**
   * Draw text helper
   */
  private drawText(
    text: string,
    x: number,
    y: number,
    options: {
      font: PDFFont;
      size: number;
      color: { red: number; green: number; blue: number };
    }
  ): void {
    this.currentPage!.drawText(text, {
      x,
      y,
      size: options.size,
      font: options.font,
      color: options.color,
    });
  }

  /**
   * Draw horizontal line
   */
  private drawHorizontalLine(y: number): void {
    this.currentPage!.drawLine({
      start: { x: this.margin, y },
      end: { x: this.pageWidth - this.margin, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
  }

  /**
   * Wrap text to fit width
   */
  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = this.fontRegular!.widthOfTextAtSize(testLine, 10);

      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { red: number; green: number; blue: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          red: parseInt(result[1], 16) / 255,
          green: parseInt(result[2], 16) / 255,
          blue: parseInt(result[3], 16) / 255,
        }
      : { red: 0.5, green: 0.5, blue: 0.5 };
  }
}

export default InvestigationPDFGenerator;
