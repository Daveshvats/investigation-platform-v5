/**
 * Smart AI Agent Search Engine
 * 
 * Intelligent multi-criteria search that:
 * 1. Extracts criteria and classifies them as SEARCH vs FILTER
 * 2. Only searches for high-specificity criteria (names, phones, IDs)
 * 3. Uses low-specificity criteria (locations) as post-search filters
 * 4. Cross-references results to find exact matches
 * 5. Exports results to CSV
 * 
 * Example: "rahul sharma from delhi with phone 91231298312"
 * - SEARCH: "rahul sharma", "91231298312" (specific identifiers)
 * - FILTER: "delhi" (used to filter results, not search)
 * 
 * Result: Find all Rahul Sharma with phone 91231298312, then check if they're in Delhi
 */

import { createLogger } from './logger';
import { getUnifiedAI, shouldUseLocalAI, type ChatMessage } from './local-ai-client';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('SmartSearch');

// ============================================================================
// TYPES
// ============================================================================

export interface SearchCriterion {
  id: string;
  type: 'name' | 'location' | 'phone' | 'email' | 'company' | 'id_number' | 'account' | 'keyword' | 'date' | 'amount';
  value: string;
  normalizedValue: string;
  description: string;
  importance: number;
  // NEW: Classification
  classification: 'search' | 'filter';  // search = query API, filter = post-process
  reason: string;  // Why this classification
}

export interface QueryAnalysis {
  originalQuery: string;
  intent: string;
  searchCriteria: SearchCriterion[];   // Will be searched
  filterCriteria: SearchCriterion[];   // Will be used to filter results
  instructions: string;
}

export interface StoredResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  matchedSearchCriteria: string[];   // Which search criteria matched
  passedFilters: boolean;             // Whether it passes all filter criteria
  filterMatches: string[];            // Which filters it passes
  relevanceScore: number;
}

export interface SmartSearchResponse {
  success: boolean;
  analysis: QueryAnalysis;
  results: StoredResult[];
  filteredResults: StoredResult[];    // Results that pass all filters
  csvPath?: string;
  metadata: {
    searchCriteriaCount: number;
    filterCriteriaCount: number;
    totalResults: number;
    filteredResults: number;
    pagesFetched: number;
    duration: number;
    apiErrors: string[];
    aiMode: 'cloud' | 'local' | 'fallback';
  };
  insights: {
    summary: string;
    recommendations: string[];
  };
}

export interface ProgressUpdate {
  stage: string;
  message: string;
  progress: number;
  currentTask?: string;
  resultsFound: number;
  errors: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  maxPagesPerQuery: 5,        // Reduced to be faster
  pageSize: 100,
  queryTimeout: 15000,        // 15 seconds
  maxTotalResults: 1000,
  // Common locations to NOT search for
  commonLocations: [
    'delhi', 'mumbai', 'bangalore', 'chennai', 'kolkata', 'hyderabad', 'pune',
    'ahmedabad', 'jaipur', 'lucknow', 'chandigarh', 'noida', 'gurgaon', 'india',
    'ncr', 'maharashtra', 'karnataka', 'tamil nadu', 'uttar pradesh', 'gujarat',
    'west bengal', 'madhya pradesh', 'rajasthan', 'haryana', 'punjab',
  ],
  // Common words to never search
  stopWords: [
    'from', 'with', 'having', 'who', 'the', 'and', 'for', 'that', 'this', 'find',
    'search', 'show', 'list', 'all', 'named', 'called', 'known', 'lives', 'residing',
  ],
};

// ============================================================================
// SMART SEARCH ENGINE
// ============================================================================

export class SmartSearchEngine {
  private progressCallback?: (progress: ProgressUpdate) => void;
  private apiBaseUrl: string;
  private bearerToken?: string;
  private aiMode: 'cloud' | 'local' | 'fallback' = 'cloud';
  private storedResults: Map<string, StoredResult> = new Map();
  private pagesFetched = 0;
  private apiErrors: string[] = [];

