/**
 * Intelligent Agent Search Engine
 * 
 * 2026 Best Practices Implementation:
 * 
 * 1. Entity Extraction: GLiNER-style zero-shot NER
 *    - Only HIGH-VALUE entities (phone, email, ID, account) are used for searching
 *    - LOW-VALUE entities (name, location) are used for filtering ONLY
 * 
 * 2. Local AI: Ollama with Qwen 2.5 3B or Llama 3.2 3B
 *    - Entity disambiguation
 *    - Insight generation
 *    - Relationship analysis
 * 
 * 3. Semantic Similarity: BGE-M3 / all-MiniLM
 *    - Duplicate detection
 *    - Entity clustering
 *    - Cross-document linking
 * 
 * 4. Knowledge Graph: GraphRAG-style construction
 *    - Multi-hop reasoning
 *    - Entity relationships
 */

import { createLogger } from './logger';
import { entityExtractor, type ExtractedEntity, type EntityExtractionResult } from './entity-extractor';
import { ollamaClient, type EntityAnalysisResult } from './ollama-client';
import { embeddingService, recordSimilarity } from './embedding-service';

const logger = createLogger('IntelligentAgentSearch');

// ============================================================================
// TYPES
// ============================================================================

export interface SearchConfig {
  // API settings
  apiBaseUrl: string;
  bearerToken?: string;
  
  // Pagination
  maxPages: number;
  pageSize: number;
  maxResults: number;
  
  // Iterative search
  maxIterations: number;
  maxEntitiesPerIteration: number;
  
  // AI settings
  useLocalAI: boolean;
  aiModel: string;
  
  // Similarity
  deduplicationThreshold: number;
  clusteringThreshold: number;
}

export interface SearchCriterion {
  id: string;
  type: 'search' | 'filter'; // search = API query, filter = result filtering
  category: 'phone' | 'email' | 'id_number' | 'account' | 'name' | 'location' | 'company';
  value: string;
  normalizedValue: string;
  priority: number;
  confidence: number;
}

export interface ParsedQuery {
  originalQuery: string;
  searchCriteria: SearchCriterion[];   // HIGH-VALUE: For API search
  filterCriteria: SearchCriterion[];   // LOW-VALUE: For result filtering
  intent: string;
}

export interface SearchResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  matchScore: number;
  matchedSearchTerms: string[];
  matchedFilters: string[];
  highlights: Record<string, string>;
  entitySignature: string; // For deduplication
}

export interface EntityNode {
  id: string;
  type: 'person' | 'phone' | 'email' | 'location' | 'company' | 'id' | 'account';
  value: string;
  count: number;
  sources: string[];
  connections: string[];
}

export interface EntityEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  evidence: string[];
}

export interface KnowledgeGraph {
  nodes: EntityNode[];
  edges: EntityEdge[];
  clusters: Array<{
    id: string;
    nodes: string[];
    label: string;
    confidence: number;
  }>;
}

export interface IntelligentSearchResponse {
  success: boolean;
  query: ParsedQuery;
  
  // Results
  results: SearchResult[];
  totalResults: number;
  uniqueResults: number;
  duplicatesRemoved: number;
  
  // Analysis
  knowledgeGraph: KnowledgeGraph;
  insights: {
    summary: string;
    keyFindings: string[];
    entityConnections: string[];
    recommendations: string[];
    confidence: number;
  };
  
  // Metadata
  metadata: {
    duration: number;
    apiCalls: number;
    pagesFetched: number;
    iterations: number;
    entitiesExtracted: number;
    highValueEntities: number;
    lowValueEntities: number;
    aiModel: string;
    localAIUsed: boolean;
  };
}

export interface ProgressCallback {
  (progress: {
    stage: 'parsing' | 'searching' | 'paginating' | 'iterating' | 'analyzing' | 'complete';
    message: string;
    progress: number;
    currentPage?: number;
    totalResults?: number;
    iteration?: number;
    discoveredEntities?: string[];
  }): void;
}

