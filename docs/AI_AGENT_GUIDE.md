# AI Agent Search & Analysis Guide

## Table of Contents
1. [Quick Start](#quick-start)
2. [Using AI Agent Search](#using-ai-agent-search)
3. [Using Investigation Analysis](#using-investigation-analysis)
4. [Using Local AI Models](#using-local-ai-models)
5. [API Endpoints](#api-endpoints)
6. [Query Examples](#query-examples)

---

## Quick Start

### 1. Start the Application
```bash
bun install
bun run dev
```

### 2. Configure Database Connection
- Go to **Settings** in the sidebar
- Enter your API base URL
- Add bearer token if required
- Click **Test Connection**

### 3. Start Searching
- Navigate to **AI Agent Search** in the sidebar
- Select tables from the database
- Click **Load** to fetch data
- Enter your query and click **AI Search**

---

## Using AI Agent Search

### The AI Agent Workflow

When you enter a query, the AI Agent performs these steps automatically:

```
Your Query → Intent Analysis → Multi-Table Search → Result Compilation → Relevance Ranking → Smart Summary
```

### Search Modes

#### 1. AI Agent Mode (Recommended)
- **When to use**: Complex searches, finding connections, research questions
- **Features**: 
  - Understands natural language
  - Searches multiple tables simultaneously
  - Merges and ranks results
  - Provides insights and summary

#### 2. Quick Search Mode
- **When to use**: Simple lookups, exact matches
- **Features**:
  - Fast text filtering
  - Direct database search
  - Raw results without ranking

### Example Queries

| What You Want | Query Example |
|---------------|---------------|
| Find a person | "Find all records for Rahul Verma" |
| Find connections | "Show connections between John and ABC Corp" |
| Filter by amount | "Show all transactions above 50000" |
| Find by location | "List all cases from Delhi" |
| Find patterns | "Who has multiple bank accounts?" |
| Cross-reference | "Find common addresses between these suspects" |
| Time-based | "Show activity from January 2024" |
| Phone search | "Find records with phone 9936759548" |

### Understanding Results

#### Summary Section
- AI-generated summary of findings
- Key insights about the data
- Confidence score

#### Connected Entities
Shows entities that appear across multiple records:
- **Person names** appearing in multiple tables
- **Addresses** shared by multiple entities
- **Phone numbers** linked to multiple records

#### Ranked Results
Each result shows:
- **Relevance Score**: How well it matches your intent
- **Match Reasons**: Why this result was included
- **Table Source**: Which table it came from
- **Matched Fields**: Which fields matched

---

## Using Investigation Analysis

### Step-by-Step Process

1. **Navigate to Investigation** tab
2. **Select tables** for analysis
3. **Click Load** to fetch data
4. **Click Analyze All Data** to start AI analysis

### Analysis Tabs

#### Query Tab
Ask natural language questions:
```
"What are the key patterns in this data?"
"Who are the main suspects?"
"What locations appear most frequently?"
```

#### Insights Tab
- AI-detected patterns
- Red flags and anomalies
- Recommendations for investigation

#### Data Profile Tab
Shows automatically detected field types:
- Person names, addresses, phones
- Dates, amounts, case numbers
- Fill rates and data quality

#### Connections Tab
- Common suspects across cases
- Shared locations
- Modus operandi patterns
- Table relationships

#### Narrative Tab
AI-generated case narrative:
- Executive summary
- Timeline of events
- Key entities and roles
- Risk assessment

---

## Using Local AI Models

### Option 1: Ollama (Recommended)

#### Install Ollama
```bash
# Linux/macOS
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve
```

#### Pull a Model
```bash
# For investigation work (good reasoning)
ollama pull llama3.1:8b

# For faster responses
ollama pull llama3.2:3b

# For best quality (requires more RAM)
ollama pull llama3.1:70b
```

#### Configure for Local Model

Create or modify `.env.local`:
```env
# Ollama configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Disable cloud AI
USE_LOCAL_AI=true
```

### Option 2: LM Studio

1. Download LM Studio from https://lmstudio.ai/
2. Install and open the application
3. Download a model (e.g., Llama 3.1 8B)
4. Start the local server (usually port 1234)

Configure `.env.local`:
```env
LM_STUDIO_URL=http://localhost:1234/v1
USE_LOCAL_AI=true
```

### Option 3: vLLM Server

For production deployments:

```bash
# Install vLLM
pip install vllm

# Start server
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-3.1-8B-Instruct \
    --host 0.0.0.0 \
    --port 8000
```

Configure `.env.local`:
```env
VLLM_URL=http://localhost:8000/v1
USE_LOCAL_AI=true
```

### Modifying the Code for Local Models

Edit `src/lib/ai-investigation-engine.ts`:

```typescript
// For Ollama
async initZAI() {
  if (!this.zai) {
    // Use Ollama-compatible endpoint
    this.zai = await ZAI.create({
      baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
      model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
    });
  }
  return this.zai;
}
```

Or create a separate local AI client:

```typescript
// src/lib/local-ai-client.ts
export class LocalAIClient {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://localhost:11434/v1', model = 'llama3.1:8b') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async chat(messages: Array<{role: string; content: string}>): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }
}
```

### Recommended Models for Investigation

| Model | Size | Best For | RAM Required |
|-------|------|----------|--------------|
| Llama 3.2 3B | 3B | Quick searches | 8GB |
| Llama 3.1 8B | 8B | Balanced performance | 16GB |
| Llama 3.1 70B | 70B | Complex analysis | 48GB |
| Mistral 7B | 7B | Fast reasoning | 16GB |
| Qwen 2.5 14B | 14B | Good multilingual | 24GB |

---

## API Endpoints

### AI Agent Search
```http
POST /api/ai-search
Content-Type: application/json

{
  "query": "Find all connections between John and ABC Corp",
  "tables": [
    {
      "name": "customers",
      "records": [...]
    }
  ],
  "priority": "thorough"
}
```

**Response:**
```json
{
  "success": true,
  "query": "...",
  "intent": {
    "interpretedIntent": "...",
    "searchType": "connection",
    "targetEntities": ["person", "company"]
  },
  "results": [
    {
      "id": "table-0",
      "table": "customers",
      "record": {...},
      "relevanceScore": 15,
      "matchReasons": ["Exact match in name"],
      "matchedFields": ["name"]
    }
  ],
  "mergedEntities": [
    {
      "identifier": "John Doe",
      "type": "person",
      "appearances": [...],
      "connectionStrength": 3
    }
  ],
  "summary": "Found 5 results...",
  "insights": ["John appears in 3 different tables"],
  "followUpSuggestions": ["Search for John's address history"]
}
```

### Investigation Analysis
```http
POST /api/analysis
Content-Type: application/json

{
  "tables": [...],
  "analysisType": "full"
}
```

### Natural Language Query
```http
POST /api/analysis
Content-Type: application/json

{
  "tables": [...],
  "analysisType": "query",
  "query": "Who has appeared in multiple cases?"
}
```

---

## Query Examples by Use Case

### Investigation Queries

#### Person Investigation
```
"Find all records mentioning Rahul Verma"
"Show me everyone with the phone number 9936759548"
"Who lives at the address in Hamirpur?"
"List all people associated with this email domain"
```

#### Financial Investigation
```
"Show transactions above 10 lakhs"
"Find accounts with the same IFSC code"
"List all high-value deposits in January"
"Who has multiple bank accounts?"
```

#### Location-Based
```
"Show all cases from Delhi"
"Find records with addresses in Uttar Pradesh"
"What locations appear most frequently?"
"Map all addresses from these suspects"
```

#### Connection Finding
```
"Find connections between suspect A and company B"
"Who shares the same address?"
"Show the network around this phone number"
"What entities are linked to this case?"
```

#### Pattern Detection
```
"What patterns do you see in the data?"
"Find anomalies in transaction amounts"
"Show unusual activity patterns"
"Identify potential shell companies"
```

#### Cross-Case Analysis
```
"Who appears in multiple cases?"
"Find common locations across cases"
"What is the modus operandi pattern?"
"Show suspects with similar profiles"
```

---

## Tips for Best Results

### 1. Be Specific
- Bad: "Search John"
- Good: "Find all records where the name contains John"

### 2. Use Natural Language
- Bad: "name:John AND city:Delhi"
- Good: "Find all people named John who are in Delhi"

### 3. Ask Follow-up Questions
After initial results, use the suggested queries or ask:
- "Tell me more about [entity]"
- "Show connections for [entity]"
- "What else is related to this?"

### 4. Select Relevant Tables
- Only load tables that might contain relevant data
- Loading fewer tables = faster, more focused results

### 5. Use the Right Mode
- **Quick Search**: Simple exact matches
- **AI Agent**: Complex questions, connections, patterns
- **Investigation**: Full analysis with insights

---

## Troubleshooting

### AI Not Responding
1. Check if API is configured in Settings
2. For local models, verify Ollama is running: `ollama list`
3. Check console for errors

### No Results Found
1. Verify tables are loaded (check record count)
2. Try broader search terms
3. Use different query phrasing
4. Check if data exists in the tables

### Slow Performance
1. Use "fast" priority for AI search
2. Load fewer tables
3. Use local AI model
4. Reduce record count per table

---

## Privacy & Security

- All AI processing happens server-side
- Local models keep data on your machine
- No data is sent to external servers when using local AI
- Database credentials are stored locally only