  constructor(options?: {
    progressCallback?: (progress: ProgressUpdate) => void;
    apiBaseUrl?: string;
    bearerToken?: string;
  }) {
    this.progressCallback = options?.progressCallback;
    this.apiBaseUrl = options?.apiBaseUrl || '';
    this.bearerToken = options?.bearerToken;

    if (shouldUseLocalAI()) {
      this.aiMode = 'local';
    }
  }

  private updateProgress(progress: ProgressUpdate) {
    logger.debug(`Progress: ${progress.stage} - ${progress.message}`);
    this.progressCallback?.(progress);
  }

  // =========================================================================
  // STAGE 1: SMART CRITERIA EXTRACTION
  // =========================================================================

  private async analyzeQuery(query: string): Promise<QueryAnalysis> {
    logger.info('Analyzing query intelligently', { query });

    const allCriteria = this.extractCriteria(query);
    
    // Classify each criterion
    const searchCriteria: SearchCriterion[] = [];
    const filterCriteria: SearchCriterion[] = [];

    for (const criterion of allCriteria) {
      const classification = this.classifyCriterion(criterion);
      criterion.classification = classification.type;
      criterion.reason = classification.reason;

      if (classification.type === 'search') {
        searchCriteria.push(criterion);
      } else {
        filterCriteria.push(criterion);
      }
    }

    logger.info('Criteria classified', {
      search: searchCriteria.map(c => `${c.type}:${c.value}`),
      filter: filterCriteria.map(c => `${c.type}:${c.value}`),
    });

    return {
      originalQuery: query,
      intent: this.determineIntent(query, allCriteria),
      searchCriteria,
      filterCriteria,
      instructions: this.generateInstructions(query, searchCriteria, filterCriteria),
    };
  }

  /**
   * Classify a criterion as SEARCH or FILTER
   */
  private classifyCriterion(criterion: Omit<SearchCriterion, 'classification' | 'reason'>): {
    type: 'search' | 'filter';
    reason: string;
  } {
    const value = criterion.value.toLowerCase();

    // NEVER search for common locations
    if (criterion.type === 'location') {
      if (CONFIG.commonLocations.some(loc => value.includes(loc))) {
        return { 
          type: 'filter', 
          reason: 'Common location - too many results, better used as filter' 
        };
      }
    }

    // NEVER search for stop words
    if (CONFIG.stopWords.includes(value)) {
      return { 
        type: 'filter', 
        reason: 'Stop word - not useful for search' 
      };
    }

    // ALWAYS search for specific identifiers
    if (['phone', 'email', 'id_number', 'account'].includes(criterion.type)) {
      return { 
        type: 'search', 
        reason: 'Specific identifier - high specificity' 
      };
    }

    // Names are usually good to search
    if (criterion.type === 'name') {
      // But single common names might be too broad
      const parts = value.split(/\s+/);
      if (parts.length === 1 && value.length < 5) {
        return { 
          type: 'filter', 
          reason: 'Single short name - might be too common' 
        };
      }
      return { 
        type: 'search', 
        reason: 'Full name - good specificity for search' 
      };
    }

    // Companies are good to search if specific enough
    if (criterion.type === 'company') {
      if (value.length > 3) {
        return { 
          type: 'search', 
          reason: 'Company name - specific enough' 
        };
      }
      return { 
        type: 'filter', 
        reason: 'Company name too short' 
      };
    }

    // Keywords depend on length and specificity
    if (criterion.type === 'keyword') {
      if (value.length >= 4 && !CONFIG.stopWords.includes(value)) {
        return { 
          type: 'search', 
          reason: 'Specific keyword' 
        };
      }
      return { 
        type: 'filter', 
        reason: 'Generic keyword' 
      };
    }

    // Default to filter for safety
    return { 
      type: 'filter', 
      reason: 'Default classification - used as filter' 
    };
  }

