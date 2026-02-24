/**
 * Robust AI Agent Search Engine
 * 
 * 2026 Best Practices Implementation:
 * 
 * Uses new intelligent components:
 * - entity-extractor.ts: GLiNER-style zero-shot NER
 * - ollama-client.ts: Local AI for reasoning (Qwen, Llama, Gemma)
 * - embedding-service.ts: Semantic similarity for deduplication
 * 
 * KEY INSIGHT: Only HIGH-VALUE entities are searched!
 * - HIGH VALUE (search): phone, email, id_number, account
 * - LOW VALUE (filter only): name, location, company
 * 
 * Complete Workflow:
 * 1. User query: "rahul sharma from delhi having no. 9876543210"
 * 2. Entity Extractor finds:
 *    - Phone: 9876543210 (HIGH VALUE - SEARCH)
 *    - Name: "Rahul Sharma" (LOW VALUE - FILTER ONLY)
 *    - Location: "Delhi" (LOW VALUE - FILTER ONLY)
 * 3. Search API with only HIGH-VALUE term: /api/search?q=9876543210
 * 4. Paginate until has_more=false
 * 5. Extract NEW high-value identifiers from results
 * 6. Iterate: search newly discovered phones/emails
 * 7. Filter results using LOW-VALUE criteria
 * 8. Deduplicate using semantic similarity
 * 9. Build knowledge graph
 * 10. Generate AI insights
 */

import { createLogger } from './logger';
import { entityExtractor, type ExtractedEntity } from './entity-extractor';
import { ollamaClient } from './ollama-client';
import { embeddingService, recordSimilarity } from './embedding-service';

const logger = createLogger('RobustAgentSearch');

// ============================================================================
// TYPES
// ============================================================================

export interface SearchCriterion {
  id: string;
  type: 'primary' | 'secondary' | 'tertiary'; // primary = search first, tertiary = search after primary, secondary = filter
  category: 'phone' | 'name' | 'location' | 'email' | 'id_number' | 'account' | 'company' | 'address' | 'keyword';
  value: string;
  normalizedValue: string;
  description: string;
  confidence: number;
  searchValue: 'HIGH' | 'MEDIUM' | 'LOW'; // Search priority
  specificity?: number; // For addresses
}

export interface ParsedQuery {
  originalQuery: string;
  primaryCriteria: SearchCriterion[];  // HIGH-VALUE: Terms to search first
  tertiaryCriteria: SearchCriterion[]; // MEDIUM-VALUE: Terms to search after primary (addresses)
  secondaryCriteria: SearchCriterion[]; // LOW-VALUE: Terms to filter results only
  intent: string;
  aiEntityExtraction?: boolean;
}

export interface PaginatedResult {
  table: string;
  record: Record<string, unknown>;
  pageNumber: number;
  cursor: string | null;
  entitySignature: string; // For deduplication
}

export interface FilteredResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  matchedFilters: string[];
  matchScore: number;
  highlights: Record<string, string>;
}

export interface CorrelationNode {
  id: string;
  type: 'person' | 'phone' | 'location' | 'email' | 'company' | 'account' | 'id' | 'address' | 'other';
  value: string;
  count: number;
  connections: string[];
  sources: string[];
}

export interface CorrelationEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
}

export interface CorrelationGraph {
  nodes: CorrelationNode[];
  edges: CorrelationEdge[];
  clusters: Array<{
    id: string;
    nodes: string[];
    label: string;
  }>;
}

export interface RobustSearchResponse {
  success: boolean;
  query: ParsedQuery;
  
  // All fetched results (before filtering)
  allFetchedResults: PaginatedResult[];
  totalFetched: number;
  totalPages: number;
  
  // Filtered results
  filteredResults: FilteredResult[];
  totalFiltered: number;
  duplicatesRemoved: number;
  
  // Analysis
  correlationGraph: CorrelationGraph;
  insights: {
    summary: string;
    topMatches: FilteredResult[];
    entityConnections: Array<{
      entity: string;
      type: string;
      appearances: number;
      tables: string[];
    }>;
    patterns: string[];
    recommendations: string[];
    confidence: number;
    aiModel: string;
    localAIUsed: boolean;
  };
  
  // Metadata
  metadata: {
    duration: number;
    apiCalls: number;
    cursorsUsed: string[];
    primarySearchTerm: string;
    filtersApplied: string[];
    hasMoreData: boolean;
    earlyStopped: boolean;
    iterations: number;
    discoveredEntities: number;
    discoveredEntityList: string[];
    highValueEntities: number;
    lowValueEntities: number;
  };
}

export interface ProgressUpdate {
  stage: 'parsing' | 'searching' | 'paginating' | 'filtering' | 'analyzing' | 'iterating' | 'complete';
  message: string;
  progress: number;
  currentPage: number;
  totalResults: number;
  hasMore: boolean;
  iteration?: number;
  discoveredEntities?: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  maxPages: 500,
  pageSize: 100,
  maxResults: 50000,
  paginationTimeout: 30000,
  retryAttempts: 5,
  retryDelay: 1000,
  rateLimitRetryDelay: 5000,
  maxIterations: 3,
  maxEntitiesPerIteration: 5,
  deduplicationThreshold: 0.95,
  minMatchScore: 0.3,
};

