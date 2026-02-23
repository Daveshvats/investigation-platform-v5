# Investigation PDF Library v2.0

A comprehensive Node.js library for generating professional investigation reports with data correlation analysis, entity relationship mapping, pattern detection, and PDF generation capabilities.

## Features

### Data Correlation Analysis
- **Entity Extraction**: Automatically identifies and extracts entities (persons, companies, addresses, bank accounts, etc.) from structured data
- **Relationship Detection**: Discovers connections between entities based on shared attributes
- **Cluster Analysis**: Groups related entities into meaningful clusters
- **Transitive Relationship Discovery**: Finds indirect connections through intermediate entities

### Pattern Detection
- **Address Sharing**: Detects multiple entities at the same address
- **Contact Sharing**: Identifies shared phone numbers or emails
- **Financial Anomalies**: Flags suspicious financial patterns
- **Shell Company Indicators**: Identifies potential shell company characteristics
- **Circular Relationships**: Detects circular ownership or transaction patterns
- **Suspicious Timelines**: Identifies unusual timing patterns

### Data Quality Analysis
- **Completeness**: Assesses missing data
- **Accuracy**: Validates data formats
- **Consistency**: Checks for naming inconsistencies
- **Timeliness**: Evaluates data freshness
- **Validity**: Verifies data against business rules
- **Uniqueness**: Identifies duplicate records

### PDF Report Generation
- Professional cover pages with classification banners
- Table of contents
- Entity analysis sections
- Relationship visualizations
- Pattern summaries with severity indicators
- Timeline of events
- Data quality reports
- Recommendations

## Installation

```bash
npm install investigation-pdf-library
```

Or using yarn:

```bash
yarn add investigation-pdf-library
```

## Quick Start

### Generate a Complete Report

```typescript
import { generateInvestigationReport } from 'investigation-pdf-library';
import * as fs from 'fs';

const tables = [
  {
    name: 'customers',
    records: [
      { id: 1, name: 'John Doe', email: 'john@example.com', phone: '555-1234' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', phone: '555-5678' },
    ],
  },
];

const pdfBytes = await generateInvestigationReport(tables, {
  title: 'Investigation Report',
  caseNumber: 'INV-2026-001',
  preparedBy: { name: 'Investigation Team' },
  classification: 'CONFIDENTIAL',
});

fs.writeFileSync('report.pdf', pdfBytes);
```

### Step-by-Step Analysis

```typescript
import { CorrelationAnalyzer, QualityAnalyzer } from 'investigation-pdf-library';

// Run correlation analysis
const analyzer = new CorrelationAnalyzer({
  minimumConfidence: 0.6,
  fuzzyMatchThreshold: 0.85,
});

const result = await analyzer.analyze(tables);

console.log('Entities:', result.entities.length);
console.log('Relationships:', result.relationships.length);
console.log('Patterns:', result.patterns.length);

// Run quality analysis
const qualityAnalyzer = new QualityAnalyzer();
const qualityReport = qualityAnalyzer.analyze(result.entities);

console.log('Quality Score:', qualityReport.overallScore);
```

### Custom PDF Generation

```typescript
import { InvestigationPDFGenerator } from 'investigation-pdf-library';

const generator = new InvestigationPDFGenerator();

const pdfBytes = await generator.generateReport(
  {
    title: 'Custom Report',
    caseNumber: 'CASE-001',
    classification: 'CONFIDENTIAL',
    date: new Date(),
    tableOfContents: true,
  },
  [
    {
      id: 'summary',
      title: 'Executive Summary',
      type: 'executive_summary',
      content: { type: 'text', content: 'Report summary...' },
      includeInTOC: true,
    },
    // More sections...
  ]
);
```

## API Reference

### CorrelationAnalyzer

Main class for data correlation analysis.

```typescript
const analyzer = new CorrelationAnalyzer({
  minimumConfidence: 0.6,      // Minimum confidence for relationships
  maxIterations: 100,          // Max iterations for transitive analysis
  fuzzyMatchThreshold: 0.85,   // Threshold for fuzzy string matching
  dateToleranceDays: 30,       // Tolerance for date proximity
  addressMatchThreshold: 0.8,  // Threshold for address matching
  phoneMatchThreshold: 0.9,    // Threshold for phone matching
  emailMatchThreshold: 0.95,   // Threshold for email matching
});

const result = await analyzer.analyze(tables);
```

