/**
 * Global AI Search Engine - Enhanced Version
 * 
 * Features:
 * 1. Recursive pagination using has_more and cursor
 * 2. Smart query generation with AI
 * 3. Stores all results before analysis
 * 4. Better fallback strategies
 * 5. Comprehensive error handling
 * 
 * API Contract:
 * - GET /api/search?q=term&limit=100&cursor=xxx
 * - Returns: { results: { table: [records] }, has_more: boolean, next_cursor: string }
 */

import { createLogger } from './logger';
import { getUnifiedAI, shouldUseLocalAI, type ChatMessage } from './local-ai-client';

const logger = createLogger('GlobalAISearch');

// ============================================================================
// TYPES
// ============================================================================

export interface SearchQuery {
  term: string;
  type: 'primary' | 'secondary' | 'derived' | 'entity';
  focus?: string;
  priority: number; // Higher = search first
}

export interface GlobalSearchResult {
  table: string;
  record: Record<string, unknown>;
  matchedQuery?: string;
}

export interface PaginatedSearchResponse {
  results: Record<string, unknown[]>;
  has_more: boolean;
  next_cursor: string | null;
  search_time: number;
  query: string;
  limit: number;
}

export interface AnalyzedResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  relevanceScore: number;
  matchReasons: string[];
  matchedFields: string[];
  searchSource: string;
}

export interface EntityConnection {
  identifier: string;
  type: 'person' | 'company' | 'location' | 'account' | 'phone' | 'email' | 'other';
  appearances: Array<{
    table: string;
    recordId: string;
    field?: string;
  }>;
  connectionStrength: number;
  relatedEntities: string[];
}

export interface SearchAnalysis {
  summary: string;
  keyFindings: string[];
  connections: EntityConnection[];
  patterns: string[];
  recommendations: string[];
  redFlags: string[];
  dataQuality: {
    completeness: number;
    consistency: number;
    notes: string[];
  };
}

export interface GlobalSearchResponse {
  results: AnalyzedResult[];
  allResults: GlobalSearchResult[];
  queries: SearchQuery[];
  analysis: SearchAnalysis;
  metadata: {
    totalSearched: number;
    resultsFound: number;
    searchDuration: number;
    analysisDuration: number;
    queriesExecuted: number;
    pagesFetched: number;
    aiMode: 'cloud' | 'local' | 'fallback';
  };
}

export interface ProgressUpdate {
  stage: 'analyzing' | 'searching' | 'paginating' | 'compiling' | 'analyzing_results' | 'complete';
  message: string;
  progress: number;
  currentQuery?: string;
  queriesExecuted: number;
  resultsFound: number;
  pagesFetched: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SEARCH_CONFIG = {
  maxPagesPerQuery: 10,        // Max pages to fetch per query
  pageSize: 100,                // Results per page
  maxConcurrentQueries: 3,      // Parallel query limit
  queryTimeout: 30000,          // 30 second timeout per query
  maxTotalResults: 5000,        // Max results to collect
  minQueryLength: 2,            // Min characters for a search term
};

// ============================================================================
// GLOBAL AI SEARCH ENGINE
// ============================================================================

export class GlobalAISearchEngine {
  private progressCallback?: (progress: ProgressUpdate) => void;
  private apiBaseUrl: string;
  private bearerToken?: string;
  private aiMode: 'cloud' | 'local' | 'fallback' = 'cloud';
  private storedResults: GlobalSearchResult[] = [];
  private pagesFetched = 0;

  constructor(
    options?: {
      progressCallback?: (progress: ProgressUpdate) => void;
      apiBaseUrl?: string;
      bearerToken?: string;
    }
  ) {
    this.progressCallback = options?.progressCallback;
    this.apiBaseUrl = options?.apiBaseUrl || '';
    this.bearerToken = options?.bearerToken;
    
    if (shouldUseLocalAI()) {
      this.aiMode = 'local';
      logger.info('Using local AI model');
    } else {
      this.aiMode = 'cloud';
      logger.info('Using cloud AI model');
    }
  }

  private updateProgress(progress: ProgressUpdate) {
    logger.debug(`Progress: ${progress.stage} - ${progress.message}`);
    this.progressCallback?.(progress);
  }