// ============================================================================
// ROBUST AGENT SEARCH ENGINE
// ============================================================================

export class RobustAgentSearchEngine {
  private progressCallback?: (progress: ProgressUpdate) => void;
  private apiBaseUrl: string;
  private bearerToken?: string;

  // Tracking
  private cursorsUsed: string[] = [];
  private apiCalls = 0;
  private earlyStopped = false;
  private searchedTerms = new Set<string>();
  private allDiscoveredEntities: ExtractedEntity[] = [];

  constructor(options?: {
    progressCallback?: (progress: ProgressUpdate) => void;
    apiBaseUrl?: string;
    bearerToken?: string;
  }) {
    this.progressCallback = options?.progressCallback;
    this.apiBaseUrl = options?.apiBaseUrl || process.env.SEARCH_API_URL || 'http://localhost:8080';
    this.bearerToken = options?.bearerToken;
  }

  private updateProgress(progress: ProgressUpdate): void {
    logger.info(`Progress: ${progress.stage} - ${progress.message}`);
    this.progressCallback?.(progress);
  }

  // =========================================================================
  // STAGE 1: QUERY PARSING (Uses Entity Extractor)
  // =========================================================================

  /**
   * Parse query using AI-powered entity extraction
   * Only HIGH-VALUE entities become search terms!
   */
  async parseQuery(query: string): Promise<ParsedQuery> {
    this.updateProgress({
      stage: 'parsing',
      message: 'Extracting entities using AI...',
      progress: 5,
      currentPage: 0,
      totalResults: 0,
      hasMore: false,
    });

    logger.info('Parsing query with AI entity extraction', { query });

    // Use AI-powered entity extraction (falls back to regex if AI unavailable)
    const extraction = await entityExtractor.extractWithAI(query);
    
    if (extraction.usedAI) {
      logger.info('AI extraction used successfully');
    } else {
      logger.info('Using regex fallback for extraction');
    }

    // Convert to search criteria
    const primaryCriteria: SearchCriterion[] = [];
    const tertiaryCriteria: SearchCriterion[] = []; // MEDIUM value - addresses
    const secondaryCriteria: SearchCriterion[] = [];

    // HIGH-VALUE entities = primary (search terms)
    for (const entity of (extraction.highValueEntities || [])) {
      primaryCriteria.push({
        id: `primary_${entity.type}_${entity.normalized}`,
        type: 'primary',
        category: entity.type as SearchCriterion['category'],
        value: entity.original,
        normalizedValue: entity.normalized,
        description: `${entity.type}: ${entity.value}`,
        confidence: entity.confidence,
        searchValue: 'HIGH',
      });
    }

    // MEDIUM-VALUE entities = tertiary (search after high-value)
    for (const entity of (extraction.mediumValueEntities || [])) {
      tertiaryCriteria.push({
        id: `tertiary_${entity.type}_${entity.normalized.slice(0, 20)}`,
        type: 'tertiary',
        category: entity.type as SearchCriterion['category'],
        value: entity.original,
        normalizedValue: entity.normalized,
        description: `${entity.type}: ${entity.value.slice(0, 30)}...`,
        confidence: entity.confidence,
        searchValue: 'MEDIUM',
        specificity: entity.specificity,
      });
    }

    // LOW-VALUE entities = secondary (filter terms)
    for (const entity of (extraction.lowValueEntities || [])) {
      secondaryCriteria.push({
        id: `secondary_${entity.type}_${entity.normalized}`,
        type: 'secondary',
        category: entity.type as SearchCriterion['category'],
        value: entity.original,
        normalizedValue: entity.normalized,
        description: `${entity.type}: ${entity.value}`,
        confidence: entity.confidence,
        searchValue: 'LOW',
      });
    }

    // If no primary criteria, promote tertiary (addresses) or secondary
    if (primaryCriteria.length === 0) {
      if (tertiaryCriteria.length > 0) {
        // Promote best address
        const sorted = [...tertiaryCriteria].sort((a, b) => 
          (b.specificity || 0) - (a.specificity || 0)
        );
        const promoted = sorted[0];
        promoted.type = 'primary';
        promoted.searchValue = 'HIGH';
        primaryCriteria.push(promoted);
        tertiaryCriteria.splice(0, 1);
      } else if (secondaryCriteria.length > 0) {
        const sorted = [...secondaryCriteria].sort((a, b) => 
          b.normalizedValue.length - a.normalizedValue.length
        );
        const promoted = sorted[0];
        promoted.type = 'primary';
        promoted.searchValue = 'HIGH';
        primaryCriteria.push(promoted);
        secondaryCriteria.splice(0, 1);
      }
    }

    // If still no criteria, use whole query
    if (primaryCriteria.length === 0) {
      primaryCriteria.push({
        id: 'keyword_1',
        type: 'primary',
        category: 'keyword',
        value: query,
        normalizedValue: query.toLowerCase(),
        description: `Search: ${query}`,
        confidence: 0.5,
        searchValue: 'HIGH',
      });
    }

    const intent = this.determineIntent(primaryCriteria, tertiaryCriteria, secondaryCriteria);

    logger.info('Query parsed', {
      primary: primaryCriteria.map(c => `${c.category}:${c.normalizedValue}`),
      tertiary: tertiaryCriteria.map(c => `${c.category}:${c.normalizedValue.slice(0, 20)}`),
      secondary: secondaryCriteria.map(c => `${c.category}:${c.normalizedValue}`),
      intent,
      usedAI: extraction.usedAI,
    });

    return {
      originalQuery: query,
      primaryCriteria,
      tertiaryCriteria,
      secondaryCriteria,
      intent,
      aiEntityExtraction: extraction.usedAI,
    };
  }

