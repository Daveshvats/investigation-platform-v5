/**
 * AI Agent Search Engine
 * 
 * A sophisticated search system that combines:
 * 1. Multi-table database search
 * 2. Result compilation and merging
 * 3. Relevance ranking based on user intent
 * 4. Contextual summarization
 * 
 * Workflow:
 * - User provides a search prompt/intent
 * - Agent analyzes the intent and plans searches
 * - Agent searches across all tables with multiple strategies
 * - Results are compiled, deduplicated, and merged
 * - Results are ranked by relevance to the user's intent
 * - Agent provides a summary and insights
 */

import ZAI from 'z-ai-web-dev-sdk';
import type { TableProfile, FieldProfile, DetectedFieldType } from './smart-field-detection';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchIntent {
  originalQuery: string;
  interpretedIntent: string;
  searchType: 'person' | 'location' | 'transaction' | 'case' | 'general' | 'connection' | 'pattern';
  targetEntities: string[];
  targetFields: string[];
  timeRange?: { start?: Date; end?: Date };
  filters: SearchFilter[];
  priority: 'fast' | 'thorough' | 'comprehensive';
}

export interface SearchFilter {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between' | 'in';
  value: unknown;
}

export interface SearchResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  relevanceScore: number;
  matchReasons: string[];
  matchedFields: string[];
  highlightedFields: Record<string, { original: unknown; highlight: string }>;
}

export interface CompiledResults {
  query: string;
  intent: SearchIntent;
  totalRecordsSearched: number;
  searchDuration: number;
  results: SearchResult[];
  mergedEntities: MergedEntity[];
  summary: string;
  insights: string[];
  followUpSuggestions: string[];
  confidence: number;
}

export interface MergedEntity {
  identifier: string;
  type: 'person' | 'company' | 'location' | 'account' | 'other';
  appearances: Array<{ table: string; recordId: string; role?: string }>;
  aggregatedData: Record<string, unknown>;
  connectionStrength: number;
}

export interface AgentSearchProgress {
  stage: 'analyzing' | 'searching' | 'compiling' | 'ranking' | 'summarizing' | 'complete';
  message: string;
  progress: number;
  tablesSearched: string[];
  recordsFound: number;
}

// ============================================================================
// AI AGENT SEARCH ENGINE
// ============================================================================

export class AIAgentSearchEngine {
  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
  private progressCallback?: (progress: AgentSearchProgress) => void;

  constructor(progressCallback?: (progress: AgentSearchProgress) => void) {
    this.progressCallback = progressCallback;
  }

  private async initZAI() {
    if (!this.zai) {
      this.zai = await ZAI.create();
    }
    return this.zai;
  }

  private updateProgress(progress: AgentSearchProgress) {
    this.progressCallback?.(progress);
  }

  /**
   * Main entry point - AI Agent searches based on user prompt
   */
  async search(
    query: string,
    tables: Array<{
      name: string;
      records: Record<string, unknown>[];
      profile: TableProfile;
    }>,
    options?: { priority?: 'fast' | 'thorough' | 'comprehensive' }
  ): Promise<CompiledResults> {
    const startTime = Date.now();
    const priority = options?.priority || 'thorough';

    // Stage 1: Analyze Intent
    this.updateProgress({
      stage: 'analyzing',
      message: 'Understanding your search intent...',
      progress: 10,
      tablesSearched: [],
      recordsFound: 0,
    });

    const intent = await this.analyzeSearchIntent(query, tables);
    intent.priority = priority;

    // Stage 2: Execute Searches
    this.updateProgress({
      stage: 'searching',
      message: 'Searching across tables...',
      progress: 30,
      tablesSearched: [],
      recordsFound: 0,
    });

    const searchResults = await this.executeSearches(intent, tables);

    // Stage 3: Compile Results
    this.updateProgress({
      stage: 'compiling',
      message: 'Compiling and merging results...',
      progress: 50,
      tablesSearched: tables.map(t => t.name),
      recordsFound: searchResults.length,
    });

    const mergedEntities = await this.mergeEntities(searchResults, tables);

    // Stage 4: Rank Results
    this.updateProgress({
      stage: 'ranking',
      message: 'Ranking by relevance...',
      progress: 70,
      tablesSearched: tables.map(t => t.name),
      recordsFound: searchResults.length,
    });

    const rankedResults = await this.rankResults(searchResults, intent, mergedEntities);

    // Stage 5: Generate Summary
    this.updateProgress({
      stage: 'summarizing',
      message: 'Generating insights...',
      progress: 90,
      tablesSearched: tables.map(t => t.name),
      recordsFound: rankedResults.length,
    });

    const { summary, insights, followUpSuggestions } = await this.generateSummary(
      query,
      intent,
      rankedResults,
      mergedEntities
    );

    // Complete
    this.updateProgress({
      stage: 'complete',
      message: 'Search complete!',
      progress: 100,
      tablesSearched: tables.map(t => t.name),
      recordsFound: rankedResults.length,
    });

    return {
      query,
      intent,
      totalRecordsSearched: tables.reduce((sum, t) => sum + t.records.length, 0),
      searchDuration: Date.now() - startTime,
      results: rankedResults,
      mergedEntities,
      summary,
      insights,
      followUpSuggestions,
      confidence: this.calculateConfidence(rankedResults, intent),
    };
  }

