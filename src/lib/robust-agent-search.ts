/**
 * Robust AI Agent Search Engine
 * 
 * Complete Workflow:
 * 1. User gives query: "rahul sharma from delhi having no. 9876543210"
 * 2. Agent extracts search criteria:
 *    - Primary (search term): 9876543210 (phone)
 *    - Secondary (filter): "Rahul Sharma" (name), "Delhi" (location)
 * 3. Agent searches /api/search?q=9876543210
 * 4. If has_more=true, uses cursor to get ALL results:
 *    - /api/search?q=9876543210&cursor=abc123
 *    - /api/search?q=9876543210&cursor=def456
 *    - ... until has_more=false
 * 5. Collects ALL results from pagination
 * 6. Filters results for "Rahul Sharma" and "Delhi"
 * 7. Generates correlation graphs and analysis
 */

import { createLogger } from './logger';
import { getUnifiedAI, shouldUseLocalAI, type ChatMessage } from './local-ai-client';

const logger = createLogger('RobustAgentSearch');

// ============================================================================
// TYPES
// ============================================================================

export interface SearchCriterion {
  id: string;
  type: 'primary' | 'secondary'; // primary = search term, secondary = filter
  category: 'phone' | 'name' | 'location' | 'email' | 'id_number' | 'account' | 'company' | 'keyword';
  value: string;
  normalizedValue: string;
  description: string;
  confidence: number;
}

export interface ParsedQuery {
  originalQuery: string;
  primaryCriteria: SearchCriterion[];  // Terms to search on API
  secondaryCriteria: SearchCriterion[]; // Terms to filter results
  intent: string;
}

export interface PaginatedResult {
  table: string;
  record: Record<string, unknown>;
  pageNumber: number;
  cursor: string | null;
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
  type: 'person' | 'phone' | 'location' | 'email' | 'company' | 'account' | 'other';
  value: string;
  count: number;
  connections: string[]; // IDs of connected nodes
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
  };
}

export interface ProgressUpdate {
  stage: 'parsing' | 'searching' | 'paginating' | 'filtering' | 'analyzing' | 'complete';
  message: string;
  progress: number;
  currentPage: number;
  totalResults: number;
  hasMore: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Pagination settings
  maxPages: 1000,           // Maximum pages to fetch (safety limit)
  pageSize: 100,            // Results per page
  paginationTimeout: 30000, // 30 seconds per page
  
  // Early stopping
  maxResults: 50000,        // Maximum total results to fetch
  stopOnExactMatch: false,  // Don't stop early - get all results
  
  // Filtering
  minMatchScore: 0.3,       // Minimum score to include in filtered results
  
  // API settings
  apiTimeout: 60000,        // 1 minute total timeout
  retryAttempts: 3,
  retryDelay: 1000,
};

// ============================================================================
// ROBUST AGENT SEARCH ENGINE
// ============================================================================

export class RobustAgentSearchEngine {
  private progressCallback?: (progress: ProgressUpdate) => void;
  private apiBaseUrl: string;
  private bearerToken?: string;
  private aiMode: 'cloud' | 'local' | 'fallback' = 'cloud';
  
