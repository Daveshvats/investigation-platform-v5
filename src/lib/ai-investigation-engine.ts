/**
 * AI-Powered Investigation Analysis Engine
 * Uses LLM to analyze case data and provide actionable insights for IOs
 */

import ZAI from 'z-ai-web-dev-sdk';
import type { TableProfile, FieldProfile } from './smart-field-detection';

export interface InvestigationInsight {
  type: 'connection' | 'pattern' | 'anomaly' | 'recommendation' | 'narrative' | 'lead';
  title: string;
  description: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  entities: Array<{ field: string; value: string; table: string }>;
  evidence: string[];
  followUpQuestions: string[];
  relatedRecords: Array<{ table: string; recordId: string }>;
}

export interface CaseNarrative {
  summary: string;
  timeline: Array<{ date: string; event: string }>;
  keyEntities: Array<{ type: string; name: string; role: string }>;
  potentialLeads: string[];
  riskAssessment: string;
}

export interface CrossCaseAnalysis {
  similarCases: Array<{ caseId: string; similarity: number; commonFactors: string[] }>;
  commonSuspects: Array<{ name: string; appearances: number; cases: string[] }>;
  commonLocations: Array<{ location: string; cases: string[] }>;
  modusOperandi: string[];
  recommendedActions: string[];
}

export interface QueryResult {
  answer: string;
  relevantRecords: Array<{ table: string; record: Record<string, unknown> }>;
  suggestedQueries: string[];
}

/**
 * Main AI Analysis Engine
 */
export class AIInvestigationEngine {
  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

  private async initZAI() {
    if (!this.zai) {
      this.zai = await ZAI.create();
    }
    return this.zai;
  }

