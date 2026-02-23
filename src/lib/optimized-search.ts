/**
 * Optimized AI Agent Search Engine
 * 
 * Key Optimizations Implemented:
 * 1. Parallel Processing - Concurrent search execution with Promise pooling
 * 2. Intelligent Caching - LRU cache with semantic-aware TTL
 * 3. Query Prioritization - Search high-selectivity criteria first
 * 4. Early Termination - Stop when exact matches found
 * 5. Reduced Variations - Minimal search term generation
 * 6. Streaming Cross-Reference - Incremental result matching
 */

import { createLogger } from './logger';
import { getUnifiedAI, shouldUseLocalAI, type ChatMessage } from './local-ai-client';

const logger = createLogger('OptimizedSearch');

// ============================================================================
// TYPES
// ============================================================================

export interface SearchCriterion {
  id: string;
  type: 'name' | 'location' | 'phone' | 'email' | 'company' | 'id_number' | 'account' | 'keyword' | 'date' | 'amount';
  value: string;
  normalizedValue: string;
  searchTerms: string[];
  description: string;
  importance: number;
  priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'; // P1=Critical, P5=Skip
  selectivity: number; // 0-1, higher = more selective
}

export interface QueryAnalysis {
  originalQuery: string;
  intent: string;
  criteria: SearchCriterion[];
  searchStrategy: 'intersection' | 'union' | 'fuzzy';
  instructions: string;
}

export interface SearchResultMatch {
  criterionId: string;
  criterionType: SearchCriterion['type'];
  matchedValue: string;
  matchedField?: string;
}

export interface StoredResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  matchedCriteria: SearchResultMatch[];
  matchCount: number;
  relevanceScore: number;
}

export interface CrossReferencedResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  matchedCriteria: SearchResultMatch[];
  matchCount: number;
  matchScore: number;
  matchDetails: string[];
  isExactMatch: boolean;
}

export interface SearchAnalysis {
  summary: string;
  exactMatches: number;
  partialMatches: number;
  criteriaBreakdown: {
    criterion: string;
    type: string;
    matchesFound: number;
  }[];
  topMatches: CrossReferencedResult[];
  connections: EntityConnection[];
  recommendations: string[];
  redFlags: string[];
}

export interface EntityConnection {
  identifier: string;
  type: 'person' | 'company' | 'location' | 'phone' | 'email' | 'other';
  appearances: Array<{
    table: string;
    recordId: string;
    field?: string;
  }>;
  connectionStrength: number;
}

export interface OptimizedSearchResponse {
  success: boolean;
  analysis: QueryAnalysis;
  results: CrossReferencedResult[];
  allResults: StoredResult[];
  insights: SearchAnalysis;
  metadata: {
    criteriaCount: number;
    totalSearched: number;
    exactMatches: number;
    partialMatches: number;
    pagesFetched: number;
    duration: number;
    aiMode: 'cloud' | 'local' | 'fallback';
    cacheHits: number;
    cacheMisses: number;
    earlyTermination: boolean;
    searchesSkipped: number;
  };
}

export interface ProgressUpdate {
  stage: 'analyzing' | 'searching' | 'cross_referencing' | 'analyzing_results' | 'complete';
  message: string;
  progress: number;
  criteriaProcessed: number;
  totalCriteria: number;
  resultsFound: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Concurrency settings
  maxConcurrentSearches: 5,
  
  // Pagination limits by priority
  maxPagesByPriority: {
    P1: 10,  // Critical - full pagination
    P2: 8,   // High - most pages
    P3: 5,   // Medium - limited
    P4: 2,   // Low - minimal
    P5: 0,   // Skip - no search
  },
  
  pageSize: 100,
  queryTimeout: 30000,
  maxTotalResults: 5000,
  
  // Early termination threshold
  earlyTerminationThreshold: 3, // Stop if 3+ exact matches found
  
  // Cache settings
  cacheMaxSize: 2000,
  cacheTTLByType: {
    phone: 30 * 60 * 1000,      // 30 minutes
    email: 30 * 60 * 1000,      // 30 minutes
    id_number: 60 * 60 * 1000,  // 1 hour
    account: 45 * 60 * 1000,    // 45 minutes
    name: 15 * 60 * 1000,       // 15 minutes
    company: 15 * 60 * 1000,    // 15 minutes
    location: 5 * 60 * 1000,    // 5 minutes
    date: 10 * 60 * 1000,       // 10 minutes
    amount: 10 * 60 * 1000,     // 10 minutes
    keyword: 5 * 60 * 1000,     // 5 minutes
  },
  