// Default configuration
const DEFAULT_CONFIG: SearchConfig = {
  apiBaseUrl: process.env.SEARCH_API_URL || 'http://localhost:8080',
  maxPages: 500,
  pageSize: 100,
  maxResults: 50000,
  maxIterations: 3,
  maxEntitiesPerIteration: 5,
  useLocalAI: true,
  aiModel: 'qwen2.5:3b',
  deduplicationThreshold: 0.95,
  clusteringThreshold: 0.85,
};

// ============================================================================
// INTELLIGENT AGENT SEARCH ENGINE
// ============================================================================

export class IntelligentAgentSearchEngine {
  private config: SearchConfig;
  private progressCallback?: ProgressCallback;
  
  // Tracking
  private searchedTerms = new Set<string>();
  private allEntities: ExtractedEntity[] = [];
  private apiCalls = 0;
  private pagesFetched = 0;

  constructor(config: Partial<SearchConfig>, progressCallback?: ProgressCallback) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.progressCallback = progressCallback;
  }

  private updateProgress(progress: Parameters<ProgressCallback>[0]): void {
    logger.info(`Progress: ${progress.stage} - ${progress.message}`);
    this.progressCallback?.(progress);
  }

  // =========================================================================
  // STAGE 1: INTELLIGENT QUERY PARSING
  // =========================================================================

  /**
   * Parse query using GLiNER-style entity extraction
   * 
   * KEY INSIGHT: Only HIGH-VALUE entities are used for searching!
   * LOW-VALUE entities (names, locations) are only used for filtering.
   */
  async parseQuery(query: string): Promise<ParsedQuery> {
    this.updateProgress({
      stage: 'parsing',
      message: 'Extracting entities from query...',
      progress: 5,
    });

    logger.info('Parsing query', { query });

    // Extract entities using GLiNER-style extraction
    const extraction = entityExtractor.extract(query);

    // Separate into search (HIGH-VALUE) and filter (LOW-VALUE) criteria
    const searchCriteria: SearchCriterion[] = [];
    const filterCriteria: SearchCriterion[] = [];

    for (const entity of extraction.highValueEntities) {
      searchCriteria.push({
        id: `search_${entity.type}_${entity.normalized}`,
        type: 'search',
        category: entity.type as SearchCriterion['category'],
        value: entity.original,
        normalizedValue: entity.normalized,
        priority: entity.searchPriority,
        confidence: entity.confidence,
      });
    }

    for (const entity of extraction.lowValueEntities) {
      filterCriteria.push({
        id: `filter_${entity.type}_${entity.normalized}`,
        type: 'filter',
        category: entity.type as SearchCriterion['category'],
        value: entity.original,
        normalizedValue: entity.normalized,
        priority: entity.searchPriority,
        confidence: entity.confidence,
      });
    }

    // If no search criteria, use the most specific criterion
    if (searchCriteria.length === 0 && filterCriteria.length > 0) {
      // Sort by length (longer = more specific)
      filterCriteria.sort((a, b) => b.normalizedValue.length - a.normalizedValue.length);
      const promoted = filterCriteria.shift()!;
      promoted.type = 'search';
      searchCriteria.push(promoted);
    }

    // Determine intent
    const intent = this.determineIntent(query, searchCriteria, filterCriteria);

    logger.info('Query parsed', {
      searchTerms: searchCriteria.map(c => c.normalizedValue),
      filterTerms: filterCriteria.map(c => c.normalizedValue),
      intent,
    });

    return {
      originalQuery: query,
      searchCriteria,
      filterCriteria,
      intent,
    };
  }

  private determineIntent(
    query: string,
    search: SearchCriterion[],
    filter: SearchCriterion[]
  ): string {
    const searchTypes = new Set(search.map(c => c.category));
    const filterTypes = new Set(filter.map(c => c.category));

    if (searchTypes.has('phone')) return 'Find person by phone number';
    if (searchTypes.has('email')) return 'Find person by email';
    if (searchTypes.has('id_number')) return 'Find records by ID number';
    if (searchTypes.has('account')) return 'Find records by account number';
    if (filterTypes.has('name') && filterTypes.has('location')) return 'Find person by name and location';
    if (filterTypes.has('name')) return 'Find person by name';
    return 'General search';
  }

  // =========================================================================
  // STAGE 2: INTELLIGENT SEARCH WITH PAGINATION
  // =========================================================================

  /**
   * Execute search with full pagination
   * Only searches using HIGH-VALUE unique identifiers!
   */
  async executeSearch(parsedQuery: ParsedQuery): Promise<{
    results: SearchResult[];
    iterations: number;
    allExtractedEntities: ExtractedEntity[];
  }> {
    const allResults: SearchResult[] = [];
    this.searchedTerms.clear();
    this.allEntities = [];
    let iterations = 0;

    // Get primary search term (highest priority)
    const primarySearch = parsedQuery.searchCriteria
      .sort((a, b) => b.priority - a.priority)[0];

    if (!primarySearch) {
      logger.warn('No search criteria found');
      return { results: [], iterations: 0, allExtractedEntities: [] };
    }

    // Initial search with primary term
    this.updateProgress({
      stage: 'searching',
      message: `Searching for "${primarySearch.normalizedValue}"...`,
      progress: 10,
    });

    const initialResults = await this.searchWithPagination(primarySearch.normalizedValue);
    allResults.push(...initialResults);
    this.searchedTerms.add(primarySearch.normalizedValue.toLowerCase());

    // Extract entities from initial results
    const initialEntities = this.extractEntitiesFromResults(initialResults);
    this.allEntities.push(...initialEntities);

    iterations = 1;

    // Iterative search: discover new HIGH-VALUE identifiers
    while (iterations < this.config.maxIterations) {
      // Get new HIGH-VALUE search terms
      const newSearchTerms = this.getNewSearchTerms();

      if (newSearchTerms.length === 0) {
        logger.info('No new unique identifiers found, stopping iteration');
        break;
      }

      this.updateProgress({
        stage: 'iterating',
        message: `Iteration ${iterations + 1}: Searching ${newSearchTerms.length} new identifiers...`,
        progress: 10 + (iterations * 15),
        iteration: iterations + 1,
        discoveredEntities: newSearchTerms,
      });

      // Search each new term
      for (const term of newSearchTerms) {
        this.searchedTerms.add(term.toLowerCase());

        const newResults = await this.searchWithPagination(term);
        
        // Add unique results
        for (const result of newResults) {
          if (!this.isDuplicateResult(result, allResults)) {
            allResults.push(result);
          }
        }

        // Safety limit
        if (allResults.length >= this.config.maxResults) {
          logger.warn(`Max results limit reached: ${this.config.maxResults}`);
          break;
        }
      }

      // Extract entities from all results for next iteration
      const newEntities = this.extractEntitiesFromResults(allResults);
      this.allEntities = this.mergeEntities(this.allEntities, newEntities);

      iterations++;

      if (allResults.length >= this.config.maxResults) break;
    }

    logger.info('Search complete', {
      results: allResults.length,
      iterations,
      entitiesExtracted: this.allEntities.length,
    });

    return {
      results: allResults,
      iterations,
      allExtractedEntities: this.allEntities,
    };
  }

  /**
   * Search with cursor-based pagination
   */
  private async searchWithPagination(searchTerm: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < this.config.maxPages) {
      const progressPercent = Math.min(70, 10 + (pageCount / this.config.maxPages) * 50);

      this.updateProgress({
        stage: pageCount === 0 ? 'searching' : 'paginating',
        message: `Fetching page ${pageCount + 1} (${results.length.toLocaleString()} results)...`,
        progress: progressPercent,
        currentPage: pageCount + 1,
        totalResults: results.length,
      });

      try {
        const url = new URL('/api/search', this.config.apiBaseUrl);
        url.searchParams.set('q', searchTerm);
        url.searchParams.set('limit', String(this.config.pageSize));
        if (cursor) {
          url.searchParams.set('cursor', cursor);
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.config.bearerToken) {
          headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        this.apiCalls++;
        pageCount++;
        this.pagesFetched++;

        // Process results
        if (data.results) {
          for (const [table, records] of Object.entries(data.results) as [string, unknown[]][]) {
            if (Array.isArray(records)) {
              for (const record of records) {
                const searchResult = this.processResult(table, record as Record<string, unknown>);
                results.push(searchResult);
              }
            }
          }
        }

        // Update pagination state
        hasMore = data.has_more || false;
        cursor = data.next_cursor || undefined;

        // Safety limit
        if (results.length >= this.config.maxResults) break;

        // Invalid state check
        if (hasMore && !cursor) {
          logger.warn('has_more is true but no cursor provided');
          break;
        }

      } catch (error) {
        logger.error(`Error fetching page ${pageCount + 1}`, error);
        break;
      }
    }

    return results;
  }

  /**
   * Process a single search result
   */
  private processResult(table: string, record: Record<string, unknown>): SearchResult {
    // Generate unique ID
    const id = `${table}:${record.id || record._id || Math.random().toString(36).slice(2)}`;

    // Generate entity signature for deduplication
    const entitySignature = this.generateEntitySignature(record);

    return {
      id,
      table,
      record,
      matchScore: 1.0,
      matchedSearchTerms: [],
      matchedFilters: [],
      highlights: {},
      entitySignature,
    };
  }

  /**
   * Generate signature for deduplication
   */
  private generateEntitySignature(record: Record<string, unknown>): string {
    const parts: string[] = [];

    // Phone is most unique
    const phone = this.getFieldValue(record, ['phone', 'mobile', 'glusr_usr_ph_mobile']);
    if (phone) {
      const normalized = String(phone).replace(/\D/g, '').slice(-10);
      parts.push(`phone:${normalized}`);
    }

    // Email is highly unique
    const email = this.getFieldValue(record, ['email', 'email1', 'email_id']);
    if (email) {
      parts.push(`email:${String(email).toLowerCase()}`);
    }

    // ID numbers
    const idFields = ['pan', 'aadhaar', 'id_number', 'global_id'];
    for (const field of idFields) {
      const value = record[field];
      if (value) {
        parts.push(`${field}:${String(value)}`);
      }
    }

    // If no unique identifiers, use record hash
    if (parts.length === 0) {
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
  // STAGE 3: ENTITY EXTRACTION FROM RESULTS
  // =========================================================================

  /**
   * Extract HIGH-VALUE entities from results
   * Only extracts: phone, email, id_number, account
   */
  private extractEntitiesFromResults(results: SearchResult[]): ExtractedEntity[] {
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
   * Get new HIGH-VALUE search terms (not already searched)
   */
  private getNewSearchTerms(): string[] {
    const terms: string[] = [];
    const seen = new Set<string>();

    // Priority order
    const typePriority = ['phone', 'email', 'id_number', 'account'];

    for (const type of typePriority) {
      for (const entity of this.allEntities) {
        if (entity.type !== type) continue;
        if (this.searchedTerms.has(entity.normalized.toLowerCase())) continue;
        if (seen.has(entity.normalized)) continue;

        seen.add(entity.normalized);
        terms.push(entity.normalized);

        if (terms.length >= this.config.maxEntitiesPerIteration) break;
      }
      if (terms.length >= this.config.maxEntitiesPerIteration) break;
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

  private isDuplicateResult(result: SearchResult, existing: SearchResult[]): boolean {
    return existing.some(r => r.entitySignature === result.entitySignature);
  }

  // =========================================================================
  // STAGE 4: FILTERING AND DEDUPLICATION
  // =========================================================================

  /**
   * Filter results using LOW-VALUE criteria
   * Also removes duplicates using semantic similarity
   */
  async filterAndDeduplicate(
    results: SearchResult[],
    filterCriteria: SearchCriterion[]
  ): Promise<{ filtered: SearchResult[]; duplicatesRemoved: number }> {
    this.updateProgress({
      stage: 'analyzing',
      message: 'Filtering and deduplicating results...',
      progress: 75,
    });

    let filtered = results;

    // Apply filters if provided
    if (filterCriteria.length > 0) {
      filtered = results.filter(result => {
        for (const filter of filterCriteria) {
          if (this.recordMatchesFilter(result.record, filter)) {
            result.matchedFilters.push(filter.normalizedValue);
            result.matchScore += 0.2;
          }
        }
        return result.matchedFilters.length > 0 || filterCriteria.length === 0;
      });
    }

    // Deduplicate using entity signatures
    const uniqueMap = new Map<string, SearchResult>();
    for (const result of filtered) {
      const existing = uniqueMap.get(result.entitySignature);
      if (!existing || result.matchScore > existing.matchScore) {
        uniqueMap.set(result.entitySignature, result);
      }
    }

    const deduplicated = Array.from(uniqueMap.values());
    const duplicatesRemoved = filtered.length - deduplicated.length;

    // Additional semantic deduplication for similar records
    const finalResults: SearchResult[] = [];
    const processed = new Set<string>();

    for (const result of deduplicated) {
      if (processed.has(result.id)) continue;

      // Check against already processed results
      let isDuplicate = false;
      for (const existing of finalResults) {
        const similarity = await recordSimilarity(result.record, existing.record);
        if (similarity >= this.config.deduplicationThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        finalResults.push(result);
      }
      processed.add(result.id);
    }

    logger.info('Filtering complete', {
      original: results.length,
      afterFilter: filtered.length,
      afterDedup: finalResults.length,
    });

    return {
      filtered: finalResults,
      duplicatesRemoved: duplicatesRemoved + (deduplicated.length - finalResults.length),
    };
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
  // STAGE 5: KNOWLEDGE GRAPH CONSTRUCTION
  // =========================================================================

  /**
   * Build knowledge graph from results
   */
  async buildKnowledgeGraph(results: SearchResult[]): Promise<KnowledgeGraph> {
    this.updateProgress({
      stage: 'analyzing',
      message: 'Building knowledge graph...',
      progress: 80,
    });

    const nodeMap = new Map<string, EntityNode>();
    const edges: EntityEdge[] = [];

    // Entity field mappings
    const fieldToType: Record<string, EntityNode['type']> = {
      first_name: 'person', last_name: 'person', name: 'person',
      phone: 'phone', mobile: 'phone', glusr_usr_ph_mobile: 'phone',
      email: 'email', email1: 'email',
      city: 'location', state: 'location', address: 'location',
      company_name: 'company',
    };

    // Extract entities from each result
    for (const result of results) {
      const recordNodes: string[] = [];

      for (const [field, value] of Object.entries(result.record)) {
        if (value === null || value === undefined || value === '') continue;

        const type = fieldToType[field.toLowerCase()] || null;
        if (!type) continue;

        const normalizedValue = String(value).toLowerCase().trim();
        if (normalizedValue.length < 2) continue;

        const nodeId = `${type}:${normalizedValue}`;

        if (!nodeMap.has(nodeId)) {
          nodeMap.set(nodeId, {
            id: nodeId,
            type,
            value: String(value),
            count: 0,
            sources: [],
            connections: [],
          });
        }

        const node = nodeMap.get(nodeId)!;
        node.count++;
        if (!node.sources.includes(result.table)) {
          node.sources.push(result.table);
        }
        recordNodes.push(nodeId);
      }

      // Create edges between entities in same record
      for (let i = 0; i < recordNodes.length; i++) {
        for (let j = i + 1; j < recordNodes.length; j++) {
          const source = recordNodes[i];
          const target = recordNodes[j];

          // Update connections
          if (!nodeMap.get(source)!.connections.includes(target)) {
            nodeMap.get(source)!.connections.push(target);
          }
          if (!nodeMap.get(target)!.connections.includes(source)) {
            nodeMap.get(target)!.connections.push(source);
          }

          // Create/update edge
          const existingEdge = edges.find(
            e => (e.source === source && e.target === target) ||
                 (e.source === target && e.target === source)
          );

          if (existingEdge) {
            existingEdge.weight++;
            if (!existingEdge.evidence.includes(result.id)) {
              existingEdge.evidence.push(result.id);
            }
          } else {
            edges.push({
              source,
              target,
              type: 'co_occurrence',
              weight: 1,
              evidence: [result.id],
            });
          }
        }
      }
    }

    // Identify clusters
    const clusters = this.identifyClusters(nodeMap, edges);

    // Sort
    const nodes = Array.from(nodeMap.values()).sort((a, b) => b.count - a.count);
    edges.sort((a, b) => b.weight - a.weight);

    return { nodes, edges, clusters };
  }

  private identifyClusters(
    nodeMap: Map<string, EntityNode>,
    edges: EntityEdge[]
  ): KnowledgeGraph['clusters'] {
    const clusters: KnowledgeGraph['clusters'] = [];
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
          confidence: 0.8,
        });
      }
    }

    return clusters.sort((a, b) => b.nodes.length - a.nodes.length);
  }

  // =========================================================================
  // STAGE 6: AI-POWERED INSIGHTS
  // =========================================================================

  /**
   * Generate insights using local AI
   */
  async generateInsights(
    query: ParsedQuery,
    results: SearchResult[],
    graph: KnowledgeGraph
  ): Promise<IntelligentSearchResponse['insights']> {
    this.updateProgress({
      stage: 'analyzing',
      message: 'Generating AI insights...',
      progress: 90,
    });

    // Try local AI first
    if (this.config.useLocalAI) {
      try {
        const isAvailable = await ollamaClient.isAvailable();
        if (isAvailable) {
          const aiResults = results.slice(0, 15).map(r => ({
            table: r.table,
            record: r.record,
            matchScore: r.matchScore,
          }));

          const aiInsights = await ollamaClient.generateInsights(
            query.originalQuery,
            aiResults
          );

          return {
            summary: aiInsights.summary,
            keyFindings: aiInsights.keyFindings,
            entityConnections: aiInsights.entityConnections,
            recommendations: aiInsights.recommendations,
            confidence: aiInsights.confidence,
          };
        }
      } catch (error) {
        logger.warn('Local AI failed, using fallback', error);
      }
    }

    // Fallback insights
    return this.generateFallbackInsights(query, results, graph);
  }

  private generateFallbackInsights(
    query: ParsedQuery,
    results: SearchResult[],
    graph: KnowledgeGraph
  ): IntelligentSearchResponse['insights'] {
    const summary = results.length === 0
      ? `No results found for "${query.originalQuery}".`
      : `Found ${results.length} results for "${query.originalQuery}". ` +
        `Discovered ${graph.nodes.length} entities with ${graph.edges.length} connections.`;

    const keyFindings: string[] = [];
    const topEntities = graph.nodes.slice(0, 5);
    for (const entity of topEntities) {
      if (entity.count >= 2) {
        keyFindings.push(`"${entity.value}" appears ${entity.count} times across ${entity.sources.length} tables`);
      }
    }

    const entityConnections: string[] = [];
    const strongEdges = graph.edges.filter(e => e.weight >= 2).slice(0, 5);
    for (const edge of strongEdges) {
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      const targetNode = graph.nodes.find(n => n.id === edge.target);
      if (sourceNode && targetNode) {
        entityConnections.push(`Strong link: "${sourceNode.value}" ↔ "${targetNode.value}" (${edge.weight} co-occurrences)`);
      }
    }

    const recommendations: string[] = [];
    if (results.length > 100) {
      recommendations.push('Many results found - consider adding more specific filters');
    }
    if (graph.clusters.length > 0) {
      recommendations.push(`Found ${graph.clusters.length} entity clusters worth investigating`);
    }
    if (this.allEntities.filter(e => e.type === 'phone').length > 1) {
      recommendations.push('Multiple phone numbers discovered - investigate connections');
    }

    return {
      summary,
      keyFindings,
      entityConnections,
      recommendations,
      confidence: 0.7,
    };
  }

  // =========================================================================
  // MAIN ENTRY POINT
  // =========================================================================

  /**
   * Execute intelligent search
   */
  async search(query: string): Promise<IntelligentSearchResponse> {
    const startTime = Date.now();
    this.apiCalls = 0;
    this.pagesFetched = 0;

    try {
      // Stage 1: Parse query
      const parsedQuery = await this.parseQuery(query);

      // Stage 2: Execute search
      const { results, iterations } = await this.executeSearch(parsedQuery);

      // Stage 3: Filter and deduplicate
      const { filtered, duplicatesRemoved } = await this.filterAndDeduplicate(
        results,
        parsedQuery.filterCriteria
      );

      // Stage 4: Build knowledge graph
      const knowledgeGraph = await this.buildKnowledgeGraph(filtered);

      // Stage 5: Generate insights
      const insights = await this.generateInsights(parsedQuery, filtered, knowledgeGraph);

      // Complete
      this.updateProgress({
        stage: 'complete',
        message: `Search complete! Found ${filtered.length} results.`,
        progress: 100,
        totalResults: filtered.length,
      });

      const highValueEntities = this.allEntities.filter(e => e.searchValue === 'HIGH');
      const lowValueEntities = this.allEntities.filter(e => e.searchValue === 'LOW');

      return {
        success: true,
        query: parsedQuery,
        results: filtered,
        totalResults: results.length,
        uniqueResults: filtered.length,
        duplicatesRemoved,
        knowledgeGraph,
        insights,
        metadata: {
          duration: Date.now() - startTime,
          apiCalls: this.apiCalls,
          pagesFetched: this.pagesFetched,
          iterations,
          entitiesExtracted: this.allEntities.length,
          highValueEntities: highValueEntities.length,
          lowValueEntities: lowValueEntities.length,
          aiModel: this.config.aiModel,
          localAIUsed: this.config.useLocalAI,
        },
      };

    } catch (error) {
      logger.error('Search failed', error);
      
      return {
        success: false,
        query: {
          originalQuery: query,
          searchCriteria: [],
          filterCriteria: [],
          intent: 'Unknown',
        },
        results: [],
        totalResults: 0,
        uniqueResults: 0,
        duplicatesRemoved: 0,
        knowledgeGraph: { nodes: [], edges: [], clusters: [] },
        insights: {
          summary: `Search failed: ${(error as Error).message}`,
          keyFindings: [],
          entityConnections: [],
          recommendations: ['Try a different search query'],
          confidence: 0,
        },
        metadata: {
          duration: Date.now() - startTime,
          apiCalls: this.apiCalls,
          pagesFetched: this.pagesFetched,
          iterations: 0,
          entitiesExtracted: 0,
          highValueEntities: 0,
          lowValueEntities: 0,
          aiModel: this.config.aiModel,
          localAIUsed: false,
        },
      };
    }
  }
}

// Factory function
export function createIntelligentSearch(
  config: Partial<SearchConfig>,
  progressCallback?: ProgressCallback
): IntelligentAgentSearchEngine {
  return new IntelligentAgentSearchEngine(config, progressCallback);
}