  /**
   * Analyze a single case/record and extract insights
   */
  async analyzeCase(
    tableName: string,
    record: Record<string, unknown>,
    profile: TableProfile
  ): Promise<InvestigationInsight[]> {
    const zai = await this.initZAI();
    
    const recordSummary = this.createRecordSummary(record, profile);
    
    const prompt = `You are an experienced Investigation Officer analyzing case data. Analyze the following record and provide actionable insights.

TABLE: ${tableName}
PURPOSE: ${profile.detectedPurpose}
RECORD DATA:
${recordSummary}

Analyze and provide:
1. Key observations about this case/entity
2. Potential red flags or anomalies
3. Connections that should be investigated
4. Recommended follow-up actions
5. Questions that need answers

Respond in JSON format with an array of insights:
{
  "insights": [
    {
      "type": "connection|pattern|anomaly|recommendation|narrative|lead",
      "title": "Brief title",
      "description": "Detailed description",
      "confidence": 0.0-1.0,
      "severity": "low|medium|high|critical",
      "entities": [{"field": "name", "value": "John Doe", "table": "tableName"}],
      "evidence": ["evidence1", "evidence2"],
      "followUpQuestions": ["question1", "question2"]
    }
  ]
}`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert Investigation Officer with 20 years of experience. Provide professional, actionable insights.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return (parsed.insights || []).map((insight: any) => ({
          ...insight,
          relatedRecords: [],
        }));
      }
    } catch (error) {
      console.error('AI analysis error:', error);
    }

    return [];
  }

  /**
   * Generate a case narrative from records
   */
  async generateNarrative(
    tableName: string,
    records: Record<string, unknown>[],
    profile: TableProfile
  ): Promise<CaseNarrative> {
    const zai = await this.initZAI();
    
    const dataSummary = records.slice(0, 20).map((r, i) => 
      `Record ${i + 1}: ${JSON.stringify(r, null, 2)}`
    ).join('\n\n');

    const prompt = `You are an Investigation Officer creating a case narrative. Based on the following data from table "${tableName}", create a comprehensive narrative.

DATA:
${dataSummary}

Create a case narrative with:
1. Executive Summary (2-3 paragraphs)
2. Timeline of Events (if dates available)
3. Key Entities and their roles
4. Potential Leads to investigate
5. Risk Assessment

Respond in JSON format:
{
  "summary": "Executive summary text",
  "timeline": [{"date": "date", "event": "event description"}],
  "keyEntities": [{"type": "person/company/location", "name": "name", "role": "role in case"}],
  "potentialLeads": ["lead1", "lead2"],
  "riskAssessment": "Assessment text"
}`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert Investigation Officer. Create clear, professional narratives.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
      });

      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Narrative generation error:', error);
    }

    return {
      summary: 'Unable to generate narrative. Please check data.',
      timeline: [],
      keyEntities: [],
      potentialLeads: [],
      riskAssessment: 'Unknown',
    };
  }

  /**
   * Perform cross-case analysis to find connections
   */
  async crossCaseAnalysis(
    tables: Array<{ name: string; records: Record<string, unknown>[]; profile: TableProfile }>
  ): Promise<CrossCaseAnalysis> {
    const zai = await this.initZAI();
    
    // Summarize all tables
    const summaries = tables.map(t => {
      const keyFields = t.profile.fields
        .filter(f => f.detectedType !== 'unknown' && f.detectedType !== 'description')
        .slice(0, 5)
        .map(f => f.fieldName);
      
      const sampleRecords = t.records.slice(0, 5).map(r => {
        const filtered: Record<string, unknown> = {};
        keyFields.forEach(kf => {
          if (r[kf] !== undefined) filtered[kf] = r[kf];
        });
        return filtered;
      });
      
      return {
        table: t.name,
        purpose: t.profile.detectedPurpose,
        recordCount: t.records.length,
        keyFields,
        sampleRecords,
      };
    });

    const prompt = `You are analyzing multiple case/data tables for an investigation. Find connections and patterns.

DATA TABLES:
${JSON.stringify(summaries, null, 2)}

Analyze for:
1. Similar cases based on patterns
2. Common suspects/persons appearing across tables
3. Common locations
4. Modus Operandi patterns
5. Recommended investigative actions

Respond in JSON:
{
  "similarCases": [{"caseId": "table:recordId", "similarity": 0.0-1.0, "commonFactors": ["factor1"]}],
  "commonSuspects": [{"name": "name", "appearances": number, "cases": ["case1"]}],
  "commonLocations": [{"location": "location", "cases": ["case1"]}],
  "modusOperandi": ["pattern1", "pattern2"],
  "recommendedActions": ["action1", "action2"]
}`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert Investigation Officer specializing in pattern recognition and cross-case analysis.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Cross-case analysis error:', error);
    }

    return {
      similarCases: [],
      commonSuspects: [],
      commonLocations: [],
      modusOperandi: [],
      recommendedActions: [],
    };
  }

  /**
   * Natural language query against data
   */
  async queryData(
    query: string,
    tables: Array<{ name: string; records: Record<string, unknown>[] }>
  ): Promise<QueryResult> {
    const zai = await this.initZAI();
    
    // Create searchable summary
    const searchableData = tables.map(t => ({
      table: t.name,
      records: t.records.slice(0, 50).map(r => 
        Object.entries(r)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      ),
    }));

    const prompt = `You are an Investigation Officer searching case data. Answer the query based on available data.

QUERY: "${query}"

AVAILABLE DATA:
${JSON.stringify(searchableData, null, 2)}

Provide:
1. A direct answer to the query
2. List relevant records found
3. Suggested follow-up queries

Respond in JSON:
{
  "answer": "Direct answer to the query",
  "relevantRecords": [{"table": "tableName", "record": {...}}],
  "suggestedQueries": ["suggested query 1", "suggested query 2"]
}`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert Investigation Officer helping with data queries. Be precise and cite records.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Query error:', error);
    }

    return {
      answer: 'Unable to process query. Please try again.',
      relevantRecords: [],
      suggestedQueries: [],
    };
  }

  /**
   * Detect red flags and anomalies
   */
  async detectRedFlags(
    tables: Array<{ name: string; records: Record<string, unknown>[]; profile: TableProfile }>
  ): Promise<InvestigationInsight[]> {
    const zai = await this.initZAI();
    
    const allData = tables.map(t => ({
      table: t.name,
      purpose: t.profile.detectedPurpose,
      fields: t.profile.fields.map(f => ({
        name: f.fieldName,
        type: f.detectedType,
        stats: f.statistics,
      })),
      sampleRecords: t.records.slice(0, 10),
    }));

    const prompt = `You are an Investigation Officer looking for red flags and anomalies. Analyze the data for suspicious patterns.

DATA:
${JSON.stringify(allData, null, 2)}

Look for:
1. Unusual values or outliers
2. Missing critical information
3. Pattern inconsistencies
4. Potential fraud indicators
5. Data quality issues that might hide something

Respond with JSON array of insights:
{
  "insights": [
    {
      "type": "anomaly",
      "title": "Red flag title",
      "description": "Why this is suspicious",
      "confidence": 0.0-1.0,
      "severity": "low|medium|high|critical",
      "entities": [{"field": "name", "value": "value", "table": "tableName"}],
      "evidence": ["evidence1"],
      "followUpQuestions": ["question1"]
    }
  ]
}`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert Investigation Officer specializing in fraud detection and anomaly recognition.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return (parsed.insights || []).map((insight: any) => ({
          ...insight,
          relatedRecords: [],
        }));
      }
    } catch (error) {
      console.error('Red flag detection error:', error);
    }

    return [];
  }

  /**
   * Generate suggested queries based on available data
   */
  async suggestQueries(
    tables: Array<{ name: string; records: Record<string, unknown>[]; profile: TableProfile }>
  ): Promise<string[]> {
    const zai = await this.initZAI();
    
    const summary = tables.map(t => ({
      table: t.name,
      purpose: t.profile.detectedPurpose,
      keyFields: t.profile.fields
        .filter(f => f.detectedType !== 'unknown')
        .slice(0, 5)
        .map(f => `${f.fieldName} (${f.detectedType})`),
    }));

    const prompt = `Based on the following investigation data, suggest 10 useful queries an IO might ask:

${JSON.stringify(summary, null, 2)}

Return JSON array of query strings:
["query1", "query2", ...]`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert Investigation Officer.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
      });

      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Query suggestion error:', error);
    }

    return [
      'Show all records with missing contact information',
      'Find duplicate names across tables',
      'List records by date range',
      'Show high-value transactions',
    ];
  }

  // Helper methods
  private createRecordSummary(record: Record<string, unknown>, profile: TableProfile): string {
    const lines: string[] = [];
    
    for (const field of profile.fields) {
      const value = record[field.fieldName];
      if (value !== null && value !== undefined && value !== '') {
        lines.push(`${field.fieldName} (${field.detectedType}): ${value}`);
      }
    }
    
    return lines.join('\n');
  }
}

// Singleton instance
let engineInstance: AIInvestigationEngine | null = null;

export function getAIEngine(): AIInvestigationEngine {
  if (!engineInstance) {
    engineInstance = new AIInvestigationEngine();
  }
  return engineInstance;
}