  // Tracking
  private cursorsUsed: string[] = [];
  private apiCalls = 0;
  private earlyStopped = false;

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
    logger.info(`Progress: ${progress.stage} - ${progress.message}`);
    this.progressCallback?.(progress);
  }

  // =========================================================================
  // STAGE 1: QUERY PARSING
  // =========================================================================

  /**
   * Parse the user query to extract:
   * - Primary criteria: Terms to search on the API (phone, email, ID, etc.)
   * - Secondary criteria: Terms to filter results (name, location, etc.)
   */
  async parseQuery(query: string): Promise<ParsedQuery> {
    logger.info('Parsing query', { query });

    // Extract all criteria from query
    const criteria = this.extractAllCriteria(query);

    // Separate into primary (search) and secondary (filter) criteria
    const primaryCriteria: SearchCriterion[] = [];
    const secondaryCriteria: SearchCriterion[] = [];

    for (const criterion of criteria) {
      // Primary = high-selectivity terms (phone, email, ID, account)
      // Secondary = lower-selectivity terms (name, location, company)
      if (['phone', 'email', 'id_number', 'account'].includes(criterion.category)) {
        primaryCriteria.push({
          ...criterion,
          type: 'primary',
        });
      } else {
        secondaryCriteria.push({
          ...criterion,
          type: 'secondary',
        });
      }
    }

    // If no primary criteria, use the most specific secondary as primary
    if (primaryCriteria.length === 0 && secondaryCriteria.length > 0) {
      // Find the most specific (longest, most unique) criterion
      const sorted = [...secondaryCriteria].sort((a, b) => 
        b.normalizedValue.length - a.normalizedValue.length
      );
      if (sorted.length > 0) {
        const promoted = sorted[0];
        primaryCriteria.push({ ...promoted, type: 'primary' });
        secondaryCriteria.splice(0, 1);
      }
    }

    const intent = this.determineIntent(query, primaryCriteria, secondaryCriteria);

    logger.info('Query parsed', {
      primary: primaryCriteria.map(c => c.description),
      secondary: secondaryCriteria.map(c => c.description),
      intent,
    });

    return {
      originalQuery: query,
      primaryCriteria,
      secondaryCriteria,
      intent,
    };
  }

  /**
   * Extract all criteria from query using pattern matching
   */
  private extractAllCriteria(query: string): Omit<SearchCriterion, 'type'>[] {
    const criteria: Omit<SearchCriterion, 'type'>[] = [];
    let idCounter = 0;

    // Phone numbers (10 digits, Indian format)
    const phonePattern = /(?:\+91[-\s]?|0)?([6-9]\d{9})\b/g;
    let phoneMatch;
    while ((phoneMatch = phonePattern.exec(query)) !== null) {
      const phone = phoneMatch[1];
      criteria.push({
        id: `phone_${++idCounter}`,
        category: 'phone',
        value: phoneMatch[0],
        normalizedValue: phone,
        description: `Phone: ${phone}`,
        confidence: 1.0,
      });
    }

    // Email addresses
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    let emailMatch;
    while ((emailMatch = emailPattern.exec(query)) !== null) {
      criteria.push({
        id: `email_${++idCounter}`,
        category: 'email',
        value: emailMatch[1],
        normalizedValue: emailMatch[1].toLowerCase(),
        description: `Email: ${emailMatch[1]}`,
        confidence: 1.0,
      });
    }

    // PAN numbers (ABCDE1234F)
    const panPattern = /([A-Z]{5}\d{4}[A-Z])\b/gi;
    let panMatch;
    while ((panMatch = panPattern.exec(query)) !== null) {
      criteria.push({
        id: `pan_${++idCounter}`,
        category: 'id_number',
        value: panMatch[1].toUpperCase(),
        normalizedValue: panMatch[1].toUpperCase(),
        description: `PAN: ${panMatch[1].toUpperCase()}`,
        confidence: 1.0,
      });
    }

    // Aadhaar numbers (12 digits)
    const aadhaarPattern = /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g;
    let aadhaarMatch;
    while ((aadhaarMatch = aadhaarPattern.exec(query)) !== null) {
      const aadhaar = aadhaarMatch[1].replace(/[\s-]/g, '');
      if (aadhaar.length === 12) {
        criteria.push({
          id: `aadhaar_${++idCounter}`,
          category: 'id_number',
          value: aadhaarMatch[1],
          normalizedValue: aadhaar,
          description: `Aadhaar: ${aadhaarMatch[1]}`,
          confidence: 1.0,
        });
      }
    }

    // Account numbers
    const accountPattern = /(?:account|a\/c|acct)[\s:-]*([A-Z0-9]{6,20})/gi;
    let accountMatch;
    while ((accountMatch = accountPattern.exec(query)) !== null) {
      criteria.push({
        id: `account_${++idCounter}`,
        category: 'account',
        value: accountMatch[1],
        normalizedValue: accountMatch[1].toUpperCase(),
        description: `Account: ${accountMatch[1]}`,
        confidence: 0.9,
      });
    }

    // Names (capitalized words, 2+ words)
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    const nameMatches = query.match(namePattern) || [];
    const commonWords = new Set(['from', 'having', 'with', 'near', 'delhi', 'mumbai', 'bangalore', 'chennai', 'kolkata', 'hyderabad', 'pune', 'india']);
    
    for (const name of nameMatches) {
      const words = name.split(/\s+/);
      // Check if it's likely a name (not all common words)
      const isName = words.some(w => !commonWords.has(w.toLowerCase()));
      if (isName) {
        criteria.push({
          id: `name_${++idCounter}`,
          category: 'name',
          value: name,
          normalizedValue: name.toLowerCase(),
          description: `Name: ${name}`,
          confidence: 0.7,
        });
      }
    }

    // Locations (after prepositions)
    const locationPattern = /(?:from|in|at|near|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
    let locationMatch;
    while ((locationMatch = locationPattern.exec(query)) !== null) {
      const location = locationMatch[1];
      criteria.push({
        id: `location_${++idCounter}`,
        category: 'location',
        value: location,
        normalizedValue: location.toLowerCase(),
        description: `Location: ${location}`,
        confidence: 0.8,
      });
    }

    // Companies
    const companyPattern = /(?:company|firm|business|org)[\s:]+([A-Za-z][A-Za-z0-9\s]{2,30})/gi;
    let companyMatch;
    while ((companyMatch = companyPattern.exec(query)) !== null) {
      const company = companyMatch[1].trim();
      criteria.push({
        id: `company_${++idCounter}`,
        category: 'company',
        value: company,
        normalizedValue: company.toLowerCase(),
        description: `Company: ${company}`,
        confidence: 0.8,
      });
    }

    // If no criteria found, use whole query
    if (criteria.length === 0) {
      criteria.push({
        id: `keyword_1`,
        category: 'keyword',
        value: query,
        normalizedValue: query.toLowerCase(),
        description: `Search: ${query}`,
        confidence: 0.5,
      });
    }

    return criteria;
  }

  /**
   * Determine search intent
   */
  private determineIntent(
    query: string,
    primary: SearchCriterion[],
    secondary: SearchCriterion[]
  ): string {
    const primaryTypes = new Set(primary.map(c => c.category));
    const secondaryTypes = new Set(secondary.map(c => c.category));

    if (primaryTypes.has('phone')) {
      return 'Find person by phone number';
    }
    if (primaryTypes.has('email')) {
      return 'Find person by email';
    }
    if (primaryTypes.has('id_number')) {
      return 'Find records by ID number';
    }
    if (secondaryTypes.has('name') && secondaryTypes.has('location')) {
      return 'Find person by name and location';
    }
    return 'General search';
  }

  // =========================================================================
  // STAGE 2: PAGINATED SEARCH
  // =========================================================================

  /**
   * Search with full pagination - get ALL results using cursor
   */
  async searchWithPagination(searchTerm: string): Promise<PaginatedResult[]> {
    const allResults: PaginatedResult[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;
    let pageCount = 0;

    logger.info(`Starting paginated search for: "${searchTerm}"`);

    while (hasMore && pageCount < CONFIG.maxPages) {
      // Update progress
      this.updateProgress({
        stage: pageCount === 0 ? 'searching' : 'paginating',
        message: cursor 
          ? `Fetching page ${pageCount + 1} using cursor...`
          : `Searching for "${searchTerm}"...`,
        progress: Math.min(50, pageCount * 2),
        currentPage: pageCount + 1,
        totalResults: allResults.length,
        hasMore,
      });

      try {
        // Fetch page
        const response = await this.fetchPage(searchTerm, cursor);
        this.apiCalls++;
        pageCount++;

        // Track cursor
        if (cursor) {
          this.cursorsUsed.push(cursor);
        }

        // Process results
        if (response.results) {
          for (const [table, records] of Object.entries(response.results)) {
            if (Array.isArray(records)) {
              for (const record of records) {
                allResults.push({
                  table,
                  record: record as Record<string, unknown>,
                  pageNumber: pageCount,
                  cursor: cursor || null,
                });
              }
            }
          }
        }

        // Check for more data
        hasMore = response.has_more || false;
        cursor = response.next_cursor || undefined;

        logger.debug(`Page ${pageCount} fetched`, {
          resultsOnPage: Object.values(response.results || {}).flat().length,
          totalResults: allResults.length,
          hasMore,
          nextCursor: cursor ? 'present' : 'none',
        });

        // Safety limits
        if (allResults.length >= CONFIG.maxResults) {
          logger.warn(`Max results limit reached: ${CONFIG.maxResults}`);
          this.earlyStopped = true;
          break;
        }

        // If hasMore but no cursor, something is wrong
        if (hasMore && !cursor) {
          logger.warn('has_more is true but no cursor provided, stopping');
          break;
        }

      } catch (error) {
        logger.error(`Error fetching page ${pageCount + 1}`, error);
        // Continue with what we have
        break;
      }
    }

    logger.info(`Paginated search complete`, {
      pages: pageCount,
      totalResults: allResults.length,
      cursorsUsed: this.cursorsUsed.length,
      earlyStopped: this.earlyStopped,
    });

    return allResults;
  }

  /**
   * Fetch a single page from the API
   */
  private async fetchPage(
    query: string,
    cursor?: string
  ): Promise<{
    results: Record<string, unknown[]>;
    has_more: boolean;
    next_cursor: string | null;
  }> {
    const url = new URL('/api/search', this.apiBaseUrl || 'http://localhost:8080');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(CONFIG.pageSize));
    
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    // Retry logic
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= CONFIG.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          CONFIG.paginationTimeout
        );

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;

      } catch (error) {
        lastError = error as Error;
        logger.warn(`Fetch attempt ${attempt} failed`, { error: lastError.message });
        
        if (attempt < CONFIG.retryAttempts) {
          await new Promise(resolve => 
            setTimeout(resolve, CONFIG.retryDelay * attempt)
          );
        }
      }
    }

    throw lastError || new Error('Failed to fetch page');
  }

  // =========================================================================
  // STAGE 3: FILTER RESULTS
  // =========================================================================

  /**
   * Filter results based on secondary criteria
   */
  filterResults(
    results: PaginatedResult[],
    filters: SearchCriterion[]
  ): FilteredResult[] {
    if (filters.length === 0) {
      // No filters - return all results with minimal processing
      return results.map((r, i) => ({
        id: `${r.table}:${i}`,
        table: r.table,
        record: r.record,
        matchedFilters: [],
        matchScore: 1,
        highlights: {},
      }));
    }

    logger.info(`Filtering ${results.length} results with ${filters.length} criteria`);

    const filtered: FilteredResult[] = [];

    for (const result of results) {
      const matchedFilters: string[] = [];
      let matchScore = 0;
      const highlights: Record<string, string> = {};

      for (const filter of filters) {
        const matchResult = this.recordMatchesFilter(result.record, filter);
        
        if (matchResult.matched) {
          matchedFilters.push(filter.description);
          matchScore += matchResult.score;
          
          // Store highlights
          for (const [field, highlight] of Object.entries(matchResult.highlights)) {
            highlights[field] = highlight;
          }
        }
      }

      // Include if any filter matched
      if (matchedFilters.length > 0) {
        // Normalize score
        matchScore = matchScore / filters.length;

        if (matchScore >= CONFIG.minMatchScore) {
          filtered.push({
            id: `${result.table}:${filtered.length}`,
            table: result.table,
            record: result.record,
            matchedFilters,
            matchScore,
            highlights,
          });
        }
      }
    }

    // Sort by match score
    filtered.sort((a, b) => b.matchScore - a.matchScore);

    logger.info(`Filtered to ${filtered.length} results`);

    return filtered;
  }

  /**
   * Check if a record matches a filter
   */
  private recordMatchesFilter(
    record: Record<string, unknown>,
    filter: SearchCriterion
  ): { matched: boolean; score: number; highlights: Record<string, string> } {
    const filterValue = filter.normalizedValue;
    const highlights: Record<string, string> = {};
    let bestScore = 0;

    for (const [field, value] of Object.entries(record)) {
      if (value === null || value === undefined) continue;

      const strValue = String(value).toLowerCase();
      const originalValue = String(value);

      // Exact match
      if (strValue === filterValue) {
        highlights[field] = `**${originalValue}**`;
        bestScore = Math.max(bestScore, 1.0);
      }
      // Contains match
      else if (strValue.includes(filterValue)) {
        const highlighted = originalValue.replace(
          new RegExp(`(${filter.value})`, 'gi'),
          '**$1**'
        );
        highlights[field] = highlighted;
        bestScore = Math.max(bestScore, 0.8);
      }
      // Partial match (for names)
      else if (filter.category === 'name') {
        const nameParts = filterValue.split(/\s+/);
        const matchedParts = nameParts.filter(part => 
          part.length > 2 && strValue.includes(part)
        );
        if (matchedParts.length > 0) {
          const score = matchedParts.length / nameParts.length;
          if (score > 0.5) {
            let highlighted = originalValue;
            for (const part of matchedParts) {
              highlighted = highlighted.replace(
                new RegExp(`(${part})`, 'gi'),
                '**$1**'
              );
            }
            highlights[field] = highlighted;
            bestScore = Math.max(bestScore, score * 0.7);
          }
        }
      }
      // Fuzzy match for locations
      else if (filter.category === 'location') {
        if (strValue.includes(filterValue) || filterValue.includes(strValue)) {
          highlights[field] = `**${originalValue}**`;
          bestScore = Math.max(bestScore, 0.6);
        }
      }
    }

    return {
      matched: bestScore >= CONFIG.minMatchScore,
      score: bestScore,
      highlights,
    };
  }

  // =========================================================================
  // STAGE 4: BUILD CORRELATION GRAPH
  // =========================================================================

  /**
   * Build correlation graph from results
   */
  buildCorrelationGraph(results: FilteredResult[]): CorrelationGraph {
    const nodeMap = new Map<string, CorrelationNode>();
    const edges: CorrelationEdge[] = [];

    // Field categories for entity extraction
    const fieldCategories: Record<string, CorrelationNode['type']> = {
      // Person names
      name: 'person', full_name: 'person', person_name: 'person',
      customer_name: 'person', suspect_name: 'person',
      // Phones
      phone: 'phone', mobile: 'phone', phone_number: 'phone', contact: 'phone',
      // Emails
      email: 'email', email_id: 'email', email_address: 'email',
      // Locations
      city: 'location', state: 'location', address: 'location', location: 'location',
      // Companies
      company: 'company', company_name: 'company', firm_name: 'company',
      // Accounts
      account: 'account', account_number: 'account', acc_no: 'account',
    };

    // Extract entities from each result
    for (const result of results) {
      const recordNodes: string[] = [];

      for (const [field, value] of Object.entries(result.record)) {
        if (value === null || value === undefined || value === '') continue;

        const fieldType = fieldCategories[field.toLowerCase()] || 'other';
        const normalizedValue = String(value).toLowerCase().trim();

        if (normalizedValue.length < 2) continue;

        // Create node
        const nodeId = `${fieldType}:${normalizedValue}`;
        
        if (!nodeMap.has(nodeId)) {
          nodeMap.set(nodeId, {
            id: nodeId,
            type: fieldType,
            value: String(value),
            count: 0,
            connections: [],
          });
        }

        const node = nodeMap.get(nodeId)!;
        node.count++;
        recordNodes.push(nodeId);
      }

      // Create edges between entities in the same record
      for (let i = 0; i < recordNodes.length; i++) {
        for (let j = i + 1; j < recordNodes.length; j++) {
          const source = recordNodes[i];
          const target = recordNodes[j];

          // Update node connections
          if (!nodeMap.get(source)!.connections.includes(target)) {
            nodeMap.get(source)!.connections.push(target);
          }
          if (!nodeMap.get(target)!.connections.includes(source)) {
            nodeMap.get(target)!.connections.push(source);
          }

          // Create or update edge
          const existingEdge = edges.find(
            e => (e.source === source && e.target === target) ||
                 (e.source === target && e.target === source)
          );

          if (existingEdge) {
            existingEdge.weight++;
          } else {
            edges.push({
              source,
              target,
              weight: 1,
              type: 'co-occurrence',
            });
          }
        }
      }
    }

    // Create clusters
    const clusters = this.identifyClusters(nodeMap, edges);

    // Sort nodes by count
    const nodes = Array.from(nodeMap.values())
      .sort((a, b) => b.count - a.count);

    // Sort edges by weight
    edges.sort((a, b) => b.weight - a.weight);

    return { nodes, edges, clusters };
  }

  /**
   * Identify clusters in the graph
   */
  private identifyClusters(
    nodeMap: Map<string, CorrelationNode>,
    edges: CorrelationEdge[]
  ): CorrelationGraph['clusters'] {
    const clusters: CorrelationGraph['clusters'] = [];
    const visited = new Set<string>();

    // Simple clustering based on strong connections
    for (const node of nodeMap.values()) {
      if (visited.has(node.id)) continue;

      // Find connected nodes with strong edges
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
        // Generate label
        const clusterNode = nodeMap.get(node.id)!;
        const label = `${clusterNode.type}: ${clusterNode.value}`;

        clusters.push({
          id: `cluster_${clusters.length}`,
          nodes: clusterNodes,
          label,
        });
      }
    }

    return clusters;
  }

  // =========================================================================
  // STAGE 5: GENERATE INSIGHTS
  // =========================================================================

  /**
   * Generate insights from results
   */
  async generateInsights(
    query: ParsedQuery,
    filteredResults: FilteredResult[],
    correlationGraph: CorrelationGraph
  ): Promise<RobustSearchResponse['insights']> {
    // Top matches
    const topMatches = filteredResults.slice(0, 10);

    // Entity connections
    const entityConnections = correlationGraph.nodes
      .slice(0, 20)
      .map(node => ({
        entity: node.value,
        type: node.type,
        appearances: node.count,
        tables: [...new Set(
          filteredResults
            .filter(r => {
              for (const [field, value] of Object.entries(r.record)) {
                if (String(value).toLowerCase().includes(node.value.toLowerCase())) {
                  return true;
                }
              }
              return false;
            })
            .map(r => r.table)
        )],
      }));

    // Patterns
    const patterns = this.identifyPatterns(filteredResults, correlationGraph);

    // Recommendations
    const recommendations = this.generateRecommendations(
      query,
      filteredResults,
      correlationGraph
    );

    // Summary
    let summary = '';
    if (filteredResults.length === 0) {
      summary = `No results found matching the search criteria.`;
    } else if (filteredResults.length === 1) {
      summary = `Found 1 exact match for your search. This result matches all the specified criteria.`;
    } else {
      const exactMatches = filteredResults.filter(r => r.matchScore >= 0.9);
      summary = `Found ${filteredResults.length} results. `;
      if (exactMatches.length > 0) {
        summary += `${exactMatches.length} results are high-confidence matches. `;
      }
      summary += `Discovered ${correlationGraph.nodes.length} entities with ${correlationGraph.edges.length} connections.`;
    }

    return {
      summary,
      topMatches,
      entityConnections,
      patterns,
      recommendations,
    };
  }

  /**
   * Identify patterns in results
   */
  private identifyPatterns(
    results: FilteredResult[],
    graph: CorrelationGraph
  ): string[] {
    const patterns: string[] = [];

    // High-frequency entities
    const topEntities = graph.nodes.slice(0, 5);
    for (const entity of topEntities) {
      if (entity.count >= 3) {
        patterns.push(
          `"${entity.value}" appears ${entity.count} times across records`
        );
      }
    }

    // Strong connections
    const strongEdges = graph.edges.filter(e => e.weight >= 3);
    for (const edge of strongEdges.slice(0, 5)) {
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      const targetNode = graph.nodes.find(n => n.id === edge.target);
      if (sourceNode && targetNode) {
        patterns.push(
          `Strong connection between "${sourceNode.value}" and "${targetNode.value}" (${edge.weight} co-occurrences)`
        );
      }
    }

    // Table distribution
    const tableCounts: Record<string, number> = {};
    for (const result of results) {
      tableCounts[result.table] = (tableCounts[result.table] || 0) + 1;
    }

    const tableNames = Object.keys(tableCounts);
    if (tableNames.length > 1) {
      patterns.push(
        `Results spread across ${tableNames.length} tables: ${tableNames.join(', ')}`
      );
    }

    return patterns;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    query: ParsedQuery,
    results: FilteredResult[],
    graph: CorrelationGraph
  ): string[] {
    const recommendations: string[] = [];

    // Based on results
    if (results.length === 0) {
      recommendations.push('Try broadening your search criteria');
      recommendations.push('Check for typos in phone numbers or names');
    } else if (results.length > 100) {
      recommendations.push('Many results found - consider adding more specific filters');
    }

    // Based on entity connections
    const strongConnections = graph.edges.filter(e => e.weight >= 3);
    if (strongConnections.length > 0) {
      recommendations.push(
        'Investigate strong entity connections for potential leads'
      );
    }

    // Based on clusters
    if (graph.clusters.length > 0) {
      recommendations.push(
        `Found ${graph.clusters.length} entity clusters worth investigating`
      );
    }

    return recommendations;
  }

  // =========================================================================
  // MAIN ENTRY POINT
  // =========================================================================

  /**
   * Execute the complete robust search workflow
   */
  async search(query: string): Promise<RobustSearchResponse> {
    const startTime = Date.now();
    this.cursorsUsed = [];
    this.apiCalls = 0;
    this.earlyStopped = false;

    logger.info(`Starting robust agent search for: "${query}"`);

    // Stage 1: Parse Query
    this.updateProgress({
      stage: 'parsing',
      message: 'Analyzing query and extracting search criteria...',
      progress: 5,
      currentPage: 0,
      totalResults: 0,
      hasMore: true,
    });

    const parsedQuery = await this.parseQuery(query);

    // Determine primary search term
    const primarySearchTerm = parsedQuery.primaryCriteria.length > 0
      ? parsedQuery.primaryCriteria[0].normalizedValue
      : query;

    logger.info('Search term determined', { primarySearchTerm });

    // Stage 2: Paginated Search
    this.updateProgress({
      stage: 'searching',
      message: `Searching for "${primarySearchTerm}"...`,
      progress: 10,
      currentPage: 0,
      totalResults: 0,
      hasMore: true,
    });

    const allResults = await this.searchWithPagination(primarySearchTerm);

    // Stage 3: Filter Results
    this.updateProgress({
      stage: 'filtering',
      message: `Filtering ${allResults.length} results...`,
      progress: 60,
      currentPage: 0,
      totalResults: allResults.length,
      hasMore: false,
    });

    const filteredResults = this.filterResults(
      allResults,
      parsedQuery.secondaryCriteria
    );

    // Stage 4: Build Correlation Graph
    this.updateProgress({
      stage: 'analyzing',
      message: 'Building correlation graph and analyzing patterns...',
      progress: 80,
      currentPage: 0,
      totalResults: filteredResults.length,
      hasMore: false,
    });

    const correlationGraph = this.buildCorrelationGraph(filteredResults);

    // Stage 5: Generate Insights
    const insights = await this.generateInsights(
      parsedQuery,
      filteredResults,
      correlationGraph
    );

    // Complete
    this.updateProgress({
      stage: 'complete',
      message: 'Search complete!',
      progress: 100,
      currentPage: 0,
      totalResults: filteredResults.length,
      hasMore: false,
    });

    const duration = Date.now() - startTime;

    logger.info('Robust search complete', {
      duration,
      apiCalls: this.apiCalls,
      totalFetched: allResults.length,
      totalFiltered: filteredResults.length,
      cursorsUsed: this.cursorsUsed.length,
      correlationNodes: correlationGraph.nodes.length,
      correlationEdges: correlationGraph.edges.length,
    });

    return {
      success: true,
      query: parsedQuery,
      allFetchedResults: allResults,
      totalFetched: allResults.length,
      totalPages: this.apiCalls,
      filteredResults,
      totalFiltered: filteredResults.length,
      correlationGraph,
      insights,
      metadata: {
        duration,
        apiCalls: this.apiCalls,
        cursorsUsed: this.cursorsUsed,
        primarySearchTerm,
        filtersApplied: parsedQuery.secondaryCriteria.map(c => c.description),
        hasMoreData: this.cursorsUsed.length > 0,
        earlyStopped: this.earlyStopped,
      },
    };
  }
}

export default RobustAgentSearchEngine;