#### Result Structure

```typescript
interface CorrelationResult {
  entities: BaseEntity[];
  relationships: Relationship[];
  clusters: EntityCluster[];
  patterns: DetectedPattern[];
  timeline: TimelineEvent[];
  statistics: CorrelationStatistics;
}
```

### QualityAnalyzer

Analyzes data quality across multiple dimensions.

```typescript
const analyzer = new QualityAnalyzer({
  requiredFields: ['name', 'email'],
  customValidators: new Map([
    ['customField', (value) => value.length > 5],
  ]),
});

const report = analyzer.analyze(entities);
```

#### Quality Report Structure

```typescript
interface DataQualityReport {
  overallScore: number;
  dimensions: QualityDimension[];
  issues: DataQualityIssue[];
  recommendations: string[];
  fieldAnalysis: FieldQualityAnalysis[];
}
```

### InvestigationPDFGenerator

Generates professional PDF reports.

```typescript
const generator = new InvestigationPDFGenerator({
  fontRegular: customFontBuffer,  // Optional custom font
  fontBold: boldFontBuffer,       // Optional bold font
  logoImage: logoBuffer,          // Optional logo
});

const pdfBytes = await generator.generateReport(config, sections);
```

## Entity Types

The library recognizes and handles the following entity types:

| Type | Description |
|------|-------------|
| `person` | Individual persons |
| `company` | Business entities |
| `address` | Physical addresses |
| `phone` | Phone numbers |
| `email` | Email addresses |
| `bank_account` | Bank accounts |
| `document` | Documents |
| `vehicle` | Vehicles |
| `property` | Real property |
| `transaction` | Financial transactions |
| `website` | Websites |
| `ip_address` | IP addresses |
| `custom` | Custom entity types |

## Pattern Types

Detectable patterns include:

| Pattern | Severity | Description |
|---------|----------|-------------|
| `address_sharing` | Medium-High | Multiple entities at same address |
| `contact_sharing` | Medium | Shared phone/email |
| `suspicious_timeline` | Low | Unusual timing patterns |
| `financial_anomaly` | High | Suspicious financial patterns |
| `shell_company_indicator` | Medium-High | Shell company characteristics |
| `circular_transaction` | High | Circular ownership/transactions |
| `duplicate_identity` | Medium | Potential duplicate entities |
| `hidden_relationship` | High | Hidden connections |

## Report Sections

Available report section types:

- `executive_summary` - Overview of findings
- `methodology` - Analysis approach
- `findings` - Key findings
- `entity_analysis` - Entity breakdown
- `relationship_analysis` - Relationship mapping
- `pattern_analysis` - Detected patterns
- `timeline` - Chronological events
- `statistics` - Analysis statistics
- `data_quality` - Quality assessment
- `recommendations` - Action items

## Configuration Options

### PDFReportConfig

```typescript
interface PDFReportConfig {
  title: string;
  subtitle?: string;
  caseNumber?: string;
  classification?: ClassificationLevel;
  preparedBy?: UserInfo;
  reviewedBy?: UserInfo[];
  date: Date;
  organization?: OrganizationInfo;
  logo?: LogoConfig;
  watermark?: WatermarkConfig;
  footer?: FooterConfig;
  header?: HeaderConfig;
  tableOfContents?: boolean;
}
```

### Classification Levels

- `UNCLASSIFIED`
- `CONFIDENTIAL`
- `SECRET`
- `TOP_SECRET`
- `RESTRICTED`
- `INTERNAL`
- `PUBLIC`

## Examples

See the `examples/` directory for complete usage examples:

- `basic-usage.ts` - Basic library usage
- `custom-report.ts` - Custom report generation
- `data-analysis.ts` - Detailed data analysis

## Dependencies

- `pdf-lib` - PDF generation
- `fontkit` - Font handling

## License

MIT License

## Version History

### v2.0.0
- Added data correlation analysis
- Added pattern detection
- Added data quality analysis
- Added timeline generation
- Enhanced PDF generation with professional templates
- Added entity relationship mapping

### v1.0.0
- Initial release
- Basic PDF generation
- Table export functionality