  // Scoring weights (higher = more important)
  scoreWeights: {
    name: 10,
    phone: 9,
    email: 9,
    id_number: 9,
    account: 8,
    company: 7,
    location: 6,
    date: 5,
    amount: 5,
    keyword: 3,
  },
  
  // Priority mapping
  priorityMapping: {
    phone: 'P1',
    email: 'P1',
    id_number: 'P1',
    account: 'P2',
    name: 'P3',
    company: 'P3',
    date: 'P4',
    amount: 'P4',
    location: 'P5', // Skip common locations
    keyword: 'P4',
  },
  
  // Selectivity estimates (higher = fewer results expected)
  selectivityByType: {
    phone: 0.95,
    email: 0.95,
    id_number: 0.98,
    account: 0.90,
    name: 0.60,
    company: 0.55,
    date: 0.40,
    amount: 0.35,
    location: 0.10, // Very low - many matches
    keyword: 0.30,
  },
  
  // Common locations to skip
  commonLocations: new Set([
    'delhi', 'mumbai', 'bangalore', 'chennai', 'kolkata', 'hyderabad',
    'pune', 'ahmedabad', 'jaipur', 'lucknow', 'india', 'maharashtra',
    'karnataka', 'tamil nadu', 'uttar pradesh', 'gujarat', 'rajasthan'
  ]),
};

