# AI-Powered Investigation Platform

A comprehensive Next.js application for Investigation Officers (IOs) with AI-powered analysis capabilities, working with **any database schema**.

## Key Features for Investigation Officers

### 1. Smart Field Detection
- **Works with ANY table structure** - automatically detects field types regardless of naming conventions
- Recognizes 30+ field types: person names, addresses, phones, emails, dates, amounts, case numbers, PAN, Aadhaar, bank accounts, etc.
- No manual configuration required

### 2. Natural Language Query
- Ask questions in plain English about your data
- Example queries:
  - "Who has appeared in multiple cases?"
  - "What are the common locations across cases?"
  - "Show all records with suspicious amounts"
  - "Find connections between these suspects"

### 3. AI-Powered Insights
- Automatic pattern detection across cases
- Red flag identification
- Anomaly detection
- Connection discovery between entities

### 4. Cross-Case Analysis
- Find common suspects across different cases
- Identify common locations
- Detect modus operandi patterns
- Suggest investigative actions

### 5. Case Narrative Generation
- Automatically generates case summaries
- Creates timelines from data
- Identifies key entities and their roles
- Provides risk assessment

## How to Use

### Starting an Investigation

1. Navigate to **Investigation** tab in the sidebar
2. Select tables from your database that you want to analyze
3. Click **Load** to fetch data
4. Click **Analyze All Data** to start AI analysis

### Using Natural Language Query

1. Go to the **Query** tab
2. Type your question in natural language
3. Get instant answers with relevant records
4. Use suggested follow-up queries

### Viewing Insights

- **Red Flags**: Critical anomalies that need immediate attention
- **Patterns**: Identified patterns across data
- **Connections**: Links between entities and cases
- **Narrative**: Auto-generated case summary

## Practical Use Cases

### 1. Entity Tracking
- Find all records mentioning a specific person
- Track someone across multiple cases/tables
- Identify aliases or variations of names

### 2. Pattern Recognition
- Detect similar modus operandi across cases
- Find common locations where incidents occur
- Identify repeated financial patterns

### 3. Data Quality Checks
- Find missing critical information
- Identify inconsistent data entries
- Detect duplicate records

### 4. Lead Generation
- Get AI-suggested follow-up questions
- Find entities that need further investigation
- Discover hidden connections

## Architecture

```
src/
├── lib/
│   ├── smart-field-detection.ts   # Auto field type detection
│   ├── ai-investigation-engine.ts # AI analysis engine
│   └── pdf-export.ts              # Report generation
├── app/api/
│   ├── analysis/route.ts          # Main analysis API
│   └── export/investigation/      # PDF export API
├── components/investigation/
│   ├── investigation-panel.tsx    # Main UI with tabs
│   └── investigation-view.tsx     # Table selector
└── types/
    └── investigation.ts           # Type definitions
```

## AI Features

The platform uses `z-ai-web-dev-sdk` for:

- **LLM Analysis**: Deep analysis of case data
- **Natural Language Understanding**: Query parsing
- **Narrative Generation**: Case summarization
- **Pattern Recognition**: Anomaly detection

## Supported Field Types

The system automatically detects:

| Category | Types |
|----------|-------|
| **Identity** | person_name, company_name, id_number, pan_number, aadhaar_number |
| **Contact** | phone, email, address, location |
| **Financial** | amount, currency, account_number, ifsc_code |
| **Legal** | case_number, fir_number, status, category |
| **Geographic** | district, state, country, pincode |
| **Temporal** | date, datetime, age |
| **Other** | description, vehicle_number, ip_address, url |

## Configuration

The system works out of the box with any database. Just:

1. Configure your API connection in Settings
2. Select tables to analyze
3. Let AI do the work

## Security

- Classification banners on reports
- Confidentiality markers
- Secure API connections

## Requirements

- Node.js 18+
- Database with REST API access
- z-ai-web-dev-sdk (for AI features)

## License

MIT