  /**
   * Analyze user's search intent using AI
   */
  private async analyzeSearchIntent(
    query: string,
    tables: Array<{ name: string; profile: TableProfile }>
  ): Promise<SearchIntent> {
    const zai = await this.initZAI();

    const tableInfo = tables.map(t => ({
      name: t.name,
      purpose: t.profile.detectedPurpose,
      keyFields: t.profile.keyFields.slice(0, 5),
      fieldTypes: t.profile.fields.slice(0, 10).map(f => ({
        name: f.fieldName,
        type: f.detectedType,
      })),
    }));

    const prompt = `You are an AI search assistant for investigators. Analyze the user's search query and determine the search intent.

USER QUERY: "${query}"

AVAILABLE TABLES:
${JSON.stringify(tableInfo, null, 2)}

Analyze and respond in JSON format:
{
  "interpretedIntent": "Clear description of what the user is looking for",
  "searchType": "person|location|transaction|case|general|connection|pattern",
  "targetEntities": ["entity types to look for, e.g., 'person names', 'companies', 'addresses'"],
  "targetFields": ["specific field names that might be relevant"],
  "timeRange": {"start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null"},
  "filters": [{"field": "field name", "operator": "equals|contains|greaterThan|etc", "value": "value"}],
  "searchStrategy": "Description of how to search"
}`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert search intent analyzer. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          originalQuery: query,
          ...parsed,
          filters: parsed.filters || [],
        };
      }
    } catch (error) {
      console.error('Intent analysis error:', error);
    }

    // Fallback
    return {
      originalQuery: query,
      interpretedIntent: query,
      searchType: 'general',
      targetEntities: [],
      targetFields: [],
      filters: [],
    };
  }

  /**
   * Execute searches across all tables
   */
  private async executeSearches(
    intent: SearchIntent,
    tables: Array<{
      name: string;
      records: Record<string, unknown>[];
      profile: TableProfile;
    }>
  ): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];
    let tablesSearched = 0;

    for (const table of tables) {
      tablesSearched++;
      this.updateProgress({
        stage: 'searching',
        message: `Searching ${table.name}...`,
        progress: 30 + (tablesSearched / tables.length) * 20,
        tablesSearched: tables.slice(0, tablesSearched).map(t => t.name),
        recordsFound: allResults.length,
      });

      // Multi-strategy search
      const tableResults = this.searchTable(intent, table);
      allResults.push(...tableResults);
    }

    // Deduplicate by table + record signature
    const seen = new Set<string>();
    return allResults.filter(result => {
      const signature = `${result.table}:${JSON.stringify(result.record).slice(0, 100)}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  /**
   * Search a single table with multiple strategies
   */
  private searchTable(
    intent: SearchIntent,
    table: { name: string; records: Record<string, unknown>[]; profile: TableProfile }
  ): SearchResult[] {
    const results: SearchResult[] = [];
    const query = intent.originalQuery.toLowerCase();
    const queryTerms = query.split(/\s+/).filter(t => t.length > 2);

    for (let i = 0; i < table.records.length; i++) {
      const record = table.records[i];
      const matchReasons: string[] = [];
      const matchedFields: string[] = [];
      const highlightedFields: Record<string, { original: unknown; highlight: string }> = {};
      let relevanceScore = 0;

      // Strategy 1: Exact field match
      for (const field of Object.keys(record)) {
        const value = record[field];
        if (value === null || value === undefined) continue;

        const strValue = String(value).toLowerCase();

        // Check for query match
        if (strValue.includes(query) || query.includes(strValue)) {
          relevanceScore += 10;
          matchReasons.push(`Exact match in ${field}`);
          matchedFields.push(field);
          highlightedFields[field] = {
            original: value,
            highlight: `**${value}**`,
          };
        }

        // Check for term matches
        for (const term of queryTerms) {
          if (strValue.includes(term)) {
            relevanceScore += 3;
            if (!matchedFields.includes(field)) {
              matchedFields.push(field);
            }
            // Highlight the term
            const regex = new RegExp(`(${term})`, 'gi');
            highlightedFields[field] = {
              original: value,
              highlight: strValue.replace(regex, '**$1**'),
            };
          }
        }
      }

      // Strategy 2: Filter-based matching
      for (const filter of intent.filters) {
        const fieldValue = record[filter.field];
        if (fieldValue === undefined) continue;

        let matches = false;
        switch (filter.operator) {
          case 'equals':
            matches = String(fieldValue).toLowerCase() === String(filter.value).toLowerCase();
            break;
          case 'contains':
            matches = String(fieldValue).toLowerCase().includes(String(filter.value).toLowerCase());
            break;
          case 'greaterThan':
            matches = Number(fieldValue) > Number(filter.value);
            break;
          case 'lessThan':
            matches = Number(fieldValue) < Number(filter.value);
            break;
        }

        if (matches) {
          relevanceScore += 15;
          matchReasons.push(`Filter match: ${filter.field}`);
        }
      }

      // Strategy 3: Entity type matching
      for (const entityType of intent.targetEntities) {
        const matchingField = table.profile.fields.find(
          f => f.detectedType.toLowerCase().includes(entityType.toLowerCase()) ||
               f.fieldName.toLowerCase().includes(entityType.toLowerCase())
        );

        if (matchingField && record[matchingField.fieldName]) {
          relevanceScore += 5;
          matchReasons.push(`Entity type match: ${entityType}`);
        }
      }

      // Strategy 4: Key field priority
      for (const keyField of table.profile.keyFields) {
        if (matchedFields.includes(keyField)) {
          relevanceScore += 5; // Bonus for matching key fields
        }
      }

      if (relevanceScore > 0) {
        results.push({
          id: `${table.name}-${i}`,
          table: table.name,
          record,
          relevanceScore,
          matchReasons,
          matchedFields,
          highlightedFields,
        });
      }
    }

    return results;
  }

  /**
   * Merge entities that appear across multiple records
   */
  private async mergeEntities(
    results: SearchResult[],
    tables: Array<{ name: string; records: Record<string, unknown>[]; profile: TableProfile }>
  ): Promise<MergedEntity[]> {
    const zai = await this.initZAI();

    // Group by potential identifiers (names, phones, emails, addresses)
    const entityGroups = new Map<string, MergedEntity>();

    // Get identifier fields from profiles
    const identifierTypes: DetectedFieldType[] = ['person_name', 'phone', 'email', 'address', 'account_number', 'pan_number'];

    for (const result of results) {
      const table = tables.find(t => t.name === result.table);
      if (!table) continue;

      const identifierFields = table.profile.fields.filter(
        f => identifierTypes.includes(f.detectedType)
      );

      for (const field of identifierFields) {
        const value = result.record[field.fieldName];
        if (!value || String(value).trim() === '') continue;

        const normalizedId = String(value).toLowerCase().trim();
        const existingEntity = entityGroups.get(normalizedId);

        if (existingEntity) {
          existingEntity.appearances.push({
            table: result.table,
            recordId: result.id,
          });
          existingEntity.connectionStrength += 1;
        } else {
          entityGroups.set(normalizedId, {
            identifier: String(value),
            type: this.mapFieldTypeToEntityType(field.detectedType),
            appearances: [{ table: result.table, recordId: result.id }],
            aggregatedData: { [field.fieldName]: value },
            connectionStrength: 1,
          });
        }
      }
    }

    // Filter to entities with multiple appearances
    return Array.from(entityGroups.values())
      .filter(e => e.appearances.length > 1 || e.connectionStrength > 1)
      .sort((a, b) => b.connectionStrength - a.connectionStrength);
  }

  private mapFieldTypeToEntityType(type: DetectedFieldType): MergedEntity['type'] {
    switch (type) {
      case 'person_name':
        return 'person';
      case 'company_name':
        return 'company';
      case 'address':
      case 'location':
        return 'location';
      case 'account_number':
        return 'account';
      default:
        return 'other';
    }
  }

  /**
   * Rank results by relevance to user intent
   */
  private async rankResults(
    results: SearchResult[],
    intent: SearchIntent,
    mergedEntities: MergedEntity[]
  ): Promise<SearchResult[]> {
    const zai = await this.initZAI();

    if (results.length === 0) return [];

    // Boost scores for results connected to frequently appearing entities
    const entityBoost = new Map<string, number>();
    for (const entity of mergedEntities) {
      for (const appearance of entity.appearances) {
        entityBoost.set(appearance.recordId, (entityBoost.get(appearance.recordId) || 0) + entity.connectionStrength);
      }
    }

    // Apply boosts
    for (const result of results) {
      const boost = entityBoost.get(result.id) || 0;
      result.relevanceScore += boost * 2;
    }

    // Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Limit to top results
    const maxResults = intent.priority === 'comprehensive' ? 100 : intent.priority === 'thorough' ? 50 : 20;
    return results.slice(0, maxResults);
  }

  /**
   * Generate summary and insights
   */
  private async generateSummary(
    query: string,
    intent: SearchIntent,
    results: SearchResult[],
    mergedEntities: MergedEntity[]
  ): Promise<{ summary: string; insights: string[]; followUpSuggestions: string[] }> {
    const zai = await this.initZAI();

    if (results.length === 0) {
      return {
        summary: 'No results found for your query. Try broadening your search terms.',
        insights: ['Consider using alternative keywords', 'Check if the data exists in other tables'],
        followUpSuggestions: ['Show all tables', 'What fields are searchable?'],
      };
    }

    const topResults = results.slice(0, 10).map(r => ({
      table: r.table,
      matchedFields: r.matchedFields.slice(0, 3),
      relevanceScore: r.relevanceScore,
      sampleData: Object.fromEntries(
        Object.entries(r.record).slice(0, 5)
      ),
    }));

    const prompt = `You are an AI investigation assistant. The user searched for "${query}".

INTENT: ${intent.interpretedIntent}

TOP RESULTS (${results.length} total):
${JSON.stringify(topResults, null, 2)}

CONNECTED ENTITIES (appearing in multiple results):
${JSON.stringify(mergedEntities.slice(0, 5), null, 2)}

Generate a response with:
{
  "summary": "2-3 sentence summary of findings",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "followUpSuggestions": ["suggested query 1", "suggested query 2", "suggested query 3"]
}`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert investigation assistant. Provide actionable insights.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Summary generation error:', error);
    }

    return {
      summary: `Found ${results.length} results across ${new Set(results.map(r => r.table)).size} tables.`,
      insights: [],
      followUpSuggestions: [],
    };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(results: SearchResult[], intent: SearchIntent): number {
    if (results.length === 0) return 0;

    const avgRelevance = results.reduce((sum, r) => sum + r.relevanceScore, 0) / results.length;
    const maxRelevance = Math.max(...results.map(r => r.relevanceScore));

    // Normalize to 0-1 range
    const normalizedAvg = Math.min(avgRelevance / 20, 1);
    const resultCount = Math.min(results.length / 10, 1);

    return (normalizedAvg * 0.6 + resultCount * 0.4);
  }
}

export default AIAgentSearchEngine;