// ============================================================================
// LRU CACHE IMPLEMENTATION
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
}

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access count and move to end (most recently used)
    entry.accessCount++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  set(key: string, data: T, ttl: number): void {
    // Remove if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// OPTIMIZED SEARCH ENGINE
// ============================================================================

export class OptimizedSearchEngine {
  private progressCallback?: (progress: ProgressUpdate) => void;
  private apiBaseUrl: string;
  private bearerToken?: string;
  private aiMode: 'cloud' | 'local' | 'fallback' = 'cloud';
  private storedResults: Map<string, StoredResult> = new Map();
  private pagesFetched = 0;
  
  // Cache
  private searchCache: LRUCache<Array<{ table: string; record: Record<string, unknown> }>>;
  private cacheHits = 0;
  private cacheMisses = 0;
  
  // Early termination
  private earlyTermination = false;
  private searchesSkipped = 0;

  constructor(options?: {
    progressCallback?: (progress: ProgressUpdate) => void;
    apiBaseUrl?: string;
    bearerToken?: string;
  }) {
    this.progressCallback = options?.progressCallback;
    this.apiBaseUrl = options?.apiBaseUrl || '';
    this.bearerToken = options?.bearerToken;
    this.searchCache = new LRUCache(CONFIG.cacheMaxSize);

    if (shouldUseLocalAI()) {
      this.aiMode = 'local';
    }
  }

  private updateProgress(progress: ProgressUpdate) {
    logger.debug(`Progress: ${progress.stage} - ${progress.message}`);
    this.progressCallback?.(progress);
  }

  // =========================================================================
  // STAGE 1: QUERY ANALYSIS (OPTIMIZED)
  // =========================================================================

  /**
   * Analyze user query and extract search criteria with priority assignment
   */
  private async analyzeQuery(query: string): Promise<QueryAnalysis> {
    logger.info('Analyzing query', { query });

    const criteria = this.extractCriteriaWithPriority(query);
    
    // Sort by priority (P1 first, then P2, etc.)
    criteria.sort((a, b) => {
      const priorityOrder = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Generate instructions for local AI
    const instructions = this.generateAIInstructions(query, criteria);

    // Try AI-powered analysis for better extraction
    if (this.aiMode !== 'fallback') {
      try {
        const aiCriteria = await this.aiExtractCriteria(query);
        if (aiCriteria.length > criteria.length) {
          logger.info('AI extracted more criteria', {
            fallback: criteria.length,
            ai: aiCriteria.length
          });
          // Sort AI criteria by priority too
          aiCriteria.sort((a, b) => {
            const priorityOrder = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          });
          return {
            originalQuery: query,
            intent: this.determineIntent(query, aiCriteria),
            criteria: aiCriteria,
            searchStrategy: this.determineStrategy(aiCriteria),
            instructions,
          };
        }
      } catch (error) {
        logger.warn('AI criteria extraction failed, using rule-based', error);
      }
    }

    return {
      originalQuery: query,
      intent: this.determineIntent(query, criteria),
      criteria,
      searchStrategy: this.determineStrategy(criteria),
      instructions,
    };
  }

  /**
   * Extract criteria with priority assignment
   */
  private extractCriteriaWithPriority(query: string): SearchCriterion[] {
    const criteria: SearchCriterion[] = [];
    let idCounter = 0;

    // Phone numbers - P1 (Highest Priority)
    const phonePattern = /(?:\+91[-\s]?|0)?[6-9]\d{9}\b/g;
    const phones = query.match(phonePattern) || [];
    for (const phone of phones) {
      const normalized = phone.replace(/\D/g, '').slice(-10);
      criteria.push({
        id: `phone_${++idCounter}`,
        type: 'phone',
        value: phone,
        normalizedValue: normalized,
        searchTerms: [normalized], // Only one variation - the normalized form
        description: `Phone: ${phone}`,
        importance: CONFIG.scoreWeights.phone,
        priority: 'P1',
        selectivity: CONFIG.selectivityByType.phone,
      });
    }

    // Email addresses - P1
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    const emails = query.match(emailPattern) || [];
    for (const email of emails) {
      criteria.push({
        id: `email_${++idCounter}`,
        type: 'email',
        value: email,
        normalizedValue: email.toLowerCase(),
        searchTerms: [email.toLowerCase()], // Only lowercase variation
        description: `Email: ${email}`,
        importance: CONFIG.scoreWeights.email,
        priority: 'P1',
        selectivity: CONFIG.selectivityByType.email,
      });
    }

    // PAN numbers - P1
    const panPattern = /[A-Z]{5}\d{4}[A-Z]\b/gi;
    const pans = query.match(panPattern) || [];
    for (const pan of pans) {
      criteria.push({
        id: `pan_${++idCounter}`,
        type: 'id_number',
        value: pan.toUpperCase(),
        normalizedValue: pan.toUpperCase(),
        searchTerms: [pan.toUpperCase()],
        description: `PAN: ${pan.toUpperCase()}`,
        importance: CONFIG.scoreWeights.id_number,
        priority: 'P1',
        selectivity: CONFIG.selectivityByType.id_number,
      });
    }

    // Account numbers - P2
    const accountPattern = /(?:account|a\/c|acct)[\s:-]*([A-Z0-9]{6,20})/gi;
    let accountMatch;
    while ((accountMatch = accountPattern.exec(query)) !== null) {
      criteria.push({
        id: `account_${++idCounter}`,
        type: 'account',
        value: accountMatch[1],
        normalizedValue: accountMatch[1].toUpperCase(),
        searchTerms: [accountMatch[1]],
        description: `Account: ${accountMatch[1]}`,
        importance: CONFIG.scoreWeights.account,
        priority: 'P2',
        selectivity: CONFIG.selectivityByType.account,
      });
    }

    // Names - P3 (Reduced variations)
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    const names = query.match(namePattern) || [];
    const locationWords = new Set([...CONFIG.commonLocations]);
    for (const name of names) {
      const nameLower = name.toLowerCase();
      if (!locationWords.has(nameLower)) {
        criteria.push({
          id: `name_${++idCounter}`,
          type: 'name',
          value: name,
          normalizedValue: nameLower,
          searchTerms: [name], // Only the full name, not variations
          description: `Name: ${name}`,
          importance: CONFIG.scoreWeights.name,
          priority: 'P3',
          selectivity: CONFIG.selectivityByType.name,
        });
      }
    }

    // Locations - P5 (Skip common locations, P4 for specific)
    const locationPattern = /(?:from|in|at|near|of|city\s+|state\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
    let locationMatch;
    while ((locationMatch = locationPattern.exec(query)) !== null) {
      const location = locationMatch[1];
      const locationLower = location.toLowerCase();
      
      // Skip if it's a common location
      const isCommon = CONFIG.commonLocations.has(locationLower);
      
      criteria.push({
        id: `location_${++idCounter}`,
        type: 'location',
        value: location,
        normalizedValue: locationLower,
        searchTerms: [location],
        description: `Location: ${location}${isCommon ? ' (common - will skip)' : ''}`,
        importance: CONFIG.scoreWeights.location,
        priority: isCommon ? 'P5' : 'P4',
        selectivity: isCommon ? 0.05 : CONFIG.selectivityByType.location,
      });
    }

    // Companies - P3
    const companyPattern = /(?:company|firm|organization|org|business)[\s:]+([A-Za-z][A-Za-z0-9\s]{2,30})/gi;
    let companyMatch;
    while ((companyMatch = companyPattern.exec(query)) !== null) {
      const company = companyMatch[1].trim();
      criteria.push({
        id: `company_${++idCounter}`,
        type: 'company',
        value: company,
        normalizedValue: company.toLowerCase(),
        searchTerms: [company],
        description: `Company: ${company}`,
        importance: CONFIG.scoreWeights.company,
        priority: 'P3',
        selectivity: CONFIG.selectivityByType.company,
      });
    }

    // If no criteria found, use the whole query as keyword
    if (criteria.length === 0) {
      criteria.push({
        id: `keyword_1`,
        type: 'keyword',
        value: query,
        normalizedValue: query.toLowerCase(),
        searchTerms: [query],
        description: `Search: ${query}`,
        importance: CONFIG.scoreWeights.keyword,
        priority: 'P4',
        selectivity: CONFIG.selectivityByType.keyword,
      });
    }

    logger.info(`Extracted ${criteria.length} criteria with priorities`, 
      criteria.map(c => ({ desc: c.description, priority: c.priority }))
    );
    return criteria;
  }

  /**
   * AI-powered criteria extraction with priority
   */
  private async aiExtractCriteria(query: string): Promise<SearchCriterion[]> {
    const prompt = `You are an AI search assistant for investigators. Extract ALL searchable criteria from this query.

QUERY: "${query}"

Extract and categorize each piece of information. Respond in JSON format:
{
  "criteria": [
    {
      "type": "name|phone|email|location|company|id_number|account|date|amount|keyword",
      "value": "original value from query",
      "searchTerms": ["term1"],
      "description": "what this is",
      "importance": 1-10,
      "isCommonLocation": true/false
    }
  ]
}

Rules:
- Extract EVERY distinct piece of information
- For searchTerms, provide only the most effective search term (not variations)
- Mark isCommonLocation: true for cities like Delhi, Mumbai, Bangalore, Chennai, etc.
- Importance: phone/email/ID=9, name=10, location=6, keyword=3`;

    const content = await this.callAI(prompt, 'Extract search criteria. Respond only with valid JSON.');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        let idCounter = 0;
        return (parsed.criteria || []).map((c: any) => {
          const type = c.type || 'keyword';
          const isCommonLocation = c.isCommonLocation || false;
          
          return {
            id: `${type}_${++idCounter}`,
            type,
            value: c.value || '',
            normalizedValue: (c.value || '').toLowerCase(),
            searchTerms: c.searchTerms || [c.value],
            description: c.description || c.value,
            importance: c.importance || 5,
            priority: this.assignPriority(type, isCommonLocation),
            selectivity: CONFIG.selectivityByType[type as keyof typeof CONFIG.selectivityByType] || 0.3,
          };
        });
      } catch (e) {
        logger.warn('Failed to parse AI criteria response', e);
      }
    }
    
    throw new Error('AI extraction failed');
  }

  /**
   * Assign priority based on type
   */
  private assignPriority(type: string, isCommonLocation: boolean): SearchCriterion['priority'] {
    if (type === 'location' && isCommonLocation) return 'P5';
    return CONFIG.priorityMapping[type as keyof typeof CONFIG.priorityMapping] || 'P4';
  }

  /**
   * Generate instructions for local AI model
   */
  private generateAIInstructions(query: string, criteria: SearchCriterion[]): string {
    return `INVESTIGATION SEARCH CONTEXT:
You are analyzing search results for an investigation query.

ORIGINAL QUERY: "${query}"

EXTRACTED CRITERIA (sorted by priority):
${criteria.map(c => `- [${c.priority}] ${c.type.toUpperCase()}: ${c.value} (selectivity: ${Math.round(c.selectivity * 100)}%)`).join('\n')}

YOUR TASK:
1. Review the search results data
2. Identify records that match MULTIPLE criteria (these are most relevant)
3. Find connections between entities
4. Highlight any suspicious patterns or red flags
5. Provide clear, actionable insights

FOCUS ON:
- Exact matches: Records matching ALL criteria
- Partial matches: Records matching SOME criteria
- Connections: Entities appearing across multiple records
- Red flags: Unusual patterns or discrepancies`;
  }

  /**
   * Determine search intent
   */
  private determineIntent(query: string, criteria: SearchCriterion[]): string {
    const types = new Set(criteria.map(c => c.type));
    
    if (types.has('phone') || types.has('email')) {
      return 'Find specific person by contact information';
    }
    if (types.has('id_number') || types.has('account')) {
      return 'Find records by identification number';
    }
    if (types.has('name') && types.has('location')) {
      return 'Find person by name and location';
    }
    if (types.has('name') && types.has('company')) {
      return 'Find person associated with company';
    }
    if (types.has('amount')) {
      return 'Find transactions or records by amount';
    }
    return 'General search';
  }

  /**
   * Determine search strategy
   */
  private determineStrategy(criteria: SearchCriterion[]): 'intersection' | 'union' | 'fuzzy' {
    // Skip P5 criteria when determining strategy
    const activeCriteria = criteria.filter(c => c.priority !== 'P5');
    
    if (activeCriteria.length >= 3) return 'intersection';
    if (activeCriteria.length >= 2) return 'intersection';
    return 'union';
  }

  // =========================================================================
  // STAGE 2: PARALLEL SEARCH WITH PRIORITY
  // =========================================================================

  /**
   * Execute searches in parallel with concurrency control
   */
  private async executeParallelSearches(criteria: SearchCriterion[]): Promise<void> {
    // Filter out P5 (skip) criteria
    const searchableCriteria = criteria.filter(c => c.priority !== 'P5');
    this.searchesSkipped = criteria.length - searchableCriteria.length;

    if (searchableCriteria.length === 0) {
      logger.warn('All criteria were marked for skipping');
      return;
    }

    // Create search tasks with priority
    const searchTasks = searchableCriteria.map(criterion => ({
      criterion,
      priority: criterion.priority,
    }));

    // Execute in batches with concurrency control
    const batchSize = CONFIG.maxConcurrentSearches;
    
    for (let i = 0; i < searchTasks.length; i += batchSize) {
      // Check for early termination
      if (this.shouldTerminateEarly()) {
        logger.info('Early termination triggered - sufficient exact matches found');
        this.earlyTermination = true;
        
        // Mark remaining criteria as skipped
        const remaining = searchTasks.length - i;
        this.searchesSkipped += remaining;
        break;
      }

      const batch = searchTasks.slice(i, i + batchSize);
      
      // Execute batch in parallel
      await Promise.all(
        batch.map(({ criterion }) => this.searchForCriterion(criterion))
      );

      // Update progress
      const processed = Math.min(i + batchSize, searchTasks.length);
      this.updateProgress({
        stage: 'searching',
        message: `Searched ${processed}/${searchableCriteria.length} criteria`,
        progress: 10 + (processed / searchableCriteria.length) * 40,
        criteriaProcessed: processed,
        totalCriteria: searchableCriteria.length,
        resultsFound: this.storedResults.size,
      });
    }
  }

  /**
   * Check if we should terminate early
   */
  private shouldTerminateEarly(): boolean {
    // Count exact matches so far
    let exactMatchCount = 0;
    for (const result of this.storedResults.values()) {
      // A result is an exact match if it matches multiple high-priority criteria
      const highPriorityMatches = result.matchedCriteria.filter(m => {
        const criterion = this.getCriterionById(m.criterionId);
        return criterion && (criterion.priority === 'P1' || criterion.priority === 'P2');
      });
      if (highPriorityMatches.length >= 2) {
        exactMatchCount++;
        if (exactMatchCount >= CONFIG.earlyTerminationThreshold) {
          return true;
        }
      }
    }
    return false;
  }

  private criterionMap: Map<string, SearchCriterion> = new Map();

  private getCriterionById(id: string): SearchCriterion | undefined {
    return this.criterionMap.get(id);
  }

  /**
   * Search for a single criterion with caching
   */
  private async searchForCriterion(criterion: SearchCriterion): Promise<StoredResult[]> {
    const results: StoredResult[] = [];
    this.criterionMap.set(criterion.id, criterion);

    // Store criterion for later reference
    for (const searchTerm of criterion.searchTerms) {
      if (searchTerm.length < 2) continue;

      // Check cache first
      const cacheKey = this.getCacheKey(searchTerm);
      const cachedResults = this.searchCache.get(cacheKey);
      
      if (cachedResults) {
        this.cacheHits++;
        logger.debug(`Cache hit for: ${searchTerm}`);
        
        // Process cached results
        for (const result of cachedResults) {
          this.addResultToStore(result, criterion, searchTerm);
        }
        continue;
      }

      // Cache miss - fetch from API
      this.cacheMisses++;
      
      try {
        const maxPages = CONFIG.maxPagesByPriority[criterion.priority];
        
        if (maxPages === 0) {
          logger.debug(`Skipping search for P5 criterion: ${criterion.description}`);
          continue;
        }

        const pageResults = await this.fetchAllPages(searchTerm, maxPages);
        
        // Cache the results
        const ttl = CONFIG.cacheTTLByType[criterion.type] || 5 * 60 * 1000;
        this.searchCache.set(cacheKey, pageResults, ttl);

        for (const result of pageResults) {
          this.addResultToStore(result, criterion, searchTerm);
        }
      } catch (error) {
        logger.error(`Search failed for criterion: ${criterion.description}`, error);
      }
    }

    return results;
  }

  /**
   * Add result to store with cross-referencing
   */
  private addResultToStore(
    result: { table: string; record: Record<string, unknown> },
    criterion: SearchCriterion,
    searchTerm: string
  ): void {
    const key = `${result.table}:${this.hashRecord(result.record)}`;
    
    if (this.storedResults.has(key)) {
      // Add to existing result's matched criteria
      const existing = this.storedResults.get(key)!;
      const alreadyMatched = existing.matchedCriteria.some(m => m.criterionId === criterion.id);
      if (!alreadyMatched) {
        existing.matchedCriteria.push({
          criterionId: criterion.id,
          criterionType: criterion.type,
          matchedValue: searchTerm,
        });
        existing.matchCount = existing.matchedCriteria.length;
      }
    } else {
      // New result
      const stored: StoredResult = {
        id: key,
        table: result.table,
        record: result.record,
        matchedCriteria: [{
          criterionId: criterion.id,
          criterionType: criterion.type,
          matchedValue: searchTerm,
        }],
        matchCount: 1,
        relevanceScore: criterion.importance,
      };
      this.storedResults.set(key, stored);
    }
  }

  /**
   * Fetch all pages with limit based on priority
   */
  private async fetchAllPages(
    searchTerm: string,
    maxPages: number
  ): Promise<Array<{ table: string; record: Record<string, unknown> }>> {
    const allResults: Array<{ table: string; record: Record<string, unknown> }> = [];
    let cursor: string | undefined;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      try {
        const response = await this.fetchSearchPage(searchTerm, cursor);
        pageCount++;
        this.pagesFetched++;

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
        logger.error(`Page fetch failed for: ${searchTerm}`, error);
        break;
      }
    }

    return allResults;
  }

  /**
   * Fetch a single page from the API
   */
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
  }

  /**
   * Get cache key
   */
  private getCacheKey(searchTerm: string): string {
    return searchTerm.toLowerCase().trim();
  }

  // =========================================================================
  // STAGE 3: CROSS-REFERENCE (OPTIMIZED)
  // =========================================================================

  /**
   * Cross-reference results to find matches
   */
  private crossReferenceResults(criteria: SearchCriterion[]): CrossReferencedResult[] {
    const results: CrossReferencedResult[] = [];

    for (const stored of this.storedResults.values()) {
      // Calculate match score with priority weighting
      let matchScore = 0;
      const matchDetails: string[] = [];

      for (const match of stored.matchedCriteria) {
        const criterion = this.getCriterionById(match.criterionId);
        const priority = criterion?.priority || 'P4';
        
        // Higher weight for higher priority matches
        const priorityMultiplier = { P1: 3, P2: 2.5, P3: 2, P4: 1.5, P5: 1 };
        const weight = (CONFIG.scoreWeights[match.criterionType] || 3) * 
                       (priorityMultiplier[priority] || 1);
        
        matchScore += weight;
        matchDetails.push(`[${priority}] Matched ${match.criterionType}: ${match.matchedValue}`);
      }

      // Bonus for matching multiple criteria
      if (stored.matchCount > 1) {
        matchScore *= (1 + (stored.matchCount * 0.3));
      }

      // Count only non-P5 criteria for exact match determination
      const activeCriteria = criteria.filter(c => c.priority !== 'P5');
      const isExactMatch = stored.matchCount === activeCriteria.length;

      results.push({
        id: stored.id,
        table: stored.table,
        record: stored.record,
        matchedCriteria: stored.matchedCriteria,
        matchCount: stored.matchCount,
        matchScore,
        matchDetails,
        isExactMatch,
      });
    }

    // Sort by match score (highest first), with exact matches at top
    results.sort((a, b) => {
      if (a.isExactMatch && !b.isExactMatch) return -1;
      if (!a.isExactMatch && b.isExactMatch) return 1;
      return b.matchScore - a.matchScore;
    });

    return results;
  }

  // =========================================================================
  // STAGE 4: AI ANALYSIS
  // =========================================================================

  /**
   * Analyze results with AI
   */
  private async analyzeResults(
    queryAnalysis: QueryAnalysis,
    results: CrossReferencedResult[]
  ): Promise<SearchAnalysis> {
    const exactMatches = results.filter(r => r.isExactMatch);
    const partialMatches = results.filter(r => !r.isExactMatch && r.matchCount > 0);

    // Criteria breakdown
    const criteriaBreakdown = queryAnalysis.criteria.map(c => ({
      criterion: c.description,
      type: c.type,
      matchesFound: results.filter(r => r.matchedCriteria.some(m => m.criterionId === c.id)).length,
    }));

    // Extract entities
    const connections = this.extractEntities(results);

    // Build AI analysis prompt
    const topResults = results.slice(0, 15).map(r => ({
      table: r.table,
      matchCount: r.matchCount,
      matchScore: Math.round(r.matchScore),
      matchedCriteria: r.matchDetails,
      record: Object.fromEntries(Object.entries(r.record).slice(0, 8)),
    }));

    const prompt = `${queryAnalysis.instructions}

SEARCH RESULTS SUMMARY:
- Total results: ${results.length}
- Exact matches (all criteria): ${exactMatches.length}
- Partial matches: ${partialMatches.length}

TOP RESULTS:
${JSON.stringify(topResults, null, 2)}

CRITERIA BREAKDOWN:
${criteriaBreakdown.map(c => `- ${c.criterion}: ${c.matchesFound} matches`).join('\n')}

Provide analysis in JSON format:
{
  "summary": "2-3 sentence summary of findings",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "redFlags": ["suspicious pattern 1"],
  "additionalInsights": ["insight about the data"]
}`;

    let aiSummary: {
      summary?: string;
      recommendations?: string[];
      redFlags?: string[];
      additionalInsights?: string[];
    } = {};

    try {
      const content = await this.callAI(prompt, 'Analyze search results. Respond only with valid JSON.');
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiSummary = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('AI analysis failed, using basic summary', error);
      this.aiMode = 'fallback';
    }

    return {
      summary: aiSummary.summary || this.generateBasicSummary(queryAnalysis, results),
      exactMatches: exactMatches.length,
      partialMatches: partialMatches.length,
      criteriaBreakdown,
      topMatches: results.slice(0, 10),
      connections,
      recommendations: aiSummary.recommendations || this.generateRecommendations(results),
      redFlags: aiSummary.redFlags || [],
    };
  }

  /**
   * Generate basic summary without AI
   */
  private generateBasicSummary(analysis: QueryAnalysis, results: CrossReferencedResult[]): string {
    const exactMatches = results.filter(r => r.isExactMatch);
    const activeCriteria = analysis.criteria.filter(c => c.priority !== 'P5');
    
    if (exactMatches.length > 0) {
      return `Found ${exactMatches.length} exact match(es) matching all ${activeCriteria.length} active criteria. These records matched on the most important identifiers (phone/email/ID) and should be prioritized for review.`;
    }
    
    if (results.length > 0) {
      return `Found ${results.length} partial matches. No records matched ALL criteria exactly, but ${results.filter(r => r.matchCount > 1).length} records matched multiple criteria. Review high-scoring results first.`;
    }
    
    return 'No results found matching any of the search criteria. Consider broadening your search or checking for data entry errors.';
  }

  /**
   * Generate recommendations without AI
   */
  private generateRecommendations(results: CrossReferencedResult[]): string[] {
    const recommendations: string[] = [];

    const exactMatches = results.filter(r => r.isExactMatch);
    if (exactMatches.length > 0) {
      recommendations.push(`Review the ${exactMatches.length} exact match(es) - these match all your criteria`);
    }

    const partialMatches = results.filter(r => !r.isExactMatch && r.matchCount > 1);
    if (partialMatches.length > 0) {
      recommendations.push(`Consider the ${partialMatches.length} partial matches that match multiple criteria`);
    }

    if (results.length > 20) {
      recommendations.push('Many results found - consider adding more specific criteria to narrow down');
    }

    return recommendations;
  }

  /**
   * Extract entity connections
   */
  private extractEntities(results: CrossReferencedResult[]): EntityConnection[] {
    const entityMap = new Map<string, EntityConnection>();

    const nameFields = ['name', 'full_name', 'person_name', 'suspect_name', 'customer_name'];
    const phoneFields = ['phone', 'mobile', 'contact', 'phone_number'];
    const emailFields = ['email', 'email_id', 'email_address'];
    const locationFields = ['city', 'state', 'address', 'location'];

    for (const result of results) {
      // Extract from name fields
      for (const field of nameFields) {
        const value = result.record[field];
        if (value && typeof value === 'string' && value.trim().length > 2) {
          const key = value.toLowerCase().trim();
          if (!entityMap.has(key)) {
            entityMap.set(key, {
              identifier: value.trim(),
              type: 'person',
              appearances: [],
              connectionStrength: 0,
            });
          }
          const entity = entityMap.get(key)!;
          entity.appearances.push({ table: result.table, recordId: result.id, field });
          entity.connectionStrength++;
        }
      }

      // Extract from phone fields
      for (const field of phoneFields) {
        const value = result.record[field];
        if (value) {
          const normalized = String(value).replace(/\D/g, '').slice(-10);
          if (normalized.length === 10) {
            if (!entityMap.has(normalized)) {
              entityMap.set(normalized, {
                identifier: String(value),
                type: 'phone',
                appearances: [],
                connectionStrength: 0,
              });
            }
            const entity = entityMap.get(normalized)!;
            entity.appearances.push({ table: result.table, recordId: result.id, field });
            entity.connectionStrength++;
          }
        }
      }

      // Extract from location fields
      for (const field of locationFields) {
        const value = result.record[field];
        if (value && typeof value === 'string' && value.trim().length > 2) {
          const key = value.toLowerCase().trim();
          if (!entityMap.has(key)) {
            entityMap.set(key, {
              identifier: value.trim(),
              type: 'location',
              appearances: [],
              connectionStrength: 0,
            });
          }
          const entity = entityMap.get(key)!;
          entity.appearances.push({ table: result.table, recordId: result.id, field });
          entity.connectionStrength++;
        }
      }
    }

    return Array.from(entityMap.values())
      .filter(e => e.connectionStrength >= 1)
      .sort((a, b) => b.connectionStrength - a.connectionStrength)
      .slice(0, 30);
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

  async search(query: string): Promise<OptimizedSearchResponse> {
    const startTime = Date.now();
    this.storedResults.clear();
    this.criterionMap.clear();
    this.pagesFetched = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.earlyTermination = false;
    this.searchesSkipped = 0;

    logger.info(`Starting optimized search for: "${query}"`);

    // Stage 1: Analyze query
    this.updateProgress({
      stage: 'analyzing',
      message: 'Analyzing query and extracting search criteria...',
      progress: 5,
      criteriaProcessed: 0,
      totalCriteria: 0,
      resultsFound: 0,
    });

    const analysis = await this.analyzeQuery(query);
    logger.info(`Query analysis complete`, {
      criteriaCount: analysis.criteria.length,
      intent: analysis.intent,
      strategy: analysis.searchStrategy,
      skippedCriteria: analysis.criteria.filter(c => c.priority === 'P5').length,
    });

    // Stage 2: Parallel search with priority
    const activeCriteria = analysis.criteria.filter(c => c.priority !== 'P5');
    this.updateProgress({
      stage: 'searching',
      message: `Searching ${activeCriteria.length} prioritized criteria...`,
      progress: 10,
      criteriaProcessed: 0,
      totalCriteria: activeCriteria.length,
      resultsFound: 0,
    });

    await this.executeParallelSearches(analysis.criteria);

    logger.info(`Search complete`, {
      uniqueResults: this.storedResults.size,
      pagesFetched: this.pagesFetched,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      earlyTermination: this.earlyTermination,
    });

    // Stage 3: Cross-reference
    this.updateProgress({
      stage: 'cross_referencing',
      message: 'Cross-referencing results to find matches...',
      progress: 60,
      criteriaProcessed: activeCriteria.length,
      totalCriteria: activeCriteria.length,
      resultsFound: this.storedResults.size,
    });

    const results = this.crossReferenceResults(analysis.criteria);
    const exactMatches = results.filter(r => r.isExactMatch).length;

    logger.info(`Cross-reference complete`, {
      totalResults: results.length,
      exactMatches,
      partialMatches: results.length - exactMatches,
    });

    // Stage 4: AI Analysis
    this.updateProgress({
      stage: 'analyzing_results',
      message: 'Analyzing results and generating insights...',
      progress: 80,
      criteriaProcessed: activeCriteria.length,
      totalCriteria: activeCriteria.length,
      resultsFound: results.length,
    });

    const insights = await this.analyzeResults(analysis, results);

    // Complete
    this.updateProgress({
      stage: 'complete',
      message: 'Search complete!',
      progress: 100,
      criteriaProcessed: activeCriteria.length,
      totalCriteria: activeCriteria.length,
      resultsFound: results.length,
    });

    const duration = Date.now() - startTime;

    return {
      success: true,
      analysis,
      results,
      allResults: Array.from(this.storedResults.values()),
      insights,
      metadata: {
        criteriaCount: analysis.criteria.length,
        totalSearched: this.storedResults.size,
        exactMatches,
        partialMatches: results.length - exactMatches,
        pagesFetched: this.pagesFetched,
        duration,
        aiMode: this.aiMode,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        earlyTermination: this.earlyTermination,
        searchesSkipped: this.searchesSkipped,
      },
    };
  }
}

export default OptimizedSearchEngine;
