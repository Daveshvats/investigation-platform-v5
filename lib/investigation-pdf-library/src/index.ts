/**
 * Investigation PDF Library v2.0
 * Main entry point - exports all public modules and types
 */

// Core types
export * from './core/types';

// Analysis modules
export { CorrelationAnalyzer } from './analysis/correlation-analyzer';
export { QualityAnalyzer } from './analysis/quality-analyzer';

// Report generation
export { InvestigationPDFGenerator, PDFGeneratorOptions } from './reports/pdf-generator';

// Utilities
export * from './utils/helpers';

// Version
export const VERSION = '2.0.0';

/**
 * Quick start: Create a complete investigation report
 */
import { CorrelationAnalyzer } from './analysis/correlation-analyzer';
import { QualityAnalyzer } from './analysis/quality-analyzer';
import { InvestigationPDFGenerator } from './reports/pdf-generator';
import {
  CorrelationResult,
  DataQualityReport,
  PDFReportConfig,
  ReportSection,
} from './core/types';

export interface InvestigationReportOptions {
  title: string;
  caseNumber?: string;
  preparedBy?: { name: string; title?: string };
  classification?: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'RESTRICTED' | 'INTERNAL';
  includeQualityReport?: boolean;
  includePatterns?: boolean;
  includeTimeline?: boolean;
  includeStatistics?: boolean;
}

/**
 * Generate a complete investigation report from data tables
 */
export async function generateInvestigationReport(
  tables: Array<{ name: string; records: Record<string, unknown>[] }>,
  options: InvestigationReportOptions
): Promise<Uint8Array> {
  // Run correlation analysis
  const correlationAnalyzer = new CorrelationAnalyzer();
  const correlationResult = await correlationAnalyzer.analyze(tables);

  // Run quality analysis
  const qualityAnalyzer = new QualityAnalyzer();
  const qualityReport = qualityAnalyzer.analyze(correlationResult.entities);

  // Build report sections
  const sections: ReportSection[] = buildReportSections(
    correlationResult,
    qualityReport,
    options
  );

  // Configure PDF
  const pdfConfig: PDFReportConfig = {
    title: options.title,
    caseNumber: options.caseNumber,
    classification: options.classification || 'CONFIDENTIAL',
    preparedBy: options.preparedBy,
    date: new Date(),
    tableOfContents: true,
    footer: {
      includeClassification: true,
      includePageNumber: true,
    },
    header: {
      includeTitle: true,
      includeCaseNumber: !!options.caseNumber,
    },
  };

  // Generate PDF
  const pdfGenerator = new InvestigationPDFGenerator();
  return await pdfGenerator.generateReport(pdfConfig, sections);
}

/**
 * Build report sections based on analysis results
 */
function buildReportSections(
  correlation: CorrelationResult,
  quality: DataQualityReport,
  options: InvestigationReportOptions
): ReportSection[] {
  const sections: ReportSection[] = [];

  // Executive Summary
  sections.push({
    id: 'executive-summary',
    title: 'Executive Summary',
    type: 'executive_summary',
    content: {
      type: 'text',
      content: generateExecutiveSummary(correlation, quality),
    },
    pageBreak: 'none',
    includeInTOC: true,
  });

  // Methodology
  sections.push({
    id: 'methodology',
    title: 'Analysis Methodology',
    type: 'methodology',
    content: {
      type: 'text',
      content: `This report was generated using automated data correlation analysis. 
The analysis identifies relationships between entities based on shared attributes such as addresses, 
contact information, and financial data. Pattern detection algorithms identify potential anomalies 
and suspicious connections. Data quality is assessed across six dimensions: completeness, accuracy, 
consistency, timeliness, validity, and uniqueness.`,
    },
    pageBreak: 'before',
    includeInTOC: true,
  });

  // Statistics
  if (options.includeStatistics !== false) {
    sections.push({
      id: 'statistics',
      title: 'Analysis Statistics',
      type: 'statistics',
      content: {
        type: 'statistics',
        stats: correlation.statistics,
      },
      pageBreak: 'none',
      includeInTOC: true,
    });
  }

  // Entity Analysis
  sections.push({
    id: 'entities',
    title: 'Entity Analysis',
    type: 'entity_analysis',
    content: {
      type: 'entities',
      entities: correlation.entities,
    },
    pageBreak: 'before',
    includeInTOC: true,
  });

  // Relationship Analysis
  sections.push({
    id: 'relationships',
    title: 'Relationship Analysis',
    type: 'relationship_analysis',
    content: {
      type: 'relationships',
      relationships: correlation.relationships,
      entities: correlation.entities,
    },
    pageBreak: 'none',
    includeInTOC: true,
  });

  // Pattern Analysis
  if (options.includePatterns !== false && correlation.patterns.length > 0) {
    sections.push({
      id: 'patterns',
      title: 'Detected Patterns and Anomalies',
      type: 'pattern_analysis',
      content: {
        type: 'patterns',
        patterns: correlation.patterns,
      },
      pageBreak: 'before',
      includeInTOC: true,
    });
  }

  // Timeline
  if (options.includeTimeline !== false && correlation.timeline.length > 0) {
    sections.push({
      id: 'timeline',
      title: 'Timeline of Events',
      type: 'timeline',
      content: {
        type: 'timeline',
        events: correlation.timeline,
      },
      pageBreak: 'none',
      includeInTOC: true,
    });
  }

  // Data Quality
  if (options.includeQualityReport !== false) {
    sections.push({
      id: 'quality',
      title: 'Data Quality Assessment',
      type: 'data_quality',
      content: {
        type: 'quality_report',
        report: quality,
      },
      pageBreak: 'before',
      includeInTOC: true,
    });
  }

  // Recommendations
  sections.push({
    id: 'recommendations',
    title: 'Recommendations',
    type: 'recommendations',
    content: {
      type: 'text',
      content: generateRecommendations(correlation, quality),
    },
    pageBreak: 'none',
    includeInTOC: true,
  });

  return sections;
}

