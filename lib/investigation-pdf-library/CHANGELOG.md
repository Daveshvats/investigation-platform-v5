# Changelog

All notable changes to the Investigation PDF Library will be documented in this file.

## [2.0.0] - 2026-02-21

### Added

#### Core Features
- **Data Correlation Analysis**: Complete module for finding relationships between entities across multiple data tables
- **Entity Extraction**: Automatic extraction of persons, companies, addresses, bank accounts, and other entity types from structured data
- **Relationship Detection**: Discovery of direct and transitive relationships between entities
- **Entity Clustering**: Grouping of related entities into meaningful clusters for network analysis

#### Pattern Detection
- **Address Sharing Detection**: Identifies multiple entities sharing the same address
- **Contact Sharing Detection**: Flags shared phone numbers and email addresses
- **Financial Anomaly Detection**: Detects suspicious financial patterns and shared bank accounts
- **Shell Company Indicators**: Identifies potential shell company characteristics
- **Circular Relationship Detection**: Finds circular ownership and transaction patterns
- **Suspicious Timeline Detection**: Identifies unusual timing patterns in data

#### Data Quality Analysis
- **Six Quality Dimensions**: Completeness, Accuracy, Consistency, Timeliness, Validity, Uniqueness
- **Automated Issue Detection**: Identifies missing fields, invalid formats, duplicates
- **Field-Level Analysis**: Detailed analysis of each field's quality metrics
- **Recommendations Engine**: Automatic generation of improvement recommendations

#### PDF Report Generation
- **Professional Cover Pages**: With classification banners, logos, case numbers
- **Table of Contents**: Auto-generated from report sections
- **Executive Summaries**: Automatically generated from analysis results
- **Entity Analysis Sections**: Detailed entity breakdown by type
- **Relationship Visualizations**: Visual representation of entity connections
- **Pattern Summaries**: Severity-coded pattern listings with recommendations
- **Timeline Views**: Chronological display of events
- **Data Quality Reports**: Complete quality assessment documentation
- **Network Graph Summaries**: Visual representation of entity networks

#### Type System
- **Comprehensive Types**: 50+ TypeScript interfaces for type-safe development
- **Entity Types**: Support for 13 entity types (person, company, address, etc.)
- **Relationship Types**: 16 relationship types (owns, employed_by, etc.)
- **Pattern Types**: 12 pattern detection types
- **Timeline Event Types**: 12 event types for chronological analysis

### Changed
- Improved string matching algorithms with configurable thresholds
- Enhanced fuzzy matching for names and addresses
- Optimized correlation analysis for large datasets

### Technical Details

#### Dependencies
- `pdf-lib@^1.17.1` - PDF generation
- `fontkit@^2.0.2` - Font handling

#### File Structure
```
investigation-pdf-library/
├── src/
│   ├── core/
│   │   └── types.ts           # Type definitions
│   ├── analysis/
│   │   ├── correlation-analyzer.ts
│   │   └── quality-analyzer.ts
│   ├── reports/
│   │   └── pdf-generator.ts
│   ├── utils/
│   │   └── helpers.ts
│   └── index.ts               # Main entry point
├── examples/
│   └── basic-usage.ts
├── docs/
│   └── API.md
├── README.md
├── CHANGELOG.md
├── package.json
└── tsconfig.json
```

## [1.0.0] - Initial Release

### Added
- Basic PDF generation using jsPDF
- Table export functionality
- Multi-table export support
- Basic styling options