  /**
   * Extract criteria from query
   */
  private extractCriteria(query: string): SearchCriterion[] {
    const criteria: SearchCriterion[] = [];
    let idCounter = 0;

    // Phone numbers (Indian format)
    const phonePattern = /(?:\+91[-\s]?|0)?[6-9]\d{9}\b/g;
    const phones = query.match(phonePattern) || [];
    for (const phone of phones) {
      const normalized = phone.replace(/\D/g, '').slice(-10);
      criteria.push({
        id: `phone_${++idCounter}`,
        type: 'phone',
        value: phone,
        normalizedValue: normalized,
        description: `Phone: ${phone}`,
        importance: 10,
        classification: 'search',
        reason: '',
      });
    }

    // Email addresses
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    const emails = query.match(emailPattern) || [];
    for (const email of emails) {
      criteria.push({
        id: `email_${++idCounter}`,
        type: 'email',
        value: email,
        normalizedValue: email.toLowerCase(),
        description: `Email: ${email}`,
        importance: 10,
        classification: 'search',
        reason: '',
      });
    }

    // PAN numbers
    const panPattern = /[A-Z]{5}\d{4}[A-Z]\b/gi;
    const pans = query.match(panPattern) || [];
    for (const pan of pans) {
      criteria.push({
        id: `pan_${++idCounter}`,
        type: 'id_number',
        value: pan.toUpperCase(),
        normalizedValue: pan.toUpperCase(),
        description: `PAN: ${pan.toUpperCase()}`,
        importance: 10,
        classification: 'search',
        reason: '',
      });
    }

    // Names (Capitalized multi-word)
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    const nameMatches = query.match(namePattern) || [];
    const uniqueNames = [...new Set(nameMatches)];
    for (const name of uniqueNames) {
      const nameLower = name.toLowerCase();
      // Skip if it's a location
      if (CONFIG.commonLocations.some(loc => nameLower.includes(loc))) continue;
      
      criteria.push({
        id: `name_${++idCounter}`,
        type: 'name',
        value: name,
        normalizedValue: nameLower,
        description: `Name: ${name}`,
        importance: 9,
        classification: 'search',
        reason: '',
      });
    }

    // Locations (after "from", "in", "at")
    const locationPattern = /(?:from|in|at|near|of|city)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
    let locationMatch;
    while ((locationMatch = locationPattern.exec(query)) !== null) {
      const location = locationMatch[1];
      criteria.push({
        id: `location_${++idCounter}`,
        type: 'location',
        value: location,
        normalizedValue: location.toLowerCase(),
        description: `Location: ${location}`,
        importance: 5,
        classification: 'filter',  // Default to filter
        reason: '',
      });
    }

    // If no criteria found, use whole query minus stop words
    if (criteria.length === 0) {
      const cleanedQuery = query
        .split(/\s+/)
        .filter(w => !CONFIG.stopWords.includes(w.toLowerCase()) && w.length > 2)
        .join(' ');
      
      if (cleanedQuery) {
        criteria.push({
          id: `keyword_1`,
          type: 'keyword',
          value: cleanedQuery,
          normalizedValue: cleanedQuery.toLowerCase(),
          description: `Search: ${cleanedQuery}`,
          importance: 5,
          classification: 'search',
          reason: '',
        });
      }
    }

    return criteria;
  }

  private determineIntent(query: string, criteria: SearchCriterion[]): string {
    const types = new Set(criteria.map(c => c.type));
    
    if (types.has('phone') || types.has('email') || types.has('id_number')) {
      return 'Find specific person by identifier';
    }
    if (types.has('name') && types.has('location')) {
      return 'Find person by name and verify location';
    }
    return 'General search';
  }