  /**
   * Execute a single paginated search API call
   */
  private async fetchSearchPage(
    query: string, 
    cursor?: string
  ): Promise<PaginatedSearchResponse> {
    const startTime = Date.now();
    
    logger.debug('API Request: GET /api/search', { q: query, cursor, limit: SEARCH_CONFIG.pageSize });

    try {
      const url = new URL('/api/search', this.apiBaseUrl || 'http://localhost:8080');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(SEARCH_CONFIG.pageSize));
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.bearerToken) {
        headers['Authorization'] = `Bearer ${this.bearerToken}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SEARCH_CONFIG.queryTimeout);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(`Search API error: ${response.status}`, null, { body: errorBody });
        throw new Error(`Search API returned ${response.status}: ${errorBody}`);
      }

      const data: PaginatedSearchResponse = await response.json();
      const duration = Date.now() - startTime;

      logger.apiResponse('GET', '/api/search', response.status, duration, {
        resultCount: Object.values(data.results || {}).flat().length,
        hasMore: data.has_more,
      });

      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.apiError('GET', '/api/search', error, duration);
      throw error;
    }
  }

  /**
   * Recursively fetch all pages for a query until has_more = false
   */
  private async fetchAllPages(query: string): Promise<GlobalSearchResult[]> {
    const allResults: GlobalSearchResult[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < SEARCH_CONFIG.maxPagesPerQuery) {
      try {
        const response = await this.fetchSearchPage(query, cursor);
        pageCount++;
        this.pagesFetched++;

        // Extract results from response
        if (response.results) {
          for (const [table, records] of Object.entries(response.results)) {
            if (Array.isArray(records)) {
              for (const record of records) {
                allResults.push({
                  table,
                  record: record as Record<string, unknown>,
                  matchedQuery: query,
                });
              }
            }
          }
        }

        // Check if we should continue
        hasMore = response.has_more || false;
        cursor = response.next_cursor || undefined;

        // Update progress
        this.updateProgress({
          stage: 'paginating',
          message: `Fetched page ${pageCount} for "${query}" (${allResults.length} results so far)`,
          progress: 0,
          queriesExecuted: 1,
          resultsFound: allResults.length,
          pagesFetched: this.pagesFetched,
          currentQuery: query,
        });

        // Stop if we have enough results
        if (allResults.length >= SEARCH_CONFIG.maxTotalResults) {
          logger.info(`Reached max results limit for query: ${query}`);
          break;
        }

        // If no cursor but has_more is true, something is wrong - stop
        if (hasMore && !cursor) {
          logger.warn('has_more is true but no cursor provided, stopping pagination');
          break;
        }

      } catch (error) {
        logger.error(`Failed to fetch page ${pageCount + 1} for query: ${query}`, error);
        // Continue with results we have so far
        break;
      }
    }

    logger.info(`Fetched ${allResults.length} results in ${pageCount} pages for query: ${query}`);
    return allResults;
  }

  /**
   * Call AI with proper error handling
   */
  private async callAI(prompt: string, systemPrompt: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    try {
      const ai = getUnifiedAI();
      const response = await ai.chat(messages);
      return response.content;
    } catch (error) {
      logger.error('AI call failed', error);
      throw error;
    }
  }

  /**
   * Main entry point - AI-powered search with automatic query generation
   */
  async search(userQuery: string): Promise<GlobalSearchResponse> {
    const totalStartTime = Date.now();
    this.storedResults = [];
    this.pagesFetched = 0;

    logger.info(`Starting search for: "${userQuery}"`);

    // Stage 1: Analyze intent and generate search queries
    this.updateProgress({
      stage: 'analyzing',
      message: 'Analyzing your query and planning search strategy...',
      progress: 5,
      queriesExecuted: 0,
      resultsFound: 0,
      pagesFetched: 0,
    });

    let queries: SearchQuery[];
    try {
      queries = await this.generateSmartQueries(userQuery);
      logger.info(`Generated ${queries.length} search queries`, { queries: queries.map(q => q.term) });
    } catch (error) {
      logger.warn('AI query generation failed, using smart fallback', error);
      this.aiMode = 'fallback';
      queries = this.generateSmartFallbackQueries(userQuery);
    }

    // Sort queries by priority
    queries.sort((a, b) => b.priority - a.priority);

    // Stage 2: Execute searches with pagination
    this.updateProgress({
      stage: 'searching',
      message: `Executing ${queries.length} search queries with pagination...`,
      progress: 15,
      queriesExecuted: 0,
      resultsFound: 0,
      pagesFetched: 0,
    });

    await this.executeAllSearchesWithPagination(queries);

    // Stage 3: Compile and deduplicate stored results
    this.updateProgress({
      stage: 'compiling',
      message: `Compiling ${this.storedResults.length} results...`,
      progress: 60,
      queriesExecuted: queries.length,
      resultsFound: this.storedResults.length,
      pagesFetched: this.pagesFetched,
    });

    const compiledResults = this.compileResults(this.storedResults, queries);

    // Stage 4: Analyze results with AI
    this.updateProgress({
      stage: 'analyzing_results',
      message: 'Analyzing results and generating insights...',
      progress: 75,
      queriesExecuted: queries.length,
      resultsFound: compiledResults.length,
      pagesFetched: this.pagesFetched,
    });

    let analysis: SearchAnalysis;
    try {
      analysis = await this.analyzeResults(userQuery, compiledResults);
    } catch (error) {
      logger.warn('AI analysis failed, using fallback analysis', error);
      this.aiMode = 'fallback';
      analysis = this.generateFallbackAnalysis(userQuery, compiledResults);
    }

    // Complete
    this.updateProgress({
      stage: 'complete',
      message: 'Search and analysis complete!',
      progress: 100,
      queriesExecuted: queries.length,
      resultsFound: compiledResults.length,
      pagesFetched: this.pagesFetched,
    });

    const totalDuration = Date.now() - totalStartTime;
    logger.info(`Search completed in ${totalDuration}ms`, {
      results: compiledResults.length,
      queries: queries.length,
      pages: this.pagesFetched,
      aiMode: this.aiMode,
    });

    return {
      results: compiledResults,
      allResults: this.storedResults,
      queries,
      analysis,
      metadata: {
        totalSearched: this.storedResults.length,
        resultsFound: compiledResults.length,
        searchDuration: totalDuration,
        analysisDuration: 0,
        queriesExecuted: queries.length,
        pagesFetched: this.pagesFetched,
        aiMode: this.aiMode,
      },
    };
  }

  /**
   * Generate smart search queries using AI
   */
  private async generateSmartQueries(userQuery: string): Promise<SearchQuery[]> {
    const prompt = `You are an AI search assistant for investigators. Analyze the user's search query and generate effective search terms.

USER QUERY: "${userQuery}"

Generate search terms that will find relevant information across all database tables.
Rules:
1. Extract specific entities (names, companies, locations, IDs, phone numbers)
2. Create variations for names (partial matches, alternate spellings)
3. Prioritize specific terms over common words
4. Each term should be meaningful and likely to find results

Respond ONLY with valid JSON in this exact format:
{
  "queries": [
    {
      "term": "search term",
      "type": "primary",
      "focus": "what this finds",
      "priority": 10
    }
  ]
}

Priority should be 1-10 where 10 is most important.`;

    const content = await this.callAI(
      prompt,
      'You are a search query expert. Always respond with valid JSON. No explanations, just JSON.'
    );

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
          return parsed.queries.map((q: { term?: string; type?: string; focus?: string; priority?: number }) => ({
            term: String(q.term || userQuery),
            type: q.type || 'primary',
            focus: q.focus,
            priority: Number(q.priority) || 5,
          }));
        }
      } catch (e) {
        logger.warn('Failed to parse AI query response', e);
      }
    }

    throw new Error('Failed to parse AI-generated queries');
  }

  /**
   * Generate smart fallback queries without AI
   */
  private generateSmartFallbackQueries(userQuery: string): SearchQuery[] {
    const queries: SearchQuery[] = [];
    const lowerQuery = userQuery.toLowerCase();

    // 1. Full query as primary
    queries.push({
      term: userQuery,
      type: 'primary',
      focus: 'Exact match',
      priority: 10,
    });

    // 2. Extract potential names (capitalized words)
    const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
    const names = userQuery.match(namePattern) || [];
    for (const name of names) {
      queries.push({
        term: name,
        type: 'entity',
        focus: 'Person/Company name',
        priority: 9,
      });
      // Add individual name parts
      const parts = name.split(/\s+/);
      if (parts.length > 1) {
        for (const part of parts) {
          if (part.length > 2) {
            queries.push({
              term: part,
              type: 'secondary',
              focus: 'Name part',
              priority: 6,
            });
          }
        }
      }
    }

    // 3. Extract locations (after "from", "in", "at")
    const locationPattern = /(?:from|in|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
    let match;
    while ((match = locationPattern.exec(userQuery)) !== null) {
      queries.push({
        term: match[1],
        type: 'entity',
        focus: 'Location',
        priority: 8,
      });
    }

    // 4. Extract words that are likely meaningful (longer than 3 chars, not common words)
    const commonWords = new Set(['find', 'search', 'show', 'list', 'all', 'who', 'what', 'where', 'when', 'from', 'with', 'that', 'this', 'have', 'has', 'been', 'are', 'was', 'were', 'been']);
    const words = userQuery.split(/\s+/).filter(w => {
      const lower = w.toLowerCase();
      return w.length > 3 && !commonWords.has(lower) && !/^[A-Z]{2,}$/.test(w); // Exclude acronyms
    });

    for (const word of words) {
      if (!queries.some(q => q.term.toLowerCase() === word.toLowerCase())) {
        queries.push({
          term: word,
          type: 'secondary',
          focus: 'Keyword',
          priority: 5,
        });
      }
    }

    // 5. Lowercase variations
    if (userQuery.toLowerCase() !== userQuery) {
      queries.push({
        term: userQuery.toLowerCase(),
        type: 'derived',
        focus: 'Case variation',
        priority: 4,
      });
    }

    // Deduplicate and return
    const seen = new Set<string>();
    return queries.filter(q => {
      const key = q.term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return q.term.length >= SEARCH_CONFIG.minQueryLength;
    });
  }

  /**
   * Execute all searches with pagination
   */
  private async executeAllSearchesWithPagination(queries: SearchQuery[]): Promise<void> {
    let completedQueries = 0;

    // Process in batches
    for (let i = 0; i < queries.length; i += SEARCH_CONFIG.maxConcurrentQueries) {
      const batch = queries.slice(i, i + SEARCH_CONFIG.maxConcurrentQueries);

      const batchPromises = batch.map(async (query) => {
        try {
          const results = await this.fetchAllPages(query.term);
          return results;
        } catch (error) {
          logger.error(`Search failed for query: ${query.term}`, error);
          return [];
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Store results
      for (const results of batchResults) {
        this.storedResults.push(...results);
      }

      completedQueries += batch.length;

      // Update progress
      const progress = 15 + (completedQueries / queries.length) * 40;
      this.updateProgress({
        stage: 'searching',
        message: `Executed ${completedQueries}/${queries.length} queries (${this.storedResults.length} results)`,
        progress,
        queriesExecuted: completedQueries,
        resultsFound: this.storedResults.length,
        pagesFetched: this.pagesFetched,
      });

      // Stop if we have enough results
      if (this.storedResults.length >= SEARCH_CONFIG.maxTotalResults) {
        logger.info('Reached max total results, stopping search');
        break;
      }
    }
  }

  /**
   * Compile and deduplicate results
   */
  private compileResults(
    results: GlobalSearchResult[],
    queries: SearchQuery[]
  ): AnalyzedResult[] {
    logger.debug(`Compiling ${results.length} results`);

    // Deduplicate by table + record content signature
    const seen = new Map<string, AnalyzedResult>();

    for (const result of results) {
      const recordStr = JSON.stringify(result.record);
      const signature = `${result.table}:${this.hashString(recordStr)}`;

      if (seen.has(signature)) {
        const existing = seen.get(signature)!;
        if (result.matchedQuery && !existing.matchReasons.includes(`Matched: ${result.matchedQuery}`)) {
          existing.matchReasons.push(`Matched: ${result.matchedQuery}`);
          existing.relevanceScore += 3;
        }
      } else {
        const analyzed: AnalyzedResult = {
          id: `${result.table}-${signature.slice(0, 8)}`,
          table: result.table,
          record: result.record,
          relevanceScore: 10,
          matchReasons: result.matchedQuery ? [`Matched: ${result.matchedQuery}`] : [],
          matchedFields: Object.keys(result.record).filter(k => {
            const value = result.record[k];
            if (value === null || value === undefined) return false;
            return queries.some(q => 
              String(value).toLowerCase().includes(q.term.toLowerCase())
            );
          }),
          searchSource: result.matchedQuery || '',
        };
        seen.set(signature, analyzed);
      }
    }

    // Sort by relevance
    const compiled = Array.from(seen.values());
    compiled.sort((a, b) => b.relevanceScore - a.relevanceScore);

    logger.debug(`Compiled to ${compiled.length} unique results`);
    return compiled;
  }

  /**
   * Simple string hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Analyze compiled results with AI
   */
  private async analyzeResults(
    userQuery: string,
    results: AnalyzedResult[]
  ): Promise<SearchAnalysis> {
    if (results.length === 0) {
      return {
        summary: 'No results found for your query. The search was performed across all available tables.',
        keyFindings: [],
        connections: [],
        patterns: [],
        recommendations: [
          'Try broader search terms',
          'Check for alternate spellings',
          'Verify the data exists in the database',
          'Check your API connection settings',
        ],
        redFlags: [],
        dataQuality: {
          completeness: 0,
          consistency: 0,
          notes: ['No data to analyze'],
        },
      };
    }

    const sampleResults = results.slice(0, 20).map(r => ({
      table: r.table,
      matchedFields: r.matchedFields.slice(0, 5),
      sampleData: Object.fromEntries(
        Object.entries(r.record).slice(0, 6).map(([k, v]) => [
          k,
          typeof v === 'string' && v.length > 50 ? v.slice(0, 50) + '...' : v,
        ])
      ),
    }));

    const tablesInvolved = [...new Set(results.map(r => r.table))];
    const entities = this.extractEntities(results);

    const prompt = `You are an AI investigation assistant. A user searched for "${userQuery}".

RESULTS SUMMARY:
- Total results: ${results.length}
- Tables: ${tablesInvolved.join(', ')}
- Entities found: ${entities.length}

SAMPLE RESULTS:
${JSON.stringify(sampleResults, null, 2)}

CONNECTED ENTITIES:
${JSON.stringify(entities.slice(0, 15), null, 2)}

Analyze the results and provide insights in JSON format:
{
  "summary": "2-3 sentence summary of findings",
  "keyFindings": ["finding 1", "finding 2", "finding 3"],
  "connections": [...],
  "patterns": ["pattern 1", "pattern 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "redFlags": ["potential issue 1"],
  "dataQuality": {
    "completeness": 0.8,
    "consistency": 0.9,
    "notes": ["note 1"]
  }
}`;

    const content = await this.callAI(prompt, 'You are an investigation analyst. Respond only with valid JSON.');

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...parsed,
          connections: this.mergeConnections(parsed.connections || [], entities),
        };
      } catch (e) {
        logger.warn('Failed to parse AI analysis', e);
      }
    }

    return this.generateFallbackAnalysis(userQuery, results);
  }

  /**
   * Generate fallback analysis without AI
   */
  private generateFallbackAnalysis(userQuery: string, results: AnalyzedResult[]): SearchAnalysis {
    const tablesInvolved = [...new Set(results.map(r => r.table))];
    const entities = this.extractEntities(results);

    const summary = results.length > 0
      ? `Found ${results.length} results across ${tablesInvolved.length} tables for "${userQuery}". ${entities.length} connected entities were identified.`
      : `No results found for "${userQuery}". The search was performed across all available data.`;

    return {
      summary,
      keyFindings: [
        `Results found in tables: ${tablesInvolved.join(', ') || 'None'}`,
        `Total unique records: ${results.length}`,
        `Connected entities identified: ${entities.length}`,
        ...entities.slice(0, 3).map(e => `${e.identifier} appears in ${e.appearances.length} records`),
      ],
      connections: entities.slice(0, 20),
      patterns: [],
      recommendations: [
        'Review the results for relevant information',
        'Click on records to see full details',
        'Use more specific terms to narrow results',
      ],
      redFlags: [],
      dataQuality: {
        completeness: 0.7,
        consistency: 0.8,
        notes: ['Basic analysis (AI unavailable)'],
      },
    };
  }

  /**
   * Extract entities from results
   */
  private extractEntities(results: AnalyzedResult[]): EntityConnection[] {
    const entityMap = new Map<string, EntityConnection>();

    const patterns = {
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
      phone: /[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/gi,
      panNumber: /[A-Z]{5}[0-9]{4}[A-Z]{1}/gi,
      accountNumber: /\b[A-Z0-9]{6,20}\b/gi,
    };

    const nameFields = ['name', 'full_name', 'person_name', 'suspect_name', 'customer_name', 'owner_name', 'first_name', 'last_name'];
    const companyFields = ['company', 'company_name', 'firm_name', 'organization', 'business_name'];
    const locationFields = ['city', 'state', 'country', 'address', 'location', 'place'];

    for (const result of results) {
      const recordStr = JSON.stringify(result.record);

      // Extract emails
      const emails = recordStr.match(patterns.email) || [];
      for (const email of emails) {
        const normalized = email.toLowerCase();
        if (!entityMap.has(normalized)) {
          entityMap.set(normalized, {
            identifier: email,
            type: 'email',
            appearances: [],
            connectionStrength: 0,
            relatedEntities: [],
          });
        }
        const entity = entityMap.get(normalized)!;
        entity.appearances.push({ table: result.table, recordId: result.id });
        entity.connectionStrength++;
      }

      // Extract phones
      const phones = recordStr.match(patterns.phone) || [];
      for (const phone of phones) {
        const normalized = phone.replace(/\D/g, '');
        if (normalized.length >= 10) {
          if (!entityMap.has(normalized)) {
            entityMap.set(normalized, {
              identifier: phone,
              type: 'phone',
              appearances: [],
              connectionStrength: 0,
              relatedEntities: [],
            });
          }
          const entity = entityMap.get(normalized)!;
          entity.appearances.push({ table: result.table, recordId: result.id });
          entity.connectionStrength++;
        }
      }

      // Extract PAN numbers
      const pans = recordStr.match(patterns.panNumber) || [];
      for (const pan of pans) {
        const normalized = pan.toUpperCase();
        if (!entityMap.has(normalized)) {
          entityMap.set(normalized, {
            identifier: pan,
            type: 'account',
            appearances: [],
            connectionStrength: 0,
            relatedEntities: [],
          });
        }
        const entity = entityMap.get(normalized)!;
        entity.appearances.push({ table: result.table, recordId: result.id });
        entity.connectionStrength++;
      }

      // Extract names
      for (const field of nameFields) {
        if (result.record[field] && typeof result.record[field] === 'string') {
          const name = (result.record[field] as string).trim();
          if (name.length > 2 && name.length < 100) {
            const normalized = name.toLowerCase();
            if (!entityMap.has(normalized)) {
              entityMap.set(normalized, {
                identifier: name,
                type: 'person',
                appearances: [],
                connectionStrength: 0,
                relatedEntities: [],
              });
            }
            const entity = entityMap.get(normalized)!;
            entity.appearances.push({ table: result.table, recordId: result.id, field });
            entity.connectionStrength++;
          }
        }
      }

      // Extract companies
      for (const field of companyFields) {
        if (result.record[field] && typeof result.record[field] === 'string') {
          const name = (result.record[field] as string).trim();
          if (name.length > 2) {
            const normalized = name.toLowerCase();
            if (!entityMap.has(normalized)) {
              entityMap.set(normalized, {
                identifier: name,
                type: 'company',
                appearances: [],
                connectionStrength: 0,
                relatedEntities: [],
              });
            }
            const entity = entityMap.get(normalized)!;
            entity.appearances.push({ table: result.table, recordId: result.id, field });
            entity.connectionStrength++;
          }
        }
      }

      // Extract locations
      for (const field of locationFields) {
        if (result.record[field] && typeof result.record[field] === 'string') {
          const name = (result.record[field] as string).trim();
          if (name.length > 2) {
            const normalized = name.toLowerCase();
            if (!entityMap.has(normalized)) {
              entityMap.set(normalized, {
                identifier: name,
                type: 'location',
                appearances: [],
                connectionStrength: 0,
                relatedEntities: [],
              });
            }
            const entity = entityMap.get(normalized)!;
            entity.appearances.push({ table: result.table, recordId: result.id, field });
            entity.connectionStrength++;
          }
        }
      }
    }

    return Array.from(entityMap.values())
      .filter(e => e.connectionStrength >= 1)
      .sort((a, b) => b.connectionStrength - a.connectionStrength)
      .slice(0, 50);
  }

  /**
   * Merge AI-detected connections with extracted entities
   */
  private mergeConnections(
    aiConnections: EntityConnection[],
    extractedEntities: EntityConnection[]
  ): EntityConnection[] {
    const merged = new Map<string, EntityConnection>();

    for (const entity of extractedEntities) {
      merged.set(entity.identifier.toLowerCase(), entity);
    }

    for (const conn of aiConnections) {
      const key = conn.identifier.toLowerCase();
      if (merged.has(key)) {
        const existing = merged.get(key)!;
        existing.relatedEntities.push(...(conn.relatedEntities || []));
        existing.connectionStrength = Math.max(existing.connectionStrength, conn.connectionStrength || 0);
      } else {
        merged.set(key, conn);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.connectionStrength - a.connectionStrength)
      .slice(0, 30);
  }
}

export default GlobalAISearchEngine;