  private determineIntent(primary: SearchCriterion[], tertiary: SearchCriterion[], secondary: SearchCriterion[]): string {
    const primaryTypes = new Set(primary.map(c => c.category));
    const tertiaryTypes = new Set(tertiary.map(c => c.category));
    const secondaryTypes = new Set(secondary.map(c => c.category));

    if (primaryTypes.has('phone')) return 'Find person by phone number';
    if (primaryTypes.has('email')) return 'Find person by email';
    if (primaryTypes.has('id_number')) return 'Find records by ID number';
    if (primaryTypes.has('account')) return 'Find records by account number';
    if (primaryTypes.has('address') || tertiaryTypes.has('address')) return 'Find people at address';
    if (secondaryTypes.has('name') && secondaryTypes.has('location')) return 'Find person by name and location';
    return 'General search';
  }

  // =========================================================================
  // STAGE 2: ITERATIVE SEARCH WITH PAGINATION
  // =========================================================================

  /**
   * Execute search - searches HIGH-VALUE first, then MEDIUM-VALUE (addresses)
   */
  async executeIterativeSearch(parsedQuery: ParsedQuery): Promise<PaginatedResult[]> {
    const allResults: PaginatedResult[] = [];
    this.searchedTerms.clear();
    this.allDiscoveredEntities = [];
    let iterations = 0;

    // Get primary search term (highest priority)
    const primarySearch = parsedQuery.primaryCriteria
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = {
          phone: 10, email: 9, id_number: 8, account: 7, address: 4, keyword: 1
        };
        return (priorityOrder[b.category] || 0) - (priorityOrder[a.category] || 0);
      })[0];

    if (!primarySearch) {
      logger.warn('No primary search criteria found');
      return [];
    }

    // Initial search
    this.updateProgress({
      stage: 'searching',
      message: `Searching for "${primarySearch.normalizedValue.slice(0, 30)}"...`,
      progress: 10,
      currentPage: 0,
      totalResults: 0,
      hasMore: false,
    });

    const initialResults = await this.searchWithPagination(primarySearch.normalizedValue);
    
    // Add unique results
    for (const result of initialResults) {
      if (!this.isDuplicateResult(result, allResults)) {
        allResults.push(result);
      }
    }
    
    this.searchedTerms.add(primarySearch.normalizedValue.toLowerCase());

    // Extract HIGH-VALUE entities from initial results
    const initialEntities = this.extractHighValueEntities(initialResults);
    this.allDiscoveredEntities.push(...initialEntities);

    // Extract MEDIUM-VALUE entities (addresses) from initial results
    const initialAddresses = this.extractMediumValueEntities(initialResults);
    this.allDiscoveredEntities.push(...initialAddresses);

    iterations = 1;

    // Phase 1: Iterative search for HIGH-VALUE identifiers
    while (iterations < CONFIG.maxIterations) {
      const newSearchTerms = this.getNewHighValueSearchTerms();

      if (newSearchTerms.length === 0) {
        logger.info('No new high-value identifiers found');
        break;
      }

      this.updateProgress({
        stage: 'iterating',
        message: `Iteration ${iterations + 1}: Searching ${newSearchTerms.length} new identifiers...`,
        progress: 10 + (iterations * 10),
        currentPage: 0,
        totalResults: allResults.length,
        hasMore: false,
        iteration: iterations + 1,
        discoveredEntities: newSearchTerms,
      });

      // Search each new HIGH-VALUE term
      for (const term of newSearchTerms) {
        this.searchedTerms.add(term.toLowerCase());

        const newResults = await this.searchWithPagination(term);
        
        for (const result of newResults) {
          if (!this.isDuplicateResult(result, allResults)) {
            allResults.push(result);
          }
        }

        if (allResults.length >= CONFIG.maxResults) {
          logger.warn(`Max results limit reached: ${CONFIG.maxResults}`);
          this.earlyStopped = true;
          break;
        }
      }

      // Extract new entities for next iteration
      const newEntities = this.extractHighValueEntities(allResults);
      const newAddresses = this.extractMediumValueEntities(allResults);
      this.allDiscoveredEntities = this.mergeEntities(this.allDiscoveredEntities, [...newEntities, ...newAddresses]);

      iterations++;
      if (allResults.length >= CONFIG.maxResults) break;
    }

    // Phase 2: Search for MEDIUM-VALUE entities (addresses) if we have few results
    if (allResults.length < 50 && this.allDiscoveredEntities.filter(e => e.type === 'address').length > 0) {
      const addressTerms = this.getNewMediumValueSearchTerms();
      
      if (addressTerms.length > 0) {
        this.updateProgress({
          stage: 'iterating',
          message: `Searching ${addressTerms.length} discovered addresses for more leads...`,
          progress: 60,
          currentPage: 0,
          totalResults: allResults.length,
          hasMore: false,
          iteration: iterations + 1,
          discoveredEntities: addressTerms.map(a => a.slice(0, 20) + '...'),
        });

        for (const address of addressTerms.slice(0, 3)) { // Limit to top 3 addresses
          if (this.searchedTerms.has(address.toLowerCase())) continue;
          this.searchedTerms.add(address.toLowerCase());

          const addressResults = await this.searchWithPagination(address);
          
          for (const result of addressResults) {
            if (!this.isDuplicateResult(result, allResults)) {
              allResults.push(result);
            }
          }

          if (allResults.length >= CONFIG.maxResults) break;
        }

        // Extract any new high-value entities from address search
        const newFromAddress = this.extractHighValueEntities(allResults);
        this.allDiscoveredEntities = this.mergeEntities(this.allDiscoveredEntities, newFromAddress);
      }
    }

    // Also search addresses from parsedQuery if we haven't already
    if (parsedQuery.tertiaryCriteria && parsedQuery.tertiaryCriteria.length > 0 && allResults.length < 100) {
      for (const addr of parsedQuery.tertiaryCriteria.slice(0, 2)) {
        if (this.searchedTerms.has(addr.normalizedValue.toLowerCase())) continue;
        
        this.updateProgress({
          stage: 'iterating',
          message: `Searching address: "${addr.normalizedValue.slice(0, 25)}..."`,
          progress: 70,
          currentPage: 0,
          totalResults: allResults.length,
          hasMore: false,
          iteration: iterations + 1,
        });

        this.searchedTerms.add(addr.normalizedValue.toLowerCase());
        const addrResults = await this.searchWithPagination(addr.normalizedValue);
        
        for (const result of addrResults) {
          if (!this.isDuplicateResult(result, allResults)) {
            allResults.push(result);
          }
        }

        // Extract new entities
        const newEntities = this.extractHighValueEntities(addrResults);
        this.allDiscoveredEntities = this.mergeEntities(this.allDiscoveredEntities, newEntities);
      }
    }

    logger.info('Iterative search complete', {
      results: allResults.length,
      iterations,
      highValueEntities: this.allDiscoveredEntities.filter(e => e.searchValue === 'HIGH').length,
      mediumValueEntities: this.allDiscoveredEntities.filter(e => e.searchValue === 'MEDIUM').length,
    });

    return allResults;
  }

  /**
   * Search with cursor-based pagination
   */
  private async searchWithPagination(searchTerm: string): Promise<PaginatedResult[]> {
    const allResults: PaginatedResult[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < CONFIG.maxPages) {
      const progressPercent = Math.min(70, 10 + (pageCount / CONFIG.maxPages) * 50);

      this.updateProgress({
        stage: pageCount === 0 ? 'searching' : 'paginating',
        message: `Fetching page ${pageCount + 1} (${allResults.length.toLocaleString()} results)...`,
        progress: progressPercent,
        currentPage: pageCount + 1,
        totalResults: allResults.length,
        hasMore,
      });

      try {
        const response = await this.fetchPage(searchTerm, cursor);
        this.apiCalls++;
        pageCount++;

        if (cursor) {
          this.cursorsUsed.push(cursor);
        }

        // Process results
        if (response.results) {
          for (const [table, records] of Object.entries(response.results) as [string, unknown[]][]) {
            if (Array.isArray(records)) {
              for (const record of records) {
                const result = this.processResult(table, record as Record<string, unknown>);
                allResults.push(result);
              }
            }
          }
        }

        hasMore = response.has_more || false;
        cursor = response.next_cursor || undefined;

        if (allResults.length >= CONFIG.maxResults) {
          this.earlyStopped = true;
          break;
        }

        if (hasMore && !cursor) {
          logger.warn('has_more is true but no cursor provided');
          break;
        }

      } catch (error) {
        logger.error(`Error fetching page ${pageCount + 1}`, error);
        break;
      }
    }

    return allResults;
  }

  private async fetchPage(
    query: string,
    cursor?: string
  ): Promise<{
    results: Record<string, unknown[]>;
    has_more: boolean;
    next_cursor: string | null;
  }> {
    const url = new URL('/api/search', this.apiBaseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(CONFIG.pageSize));
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= CONFIG.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.paginationTimeout);

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : CONFIG.rateLimitRetryDelay * attempt;
          
          if (attempt < CONFIG.retryAttempts) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        return await response.json();

      } catch (error) {
        lastError = error as Error;
        if (attempt < CONFIG.retryAttempts) {
          const delay = CONFIG.retryDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to fetch page');
  }

  private processResult(table: string, record: Record<string, unknown>): PaginatedResult {
    return {
      table,
      record,
      pageNumber: 0,
      cursor: null,
      entitySignature: this.generateEntitySignature(record, table),
    };
  }

  private generateEntitySignature(record: Record<string, unknown>, table?: string): string {
    const parts: string[] = [];

    // Include table name in signature - different tables are NOT duplicates!
    // They could be snapshots at different times with different data
    if (table) {
      parts.push(`table:${table}`);
    }

    // Phone is most unique
    const phone = this.getFieldValue(record, ['phone', 'mobile', 'glusr_usr_ph_mobile']);
    if (phone) {
      parts.push(`phone:${String(phone).replace(/\D/g, '').slice(-10)}`);
    }

    // Email
    const email = this.getFieldValue(record, ['email', 'email1', 'email_id']);
    if (email) {
      parts.push(`email:${String(email).toLowerCase()}`);
    }

    // Record ID from database
    const recordId = record.id || record._id || record.global_id || record.glusr_id;
    if (recordId) {
      parts.push(`recordId:${recordId}`);
    }

    if (parts.length === 0) {
      // Use hash of full record as last resort
      parts.push(`hash:${JSON.stringify(record).slice(0, 100)}`);
    }

    return parts.join('|');
  }

  private getFieldValue(record: Record<string, unknown>, fields: string[]): string | null {
    for (const field of fields) {
      const value = record[field];
      if (value !== null && value !== undefined && value !== '') {
        return String(value);
      }
    }
    return null;
  }

  // =========================================================================
  // STAGE 3: ENTITY EXTRACTION (Uses Entity Extractor)
  // =========================================================================

  /**
   * Extract ONLY HIGH-VALUE entities from results
   * Uses the new entity-extractor module
   */
  private extractHighValueEntities(results: PaginatedResult[]): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      const extraction = entityExtractor.extractFromRecord(result.record, result.table);

      for (const entity of extraction.highValueEntities) {
        const key = `${entity.type}:${entity.normalized}`;
        if (!seen.has(key)) {
          seen.add(key);
          entities.push(entity);
        }
      }
    }

    return entities;
  }

  /**
   * Extract MEDIUM-VALUE entities (specific addresses) from results
   * These are addresses with high specificity scores
   */
  private extractMediumValueEntities(results: PaginatedResult[]): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      const extraction = entityExtractor.extractFromRecord(result.record, result.table);

      for (const entity of extraction.mediumValueEntities) {
        const key = `${entity.type}:${entity.normalized.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          entities.push(entity);
        }
      }
    }

    return entities;
  }

  /**
   * Get new HIGH-VALUE search terms (not already searched)
   * CRITICAL: Only returns phone, email, id_number, account
   */
  private getNewHighValueSearchTerms(): string[] {
    const terms: string[] = [];
    const seen = new Set<string>();

    // Priority order - ONLY HIGH-VALUE types
    const typePriority = ['phone', 'email', 'id_number', 'account'];

    for (const type of typePriority) {
      for (const entity of this.allDiscoveredEntities) {
        if (entity.type !== type) continue;
        if (this.searchedTerms.has(entity.normalized.toLowerCase())) continue;
        if (seen.has(entity.normalized)) continue;

        seen.add(entity.normalized);
        terms.push(entity.normalized);

        if (terms.length >= CONFIG.maxEntitiesPerIteration) break;
      }
      if (terms.length >= CONFIG.maxEntitiesPerIteration) break;
    }

    return terms;
  }

  /**
   * Get new MEDIUM-VALUE search terms (specific addresses not already searched)
   * Returns addresses with high specificity for lead discovery
   */
  private getNewMediumValueSearchTerms(): string[] {
    const terms: string[] = [];
    const seen = new Set<string>();

    for (const entity of this.allDiscoveredEntities) {
      // Only get address entities with MEDIUM value
      if (entity.type !== 'address') continue;
      if (entity.searchValue !== 'MEDIUM') continue;
      if (this.searchedTerms.has(entity.normalized.toLowerCase())) continue;
      if (seen.has(entity.normalized)) continue;

      // Only include addresses with good specificity
      if ((entity.specificity || 0) < 0.3) continue;

      seen.add(entity.normalized);
      terms.push(entity.normalized);

      if (terms.length >= 5) break; // Limit addresses
    }

    return terms;
  }

  private mergeEntities(existing: ExtractedEntity[], newEntities: ExtractedEntity[]): ExtractedEntity[] {
    const merged = [...existing];
    const seen = new Set(existing.map(e => `${e.type}:${e.normalized}`));

    for (const entity of newEntities) {
      const key = `${entity.type}:${entity.normalized}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(entity);
      }
    }

    return merged;
  }

  private isDuplicateResult(result: PaginatedResult, existing: PaginatedResult[]): boolean {
    return existing.some(r => r.entitySignature === result.entitySignature);
  }

  // =========================================================================
  // STAGE 4: FILTERING & DEDUPLICATION (Uses Embedding Service)
  // =========================================================================

  /**
   * Filter results using LOW-VALUE criteria
   * Deduplicate using semantic similarity
   */
  async filterAndDeduplicate(
    results: PaginatedResult[],
    filters: SearchCriterion[]
  ): Promise<{ filtered: FilteredResult[]; duplicatesRemoved: number }> {
    this.updateProgress({
      stage: 'filtering',
      message: 'Filtering and deduplicating results...',
      progress: 75,
      currentPage: 0,
      totalResults: results.length,
      hasMore: false,
    });

    // Convert to filtered results
    let filtered = results.map((r, i) => ({
      id: `${r.table}:${i}`,
      table: r.table,
      record: r.record,
      matchedFilters: [],
      matchScore: 1.0,
      highlights: {},
    }));

    // Apply filters
    if (filters.length > 0) {
      filtered = filtered.filter(result => {
        for (const filter of filters) {
          if (this.recordMatchesFilter(result.record, filter)) {
            result.matchedFilters.push(filter.description);
            result.matchScore += 0.2;
          }
        }
        return result.matchedFilters.length > 0 || filters.length === 0;
      });
    }

    // Deduplicate by signature (now includes table name, so different tables won't be duplicates)
    const uniqueMap = new Map<string, FilteredResult>();
    for (const result of filtered) {
      const sig = this.generateEntitySignature(result.record, result.table);
      if (!uniqueMap.has(sig)) {
        uniqueMap.set(sig, result);
      }
    }

    const deduplicated = Array.from(uniqueMap.values());
    let duplicatesRemoved = filtered.length - deduplicated.length;

    // Semantic deduplication - only for records from the SAME table
    // Records from different tables are kept (they could be snapshots)
    const finalResults: FilteredResult[] = [];
    const processed = new Set<string>();

    // Group by table for smarter deduplication
    const tableGroups = new Map<string, FilteredResult[]>();
    for (const result of deduplicated) {
      if (!tableGroups.has(result.table)) {
        tableGroups.set(result.table, []);
      }
      tableGroups.get(result.table)!.push(result);
    }

    // Deduplicate within each table separately
    for (const [table, tableResults] of tableGroups) {
      const tableFinal: FilteredResult[] = [];
      
      for (const result of tableResults) {
        if (processed.has(result.id)) continue;

        // Check semantic similarity only within same table
        let isDuplicate = false;
        for (const existing of tableFinal.slice(-20)) {
          try {
            const similarity = await recordSimilarity(result.record, existing.record);
            if (similarity >= CONFIG.deduplicationThreshold) {
              isDuplicate = true;
              duplicatesRemoved++;
              break;
            }
          } catch {
            // Skip similarity check on error
          }
        }

        if (!isDuplicate) {
          tableFinal.push(result);
        }
        processed.add(result.id);
      }
      
      finalResults.push(...tableFinal);
    }

    // Sort by match score
    finalResults.sort((a, b) => b.matchScore - a.matchScore);

    logger.info('Filtering complete', {
      original: results.length,
      afterFilter: filtered.length,
      afterDedup: finalResults.length,
      duplicatesRemoved,
    });

    return { filtered: finalResults, duplicatesRemoved };
  }

  private recordMatchesFilter(record: Record<string, unknown>, filter: SearchCriterion): boolean {
    const filterValue = filter.normalizedValue.toLowerCase();

    for (const [, value] of Object.entries(record)) {
      if (value === null || value === undefined) continue;
      const strValue = String(value).toLowerCase();
      if (strValue.includes(filterValue)) {
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // STAGE 5: BUILD CORRELATION GRAPH
  // =========================================================================

  buildCorrelationGraph(results: FilteredResult[]): CorrelationGraph {
    const nodeMap = new Map<string, CorrelationNode>();
    const edges: CorrelationEdge[] = [];

    const fieldCategories: Record<string, CorrelationNode['type']> = {
      name: 'person', first_name: 'person', last_name: 'person', full_name: 'person',
      phone: 'phone', mobile: 'phone', glusr_usr_ph_mobile: 'phone',
      email: 'email', email1: 'email',
      city: 'location', state: 'location', address: 'location',
      company_name: 'company',
      account: 'account', account_number: 'account',
      pan: 'id', aadhaar: 'id', id_number: 'id',
    };

    for (const result of results) {
      const recordNodes: string[] = [];

      for (const [field, value] of Object.entries(result.record)) {
        if (value === null || value === undefined || value === '') continue;

        const fieldType = fieldCategories[field.toLowerCase()] || 'other';
        const normalizedValue = String(value).toLowerCase().trim();

        if (normalizedValue.length < 2) continue;

        const nodeId = `${fieldType}:${normalizedValue}`;

        if (!nodeMap.has(nodeId)) {
          nodeMap.set(nodeId, {
            id: nodeId,
            type: fieldType,
            value: String(value),
            count: 0,
            connections: [],
            sources: [],
          });
        }

        const node = nodeMap.get(nodeId)!;
        node.count++;
        if (!node.sources.includes(result.table)) {
          node.sources.push(result.table);
        }
        recordNodes.push(nodeId);
      }

      // Create edges
      for (let i = 0; i < recordNodes.length; i++) {
        for (let j = i + 1; j < recordNodes.length; j++) {
          const source = recordNodes[i];
          const target = recordNodes[j];

          if (!nodeMap.get(source)!.connections.includes(target)) {
            nodeMap.get(source)!.connections.push(target);
          }
          if (!nodeMap.get(target)!.connections.includes(source)) {
            nodeMap.get(target)!.connections.push(source);
          }

          const existingEdge = edges.find(
            e => (e.source === source && e.target === target) ||
                 (e.source === target && e.target === source)
          );

          if (existingEdge) {
            existingEdge.weight++;
          } else {
            edges.push({ source, target, weight: 1, type: 'co_occurrence' });
          }
        }
      }
    }

    // Clusters
    const clusters = this.identifyClusters(nodeMap, edges);

    const nodes = Array.from(nodeMap.values()).sort((a, b) => b.count - a.count);
    edges.sort((a, b) => b.weight - a.weight);

    return { nodes, edges, clusters };
  }

  private identifyClusters(
    nodeMap: Map<string, CorrelationNode>,
    edges: CorrelationEdge[]
  ): CorrelationGraph['clusters'] {
    const clusters: CorrelationGraph['clusters'] = [];
    const visited = new Set<string>();

    for (const node of Array.from(nodeMap.values())) {
      if (visited.has(node.id)) continue;

      const clusterNodes = [node.id];
      visited.add(node.id);

      for (const connectedId of node.connections) {
        const edge = edges.find(
          e => (e.source === node.id && e.target === connectedId) ||
               (e.target === node.id && e.source === connectedId)
        );

        if (edge && edge.weight >= 2) {
          clusterNodes.push(connectedId);
          visited.add(connectedId);
        }
      }

      if (clusterNodes.length > 1) {
        const clusterNode = nodeMap.get(node.id)!;
        clusters.push({
          id: `cluster_${clusters.length}`,
          nodes: clusterNodes,
          label: `${clusterNode.type}: ${clusterNode.value}`,
        });
      }
    }

    return clusters;
  }

  // =========================================================================
  // STAGE 6: GENERATE INSIGHTS (Uses Ollama Client)
  // =========================================================================

  async generateInsights(
    query: ParsedQuery,
    filteredResults: FilteredResult[],
    correlationGraph: CorrelationGraph,
    allResults?: PaginatedResult[]
  ): Promise<RobustSearchResponse['insights']> {
    this.updateProgress({
      stage: 'analyzing',
      message: 'Generating AI insights...',
      progress: 90,
      currentPage: 0,
      totalResults: filteredResults.length,
      hasMore: false,
    });

    const topMatches = filteredResults.slice(0, 10);

    const entityConnections = correlationGraph.nodes.slice(0, 20).map(node => ({
      entity: node.value,
      type: node.type,
      appearances: node.count,
      tables: node.sources,
    }));

    const patterns = this.identifyPatterns(filteredResults, correlationGraph);

    let summary = '';
    let recommendations: string[] = [];
    let confidence = 0.7;
    let aiModel = 'fallback';
    let localAIUsed = false;

    // Try local AI first
    try {
      const isAvailable = await ollamaClient.isAvailable();
      if (isAvailable) {
        localAIUsed = true;
        aiModel = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

        const aiResults = filteredResults.slice(0, 15).map(r => ({
          table: r.table,
          record: r.record,
          matchScore: r.matchScore,
        }));

        const aiInsights = await ollamaClient.generateInsights(query.originalQuery, aiResults);

        summary = aiInsights.summary;
        recommendations = aiInsights.recommendations;
        confidence = aiInsights.confidence;
      }
    } catch (error) {
      logger.warn('Local AI failed, using fallback', error);
    }

    // Fallback
    if (!summary) {
      summary = filteredResults.length === 0
        ? `No results found for "${query.originalQuery}".`
        : `Found ${filteredResults.length} results for "${query.originalQuery}". ` +
          `Discovered ${correlationGraph.nodes.length} entities with ${correlationGraph.edges.length} connections.`;
    }

    if (recommendations.length < 2) {
      const basicRecs = this.generateRecommendations(query, filteredResults, correlationGraph);
      recommendations = [...recommendations, ...basicRecs].slice(0, 5);
    }

    return {
      summary,
      topMatches,
      entityConnections,
      patterns,
      recommendations,
      confidence,
      aiModel,
      localAIUsed,
    };
  }

  private identifyPatterns(results: FilteredResult[], graph: CorrelationGraph): string[] {
    const patterns: string[] = [];

    const topEntities = graph.nodes.slice(0, 5);
    for (const entity of topEntities) {
      if (entity.count >= 3) {
        patterns.push(`"${entity.value}" appears ${entity.count} times`);
      }
    }

    const strongEdges = graph.edges.filter(e => e.weight >= 3).slice(0, 5);
    for (const edge of strongEdges) {
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      const targetNode = graph.nodes.find(n => n.id === edge.target);
      if (sourceNode && targetNode) {
        patterns.push(`Strong link: "${sourceNode.value}" ↔ "${targetNode.value}"`);
      }
    }

    return patterns;
  }

  private generateRecommendations(
    query: ParsedQuery,
    results: FilteredResult[],
    graph: CorrelationGraph
  ): string[] {
    const recommendations: string[] = [];

    if (results.length === 0) {
      recommendations.push('Try broadening your search criteria');
    } else if (results.length > 100) {
      recommendations.push('Many results - consider adding more specific filters');
    }

    if (graph.clusters.length > 0) {
      recommendations.push(`Found ${graph.clusters.length} entity clusters to investigate`);
    }

    const highValueCount = this.allDiscoveredEntities.filter(e => 
      ['phone', 'email', 'id_number'].includes(e.type)
    ).length;

    if (highValueCount > 1) {
      recommendations.push(`${highValueCount} unique identifiers discovered - explore connections`);
    }

    return recommendations;
  }

  // =========================================================================
  // MAIN ENTRY POINT
  // =========================================================================

  async search(query: string): Promise<RobustSearchResponse> {
    const startTime = Date.now();
    this.cursorsUsed = [];
    this.apiCalls = 0;
    this.earlyStopped = false;

    try {
      // Stage 1: Parse query
      const parsedQuery = await this.parseQuery(query);

      // Stage 2: Execute iterative search
      const allResults = await this.executeIterativeSearch(parsedQuery);

      // Stage 3: Filter and deduplicate
      const { filtered, duplicatesRemoved } = await this.filterAndDeduplicate(
        allResults.map(r => ({ ...r, pageNumber: r.pageNumber || 1 })),
        parsedQuery.secondaryCriteria
      );

      // Stage 4: Build correlation graph
      const correlationGraph = this.buildCorrelationGraph(filtered);

      // Stage 5: Generate insights
      const insights = await this.generateInsights(parsedQuery, filtered, correlationGraph, allResults);

      // Complete
      this.updateProgress({
        stage: 'complete',
        message: `Search complete! Found ${filtered.length} results.`,
        progress: 100,
        currentPage: 0,
        totalResults: filtered.length,
        hasMore: false,
      });

      const highValueEntities = this.allDiscoveredEntities.length;
      const lowValueEntities = parsedQuery.secondaryCriteria.length;

      return {
        success: true,
        query: parsedQuery,
        allFetchedResults: allResults,
        totalFetched: allResults.length,
        totalPages: this.cursorsUsed.length + 1,
        filteredResults: filtered,
        totalFiltered: filtered.length,
        duplicatesRemoved,
        correlationGraph,
        insights,
        metadata: {
          duration: Date.now() - startTime,
          apiCalls: this.apiCalls,
          cursorsUsed: this.cursorsUsed,
          primarySearchTerm: parsedQuery.primaryCriteria[0]?.normalizedValue || query,
          filtersApplied: parsedQuery.secondaryCriteria.map(c => c.description),
          hasMoreData: !this.earlyStopped,
          earlyStopped: this.earlyStopped,
          iterations: Math.min(this.allDiscoveredEntities.length > 0 ? CONFIG.maxIterations : 1, CONFIG.maxIterations),
          discoveredEntities: highValueEntities,
          discoveredEntityList: this.allDiscoveredEntities.slice(0, 10).map(e => e.value),
          highValueEntities,
          lowValueEntities,
        },
      };

    } catch (error) {
      logger.error('Search failed', error);

      return {
        success: false,
        query: {
          originalQuery: query,
          primaryCriteria: [],
          secondaryCriteria: [],
          intent: 'Unknown',
        },
        allFetchedResults: [],
        totalFetched: 0,
        totalPages: 0,
        filteredResults: [],
        totalFiltered: 0,
        duplicatesRemoved: 0,
        correlationGraph: { nodes: [], edges: [], clusters: [] },
        insights: {
          summary: `Search failed: ${(error as Error).message}`,
          topMatches: [],
          entityConnections: [],
          patterns: [],
          recommendations: ['Try a different search query'],
          confidence: 0,
          aiModel: 'none',
          localAIUsed: false,
        },
        metadata: {
          duration: Date.now() - startTime,
          apiCalls: this.apiCalls,
          cursorsUsed: this.cursorsUsed,
          primarySearchTerm: query,
          filtersApplied: [],
          hasMoreData: false,
          earlyStopped: false,
          iterations: 0,
          discoveredEntities: 0,
          discoveredEntityList: [],
          highValueEntities: 0,
          lowValueEntities: 0,
        },
      };
    }
  }
}

// Factory function
export function createRobustSearch(
  options?: {
    progressCallback?: (progress: ProgressUpdate) => void;
    apiBaseUrl?: string;
    bearerToken?: string;
  }
): RobustAgentSearchEngine {
  return new RobustAgentSearchEngine(options);
}
