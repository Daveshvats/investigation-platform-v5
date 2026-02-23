/**
 * Basic Usage Example
 * Demonstrates how to use the Investigation PDF Library
 */

import {
  generateInvestigationReport,
  CorrelationAnalyzer,
  QualityAnalyzer,
  InvestigationPDFGenerator,
} from '../src';

import * as fs from 'fs';

// Sample data - mimicking the uploaded investigation data
const sampleData = [
  {
    name: 'angel',
    records: [
      {
        ID: 1,
        NAME: 'RAHUL VERMA',
        CLIENT_CODE: '1203320079134810',
        EMAIL: 'RAHULJI9005100160@GMAIL.COM',
        CMOBILE: '9936759548',
        CADD1: 'S/O SHRI KISHNA GRAM POST',
        CADD2: 'MAMNA TAHSEEL SAREELA',
        CCITY: 'HAMIRPUR(UP)',
        CSTATE: 'UTTAR PRADESH',
        CCOUNTRY: 'INDIA',
        CPIN: '210432',
        DOB: '2000-04-05',
        BANK_ACCNO: '50286637698',
        BANK_NAME: 'IDIB000P684',
        OPEN_DATE: '04/09/2021',
        UPDATED_AT: '2026-01-14T18:40:26.461Z',
      },
    ],
  },
  {
    name: 'b2b',
    records: [
      {
        ID: 3,
        FIRST_NAME: 'Kavita',
        LAST_NAME: 'Garg',
        COMPANY_NAME: 'General Commerce Private Limited',
        DESIGNATION: 'Owner',
        EMAIL1: 'ea@gclclothing.com',
        MOBILE1: '-9953923481',
        ADD1: 'a1 sec 5',
        CITY: 'Noida',
        STATE: 'Uttar Pradesh',
        COUNTRY: 'India',
        ZIP: '201301',
      },
      {
        ID: 4,
        FIRST_NAME: 'Vikas',
        LAST_NAME: '',
        COMPANY_NAME: 'Anax Electronic Solution',
        DESIGNATION: 'Owner',
        EMAIL1: 'anaxelectronicsolution@gmail.com',
        MOBILE1: '-9643591818',
        ADD1: 'Kalkaji Mandir Nehru Place',
        CITY: 'New Delhi',
        STATE: 'Delhi',
        COUNTRY: 'India',
        ZIP: '110065',
      },
    ],
  },
];

async function main() {
  console.log('Investigation PDF Library - Example Usage\n');
  console.log('='.repeat(50));

  // Example 1: Quick report generation
  console.log('\n1. Generating Complete Investigation Report...');
  
  const pdfBytes = await generateInvestigationReport(sampleData, {
    title: 'Data Correlation Investigation Report',
    caseNumber: 'INV-2026-001',
    preparedBy: {
      name: 'Investigation Team',
      title: 'Senior Analyst',
    },
    classification: 'CONFIDENTIAL',
    includeQualityReport: true,
    includePatterns: true,
    includeTimeline: true,
    includeStatistics: true,
  });

  // Save to file
  fs.writeFileSync('investigation-report.pdf', pdfBytes);
  console.log('   ✓ Report saved to: investigation-report.pdf');

  // Example 2: Step-by-step analysis
  console.log('\n2. Step-by-step Analysis...');

  // Create correlation analyzer
  const correlationAnalyzer = new CorrelationAnalyzer({
    minimumConfidence: 0.6,
    fuzzyMatchThreshold: 0.85,
    addressMatchThreshold: 0.8,
  });

  // Run analysis
  const correlationResult = await correlationAnalyzer.analyze(sampleData);

  console.log(`   Entities found: ${correlationResult.entities.length}`);
  console.log(`   Relationships: ${correlationResult.relationships.length}`);
  console.log(`   Patterns detected: ${correlationResult.patterns.length}`);
  console.log(`   Clusters: ${correlationResult.clusters.length}`);
  console.log(`   Timeline events: ${correlationResult.timeline.length}`);

  // Print entity types
  console.log('\n   Entity Types:');
  for (const [type, count] of Object.entries(correlationResult.statistics.entitiesByType)) {
    console.log(`   - ${type}: ${count}`);
  }

  // Example 3: Data quality analysis
  console.log('\n3. Data Quality Analysis...');

  const qualityAnalyzer = new QualityAnalyzer({
    requiredFields: ['name', 'email'],
  });

  const qualityReport = qualityAnalyzer.analyze(correlationResult.entities);

  console.log(`   Overall Quality Score: ${(qualityReport.overallScore * 100).toFixed(1)}%`);

  console.log('\n   Quality Dimensions:');
  for (const dim of qualityReport.dimensions) {
    console.log(`   - ${dim.name}: ${(dim.score * 100).toFixed(1)}%`);
  }

  if (qualityReport.issues.length > 0) {
    console.log(`\n   Issues Found: ${qualityReport.issues.length}`);
    for (const issue of qualityReport.issues.slice(0, 5)) {
      console.log(`   - [${issue.severity.toUpperCase()}] ${issue.description}`);
    }
  }

  // Example 4: Custom PDF generation
  console.log('\n4. Custom PDF Generation...');

  const pdfGenerator = new InvestigationPDFGenerator();

  const customPdfBytes = await pdfGenerator.generateReport(
    {
      title: 'Custom Investigation Report',
      subtitle: 'Entity Network Analysis',
      caseNumber: 'INV-2026-002',
      classification: 'CONFIDENTIAL',
      preparedBy: {
        name: 'Analysis System',
      },
      date: new Date(),
      tableOfContents: true,
      header: {
        includeTitle: true,
        includeCaseNumber: true,
      },
      footer: {
        includeClassification: true,
        includePageNumber: true,
      },
    },
    [
      {
        id: 'summary',
        title: 'Executive Summary',
        type: 'executive_summary',
        content: {
          type: 'text',
          content: 'This is a custom investigation report generated using the library.',
        },
        includeInTOC: true,
      },
      {
        id: 'entities',
        title: 'Identified Entities',
        type: 'entity_analysis',
        content: {
          type: 'entities',
          entities: correlationResult.entities,
        },
        includeInTOC: true,
      },
      {
        id: 'patterns',
        title: 'Detected Patterns',
        type: 'pattern_analysis',
        content: {
          type: 'patterns',
          patterns: correlationResult.patterns,
        },
        includeInTOC: true,
      },
    ]
  );

  fs.writeFileSync('custom-report.pdf', customPdfBytes);
  console.log('   ✓ Custom report saved to: custom-report.pdf');

  console.log('\n' + '='.repeat(50));
  console.log('Example completed successfully!');
}

main().catch(console.error);