/**
 * Generate executive summary text
 */
function generateExecutiveSummary(
  correlation: CorrelationResult,
  quality: DataQualityReport
): string {
  const stats = correlation.statistics;
  const criticalPatterns = correlation.patterns.filter(p => p.severity === 'critical');
  const highPatterns = correlation.patterns.filter(p => p.severity === 'high');

  return `
This investigation report presents the findings from automated data correlation analysis across ${stats.totalEntities} entities.

KEY FINDINGS:
- ${stats.totalEntities} entities identified across ${Object.keys(stats.entitiesByType).length} entity types
- ${stats.totalRelationships} relationships detected between entities
- ${correlation.patterns.length} patterns detected (${criticalPatterns.length} critical, ${highPatterns.length} high severity)
- ${correlation.clusters.length} entity clusters identified
- Data quality score: ${(quality.overallScore * 100).toFixed(1)}%

ENTITY DISTRIBUTION:
${Object.entries(stats.entitiesByType)
  .map(([type, count]) => `- ${type}: ${count}`)
  .join('\n')}

CRITICAL PATTERNS:
${criticalPatterns.length > 0
  ? criticalPatterns.map(p => `- ${p.type}: ${p.description}`).join('\n')
  : 'No critical patterns detected.'}

The analysis reveals ${stats.averageConnectionsPerEntity.toFixed(2)} average connections per entity, 
indicating ${stats.averageConnectionsPerEntity > 3 ? 'a highly interconnected network' : 'moderate connectivity'} 
among the analyzed entities.
`.trim();
}

/**
 * Generate recommendations text
 */
function generateRecommendations(
  correlation: CorrelationResult,
  quality: DataQualityReport
): string {
  const recommendations: string[] = [];

  // Based on patterns
  const criticalPatterns = correlation.patterns.filter(p => p.severity === 'critical');
  const highPatterns = correlation.patterns.filter(p => p.severity === 'high');

  if (criticalPatterns.length > 0) {
    recommendations.push(`1. IMMEDIATE: Investigate ${criticalPatterns.length} critical patterns detected in the data.`);
  }

  if (highPatterns.length > 0) {
    recommendations.push(`2. HIGH PRIORITY: Review ${highPatterns.length} high-severity patterns for potential risks.`);
  }

  // Based on clusters
  if (correlation.clusters.length > 0) {
    recommendations.push(`3. Analyze ${correlation.clusters.length} entity clusters for hidden relationships.`);
  }

  // Based on data quality
  if (quality.overallScore < 0.7) {
    recommendations.push(`4. Improve data quality (current score: ${(quality.overallScore * 100).toFixed(1)}%) before drawing definitive conclusions.`);
  }

  const criticalIssues = quality.issues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    recommendations.push(`5. Address ${criticalIssues.length} critical data quality issues.`);
  }

  // General recommendations
  recommendations.push('6. Cross-reference findings with external data sources for verification.');
  recommendations.push('7. Document all investigative actions and maintain chain of custody for evidence.');

  return recommendations.join('\n\n');
}

// Default export
export default {
  VERSION,
  generateInvestigationReport,
  CorrelationAnalyzer,
  QualityAnalyzer,
  InvestigationPDFGenerator,
};
