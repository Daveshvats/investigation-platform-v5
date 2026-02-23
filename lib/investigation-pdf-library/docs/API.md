# API Documentation

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Modules](#core-modules)
3. [Type Definitions](#type-definitions)
4. [Examples](#examples)

## Quick Start

### Installation

```bash
npm install investigation-pdf-library
```

### Basic Usage

```typescript
import { generateInvestigationReport } from 'investigation-pdf-library';
import * as fs from 'fs';

const data = [
  {
    name: 'table_name',
    records: [
      { id: 1, name: 'Entity Name', email: 'email@example.com' },
    ],
  },
];

const pdf = await generateInvestigationReport(data, {
  title: 'Investigation Report',
  caseNumber: 'INV-001',
});

fs.writeFileSync('report.pdf', pdf);
```

## Core Modules

### CorrelationAnalyzer

The main analysis engine for data correlation.

#### Constructor

```typescript
new CorrelationAnalyzer(config?: Partial<CorrelationConfig>)
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minimumConfidence` | number | 0.6 | Minimum confidence threshold for relationships |
| `maxIterations` | number | 100 | Maximum iterations for transitive analysis |
| `fuzzyMatchThreshold` | number | 0.85 | Threshold for fuzzy string matching |
| `dateToleranceDays` | number | 30 | Days tolerance for date proximity |
| `addressMatchThreshold` | number | 0.8 | Threshold for address matching |
| `phoneMatchThreshold` | number | 0.9 | Threshold for phone matching |
| `emailMatchThreshold` | number | 0.95 | Threshold for email matching |

#### Methods

##### `analyze(tables)`

Analyzes data tables and returns correlation results.

```typescript
async analyze(
  tables: Array<{ name: string; records: Record<string, unknown>[] }>
): Promise<CorrelationResult>
```

**Parameters:**
- `tables` - Array of table objects with name and records

**Returns:** `CorrelationResult` containing entities, relationships, clusters, patterns, timeline, and statistics

---

### QualityAnalyzer

Analyzes data quality across multiple dimensions.

#### Constructor

```typescript
new QualityAnalyzer(config?: Partial<QualityAnalyzerConfig>)
```

#### Methods

##### `analyze(entities)`

Analyzes entity quality and returns a quality report.

```typescript
analyze(entities: BaseEntity[]): DataQualityReport
```

**Parameters:**
- `entities` - Array of BaseEntity objects

**Returns:** `DataQualityReport` with scores, dimensions, issues, and recommendations

---

### InvestigationPDFGenerator

Generates professional PDF investigation reports.

#### Constructor

```typescript
new InvestigationPDFGenerator(options?: PDFGeneratorOptions)
```

#### Methods

##### `generateReport(config, sections)`

Generates a PDF report.

```typescript
async generateReport(
  config: PDFReportConfig,
  sections: ReportSection[]
): Promise<Uint8Array>
```

**Parameters:**
- `config` - PDF configuration options
- `sections` - Array of report sections

**Returns:** `Uint8Array` containing PDF bytes

---

## Type Definitions

### BaseEntity

```typescript
interface BaseEntity {
  id: string;
  type: EntityType;
  name: string;
  aliases?: string[];
  attributes: Record<string, unknown>;
  confidence?: number;
  sources?: string[];
}
```

### EntityType

```typescript
type EntityType = 
  | 'person'
  | 'company'
  | 'address'
  | 'phone'
  | 'email'
  | 'bank_account'
  | 'document'
  | 'vehicle'
  | 'property'
  | 'transaction'
  | 'website'
  | 'ip_address'
  | 'custom';
```

### Relationship

```typescript
interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  strength: number;
  attributes?: Record<string, unknown>;
  evidence?: Evidence[];
  firstObserved?: Date;
  lastObserved?: Date;
}
```

### DetectedPattern

```typescript
interface DetectedPattern {
  id: string;
  type: PatternType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  entities: string[];
  description: string;
  indicators: PatternIndicator[];
  recommendations: string[];
}
```

### CorrelationResult

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

### DataQualityReport

```typescript
interface DataQualityReport {
  overallScore: number;
  dimensions: QualityDimension[];
  issues: DataQualityIssue[];
  recommendations: string[];
  fieldAnalysis: FieldQualityAnalysis[];
}
```

### PDFReportConfig

```typescript
interface PDFReportConfig {
  title: string;
  subtitle?: string;
  caseNumber?: string;
  classification?: ClassificationLevel;
  preparedBy?: UserInfo;
  date: Date;
  organization?: OrganizationInfo;
  logo?: LogoConfig;
  watermark?: WatermarkConfig;
  footer?: FooterConfig;
  header?: HeaderConfig;
  tableOfContents?: boolean;
}
```

### ReportSection

```typescript
interface ReportSection {
  id: string;
  title: string;
  type: SectionType;
  content: SectionContent;
  pageBreak?: 'before' | 'after' | 'both' | 'none';
  includeInTOC: boolean;
}
```

---

## Examples

### Complete Analysis Pipeline

```typescript
import { 
  CorrelationAnalyzer, 
  QualityAnalyzer, 
  InvestigationPDFGenerator 
} from 'investigation-pdf-library';

async function runAnalysis(tables) {
  // Step 1: Correlation Analysis
  const correlationAnalyzer = new CorrelationAnalyzer({
    minimumConfidence: 0.7,
  });
  const correlationResult = await correlationAnalyzer.analyze(tables);

  // Step 2: Quality Analysis
  const qualityAnalyzer = new QualityAnalyzer();
  const qualityReport = qualityAnalyzer.analyze(correlationResult.entities);

  // Step 3: Generate Report
  const pdfGenerator = new InvestigationPDFGenerator();
  const pdf = await pdfGenerator.generateReport(
    {
      title: 'Analysis Report',
      date: new Date(),
    },
    [
      {
        id: 'stats',
        title: 'Statistics',
        type: 'statistics',
        content: { type: 'statistics', stats: correlationResult.statistics },
        includeInTOC: true,
      },
      {
        id: 'quality',
        title: 'Data Quality',
        type: 'data_quality',
        content: { type: 'quality_report', report: qualityReport },
        includeInTOC: true,
      },
    ]
  );

  return { correlationResult, qualityReport, pdf };
}
```

### Custom Pattern Detection

```typescript
const analyzer = new CorrelationAnalyzer({
  minimumConfidence: 0.5,
  fuzzyMatchThreshold: 0.9,
  addressMatchThreshold: 0.7,
});

const result = await analyzer.analyze(tables);

// Filter patterns by severity
const criticalPatterns = result.patterns.filter(
  p => p.severity === 'critical'
);

// Process clusters
for (const cluster of result.clusters) {
  console.log(`Cluster: ${cluster.name}`);
  console.log(`  Type: ${cluster.clusterType}`);
  console.log(`  Strength: ${cluster.strength}`);
  console.log(`  Entities: ${cluster.entities.length}`);
}
```

### Timeline Analysis

```typescript
const result = await analyzer.analyze(tables);

// Sort timeline events
const sortedEvents = result.timeline.sort(
  (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
);

// Filter by event type
const registrations = result.timeline.filter(
  e => e.type === 'registration'
);

// Filter by importance
const criticalEvents = result.timeline.filter(
  e => e.importance === 'critical'
);
```

---

## Error Handling

```typescript
try {
  const result = await analyzer.analyze(tables);
} catch (error) {
  if (error instanceof Error) {
    console.error('Analysis failed:', error.message);
  }
}
```

## Performance Tips

1. **Large Datasets**: Use `maxIterations` to limit transitive analysis depth
2. **Memory**: Process tables in batches for very large datasets
3. **Matching Thresholds**: Adjust thresholds based on data quality

## Support

For issues and feature requests, please open an issue on the project repository.