  private generateInstructions(
    query: string,
    searchCriteria: SearchCriterion[],
    filterCriteria: SearchCriterion[]
  ): string {
    return `INVESTIGATION SEARCH:
Query: "${query}"

SEARCH FOR (Query API):
${searchCriteria.map(c => `- ${c.type.toUpperCase()}: "${c.value}"`).join('\n') || '(none - will search all)'}

FILTER AFTER (Check results):
${filterCriteria.map(c => `- ${c.type.toUpperCase()}: "${c.value}"`).join('\n') || '(none)'}

PRIORITY: High-specificity identifiers (phones, IDs) > Names > Keywords`;
  }

  // =========================================================================
  // STAGE 2: SEARCH
  // =========================================================================

  private async searchForCriterion(criterion: SearchCriterion): Promise<number> {
    let resultsAdded = 0;
    const searchTerm = criterion.value;

    if (searchTerm.length < 2) return 0;

    try {
      const pageResults = await this.fetchAllPages(searchTerm);
      
      for (const result of pageResults) {
        const key = `${result.table}:${this.hashRecord(result.record)}`;
        
        if (this.storedResults.has(key)) {
          const existing = this.storedResults.get(key)!;
          if (!existing.matchedSearchCriteria.includes(criterion.id)) {
            existing.matchedSearchCriteria.push(criterion.id);
            existing.relevanceScore += criterion.importance;
          }
        } else {
          const stored: StoredResult = {
            id: key,
            table: result.table,
            record: result.record,
            matchedSearchCriteria: [criterion.id],
            passedFilters: false,
            filterMatches: [],
            relevanceScore: criterion.importance,
          };
          this.storedResults.set(key, stored);
          resultsAdded++;
        }
      }
    } catch (error) {
      const errorMsg = `Search failed for "${searchTerm}": ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.apiErrors.push(errorMsg);
      logger.error(errorMsg, error);
    }

    return resultsAdded;
  }

  private async fetchAllPages(searchTerm: string): Promise<Array<{ table: string; record: Record<string, unknown> }>> {
    const allResults: Array<{ table: string; record: Record<string, unknown> }> = [];
    let cursor: string | undefined;
    let hasMore = true;
    let pageCount = 0;
    let consecutiveErrors = 0;

    while (hasMore && pageCount < CONFIG.maxPagesPerQuery && consecutiveErrors < 2) {
      try {
        const response = await this.fetchSearchPage(searchTerm, cursor);
        pageCount++;
        this.pagesFetched++;
        consecutiveErrors = 0; // Reset on success

        if (response.results) {
          for (const [table, records] of Object.entries(response.results)) {
            if (Array.isArray(records)) {
              for (const record of records) {
                allResults.push({ table, record: record as Record<string, unknown> });
              }
            }
          }
        }

        hasMore = response.has_more || false;
        cursor = response.next_cursor || undefined;

        if (allResults.length >= CONFIG.maxTotalResults) break;
        if (hasMore && !cursor) break;

      } catch (error) {
        consecutiveErrors++;
        logger.error(`Page fetch error (attempt ${consecutiveErrors})`, error);
        if (consecutiveErrors >= 2) break;
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return allResults;
  }

  private async fetchSearchPage(query: string, cursor?: string): Promise<{
    results: Record<string, unknown[]>;
    has_more: boolean;
    next_cursor: string | null;
  }> {
    const url = new URL('/api/search', this.apiBaseUrl || 'http://localhost:8080');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(CONFIG.pageSize));
    if (cursor) url.searchParams.set('cursor', cursor);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.bearerToken) headers['Authorization'] = `Bearer ${this.bearerToken}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.queryTimeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // =========================================================================
  // STAGE 3: FILTER RESULTS
  // =========================================================================

  private applyFilters(results: StoredResult[], filterCriteria: SearchCriterion[]): StoredResult[] {
    if (filterCriteria.length === 0) {
      return results.map(r => ({ ...r, passedFilters: true }));
    }

    return results.map(result => {
      const filterMatches: string[] = [];
      
      for (const filter of filterCriteria) {
        const matches = this.resultMatchesFilter(result.record, filter);
        if (matches) {
          filterMatches.push(filter.description);
        }
      }

      return {
        ...result,
        passedFilters: filterMatches.length === filterCriteria.length,
        filterMatches,
      };
    });
  }

  private resultMatchesFilter(record: Record<string, unknown>, filter: SearchCriterion): boolean {
    const filterValue = filter.normalizedValue.toLowerCase();

    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined) continue;

      const strValue = String(value).toLowerCase();
      const keyLower = key.toLowerCase();

      // For location filters, check location-related fields
      if (filter.type === 'location') {
        if (['city', 'state', 'address', 'location', 'place', 'area', 'region'].some(f => keyLower.includes(f))) {
          if (strValue.includes(filterValue) || filterValue.includes(strValue)) {
            return true;
          }
        }
      }

      // For other filters, check all fields
      if (strValue.includes(filterValue)) {
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // STAGE 4: EXPORT TO CSV
  // =========================================================================

  private exportToCSV(results: StoredResult[], query: string): string {
    const csvDir = path.join(process.cwd(), 'download');
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `search-results-${timestamp}.csv`;
    const filepath = path.join(csvDir, filename);

    if (results.length === 0) {
      fs.writeFileSync(filepath, 'No results found');
      return filepath;
    }

    // Get all unique fields
    const allFields = new Set<string>();
    results.forEach(r => {
      Object.keys(r.record).forEach(k => allFields.add(k));
    });
    allFields.add('_matched_criteria');
    allFields.add('_passed_filters');
    allFields.add('_relevance_score');
    allFields.add('_table');

    const fields = Array.from(allFields);
    
    // Build CSV
    const rows: string[] = [];
    rows.push(fields.map(f => `"${f}"`).join(','));

    for (const result of results) {
      const row = fields.map(field => {
        if (field === '_matched_criteria') {
          return `"${result.matchedSearchCriteria.join('; ')}"`;
        }
        if (field === '_passed_filters') {
          return `"${result.passedFilters}"`;
        }
        if (field === '_relevance_score') {
          return `"${result.relevanceScore}"`;
        }
        if (field === '_table') {
          return `"${result.table}"`;
        }
        
        const value = result.record[field];
        if (value === null || value === undefined) return '""';
        const strValue = String(value).replace(/"/g, '""');
        return `"${strValue}"`;
      });
      rows.push(row.join(','));
    }

    fs.writeFileSync(filepath, rows.join('\n'));
    logger.info(`Exported ${results.length} results to ${filepath}`);
    
    return filepath;
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================

  private hashRecord(record: Record<string, unknown>): string {
    const str = JSON.stringify(record);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async callAI(prompt: string, systemPrompt: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];
    const ai = getUnifiedAI();
    const response = await ai.chat(messages);
    return response.content;
  }

  // =========================================================================
  // MAIN ENTRY POINT
  // =========================================================================

  async search(query: string): Promise<SmartSearchResponse> {
    const startTime = Date.now();
    this.storedResults.clear();
    this.pagesFetched = 0;
    this.apiErrors = [];

    logger.info(`Starting smart search for: "${query}"`);

    // Stage 1: Analyze and classify criteria
    this.updateProgress({
      stage: 'analyzing',
      message: 'Extracting and classifying search criteria...',
      progress: 5,
      resultsFound: 0,
      errors: 0,
    });

    const analysis = await this.analyzeQuery(query);
    
    logger.info('Query analysis complete', {
      searchCriteria: analysis.searchCriteria.length,
      filterCriteria: analysis.filterCriteria.length,
    });

    // If no search criteria, use filters as search (fallback)
    if (analysis.searchCriteria.length === 0 && analysis.filterCriteria.length > 0) {
      analysis.searchCriteria = analysis.filterCriteria.filter(c => c.type !== 'location');
      analysis.filterCriteria = analysis.filterCriteria.filter(c => c.type === 'location');
      
      if (analysis.searchCriteria.length === 0) {
        // Use first filter as search
        if (analysis.filterCriteria.length > 0) {
          analysis.searchCriteria = [analysis.filterCriteria[0]];
          analysis.filterCriteria = analysis.filterCriteria.slice(1);
        }
      }
    }

    // Stage 2: Search for high-specificity criteria
    this.updateProgress({
      stage: 'searching',
      message: `Searching for ${analysis.searchCriteria.length} specific criteria...`,
      progress: 15,
      resultsFound: 0,
      errors: 0,
    });

    for (let i = 0; i < analysis.searchCriteria.length; i++) {
      const criterion = analysis.searchCriteria[i];
      
      this.updateProgress({
        stage: 'searching',
        message: `Searching: ${criterion.description}`,
        progress: 15 + ((i + 1) / analysis.searchCriteria.length) * 40,
        currentTask: criterion.value,
        resultsFound: this.storedResults.size,
        errors: this.apiErrors.length,
      });

      await this.searchForCriterion(criterion);
    }

    const allResults = Array.from(this.storedResults.values());

    // Stage 3: Apply filters
    this.updateProgress({
      stage: 'filtering',
      message: `Applying ${analysis.filterCriteria.length} filters to ${allResults.length} results...`,
      progress: 60,
      resultsFound: allResults.length,
      errors: this.apiErrors.length,
    });

    const filteredResults = this.applyFilters(allResults, analysis.filterCriteria);
    const passingResults = filteredResults.filter(r => r.passedFilters);

    // Stage 4: Export to CSV
    this.updateProgress({
      stage: 'exporting',
      message: 'Exporting results to CSV...',
      progress: 80,
      resultsFound: passingResults.length,
      errors: this.apiErrors.length,
    });

    let csvPath: string | undefined;
    try {
      csvPath = this.exportToCSV(passingResults.length > 0 ? passingResults : allResults, query);
    } catch (error) {
      logger.error('CSV export failed', error);
    }

    // Generate insights
    const insights = this.generateInsights(query, analysis, allResults, passingResults);

    // Complete
    this.updateProgress({
      stage: 'complete',
      message: 'Search complete!',
      progress: 100,
      resultsFound: passingResults.length,
      errors: this.apiErrors.length,
    });

    const duration = Date.now() - startTime;

    return {
      success: true,
      analysis,
      results: allResults,
      filteredResults: passingResults,
      csvPath,
      metadata: {
        searchCriteriaCount: analysis.searchCriteria.length,
        filterCriteriaCount: analysis.filterCriteria.length,
        totalResults: allResults.length,
        filteredResults: passingResults.length,
        pagesFetched: this.pagesFetched,
        duration,
        apiErrors: this.apiErrors,
        aiMode: this.aiMode,
      },
      insights,
    };
  }

  private generateInsights(
    query: string,
    analysis: QueryAnalysis,
    allResults: StoredResult[],
    filteredResults: StoredResult[]
  ): { summary: string; recommendations: string[] } {
    const summary = filteredResults.length > 0
      ? `Found ${filteredResults.length} exact match(es) for "${query}" - these match all ${analysis.searchCriteria.length} search criteria and pass all ${analysis.filterCriteria.length} filters.`
      : allResults.length > 0
        ? `Found ${allResults.length} partial matches. No results matched ALL criteria exactly. Try removing some filters.`
        : 'No results found. Check your API connection and search terms.';

    const recommendations: string[] = [];

    if (this.apiErrors.length > 0) {
      recommendations.push(`⚠️ ${this.apiErrors.length} API errors occurred. Check your backend API logs.`);
    }

    if (filteredResults.length === 0 && allResults.length > 0) {
      recommendations.push('No exact matches found. Consider removing some filter criteria.');
      recommendations.push(`Found ${allResults.length} partial matches that might be relevant.`);
    }

    if (analysis.filterCriteria.length > 2) {
      recommendations.push('Multiple filter criteria active - try fewer filters for more results.');
    }

    return { summary, recommendations };
  }
}

export default SmartSearchEngine;
