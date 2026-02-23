/**
 * Intelligent AI Agent Search Engine
 * 
 * A multi-stage search system that works like an intelligent investigator:
 * 
 * 1. QUERY ANALYSIS: Extract multiple search criteria from user's query
 *    - Name, location, phone, email, company, IDs, etc.
 *    - Each becomes a separate search criterion
 * 
 * 2. PARALLEL SEARCH: Search for each criterion separately
 *    - Fetch all pages for each search
 *    - Track which criterion each result matched
 * 
 * 3. CROSS-REFERENCE: Find records matching MULTIPLE criteria
 *    - Higher score = more criteria matched
 *    - Show why each record is relevant
 * 
 * 4. AI ANALYSIS: Pass full context to AI for insights
 *    - Include original query, criteria, and matched data
 *    - AI provides connections and analysis
 * 
 * Example:
 *   Query: "rahul sharma from delhi with phone 91231298312"
 *   Extracted: { name: "Rahul Sharma", location: "Delhi", phone: "91231298312" }
 *   Result: Records that match name AND location AND phone (highest score)
 *           Records that match name AND location (medium score)
 *           Records that match any single criterion (low score)
 */

import { createLogger } from './logger';
import { getUnifiedAI, shouldUseLocalAI, type ChatMessage } from './local-ai-client';

const logger = createLogger('IntelligentSearch');

// ============================================================================
// TYPES
// ============================================================================

export interface SearchCriterion {
  id: string;
  type: 'name' | 'location' | 'phone' | 'email' | 'company' | 'id_number' | 'account' | 'keyword' | 'date' | 'amount';
  value: string;
  normalizedValue: string;
  searchTerms: string[];  // Terms to search for
  description: string;
  importance: number;     // 1-10, higher = more important
}

export interface QueryAnalysis {
  originalQuery: string;
  intent: string;
  criteria: SearchCriterion[];
  searchStrategy: 'intersection' | 'union' | 'fuzzy';
  instructions: string;   // Instructions for local AI
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
  matchScore: number;       // Higher = matched more important criteria
  matchDetails: string[];   // Human-readable match explanations
  isExactMatch: boolean;    // Matched ALL criteria
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

export interface IntelligentSearchResponse {
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
  maxPagesPerQuery: 10,
  pageSize: 100,
  maxConcurrentSearches: 3,
  queryTimeout: 30000,
  maxTotalResults: 5000,
  // Scoring weights
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
};

// ============================================================================
// INTELLIGENT SEARCH ENGINE
// ============================================================================

export class IntelligentSearchEngine {
  private progressCallback?: (progress: ProgressUpdate) => void;
  private apiBaseUrl: string;
  private bearerToken?: string;
  private aiMode: 'cloud' | 'local' | 'fallback' = 'cloud';
  private storedResults: Map<string, StoredResult> = new Map();
  private pagesFetched = 0;

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
  // STAGE 1: QUERY ANALYSIS
  // =========================================================================

  /**
   * Analyze user query and extract multiple search criteria
   */
  private async analyzeQuery(query: string): Promise<QueryAnalysis> {
    logger.info('Analyzing query', { query });

    const criteria = this.extractCriteriaFromQuery(query);
    
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
   * Rule-based criteria extraction (fallback)
   */
  private extractCriteriaFromQuery(query: string): SearchCriterion[] {
    const criteria: SearchCriterion[] = [];
    let idCounter = 0;

    // Phone numbers (Indian format: 10 digits, may start with +91 or 0)
    const phonePattern = /(?:\+91[-\s]?|0)?[6-9]\d{9}\b/g;
    const phones = query.match(phonePattern) || [];
    for (const phone of phones) {
      const normalized = phone.replace(/\D/g, '').slice(-10);
      criteria.push({
        id: `phone_${++idCounter}`,
        type: 'phone',
        value: phone,
        normalizedValue: normalized,
        searchTerms: [normalized, phone],
        description: `Phone number: ${phone}`,
        importance: CONFIG.scoreWeights.phone,
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
        searchTerms: [email, email.toLowerCase()],
        description: `Email: ${email}`,
        importance: CONFIG.scoreWeights.email,
      });
    }

    // PAN numbers (ABCDE1234F)
    const panPattern = /[A-Z]{5}\d{4}[A-Z]\b/gi;
    const pans = query.match(panPattern) || [];
    for (const pan of pans) {
      criteria.push({
        id: `pan_${++idCounter}`,
        type: 'id_number',
        value: pan.toUpperCase(),
        normalizedValue: pan.toUpperCase(),
        searchTerms: [pan.toUpperCase()],
        description: `PAN Number: ${pan.toUpperCase()}`,
        importance: CONFIG.scoreWeights.id_number,
      });
    }

    // Account numbers (alphanumeric 6-20 chars)
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
      });
    }

    // Names (Capitalized words, 2+ words together)
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    const names = query.match(namePattern) || [];
    for (const name of names) {
      // Filter out locations that might be capitalized
      const locationWords = ['delhi', 'mumbai', 'bangalore', 'chennai', 'kolkata', 'hyderabad', 'pune', 'india'];
      const nameLower = name.toLowerCase();
      if (!locationWords.includes(nameLower)) {
        criteria.push({
          id: `name_${++idCounter}`,
          type: 'name',
          value: name,
          normalizedValue: nameLower,
          searchTerms: [name, nameLower, ...name.split(/\s+/)],
          description: `Name: ${name}`,
          importance: CONFIG.scoreWeights.name,
        });
      }
    }

    // Locations (after "from", "in", "at", "near", "of")
    const locationPattern = /(?:from|in|at|near|of|city\s+|state\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
    let locationMatch;
    while ((locationMatch = locationPattern.exec(query)) !== null) {
      const location = locationMatch[1];
      criteria.push({
        id: `location_${++idCounter}`,
        type: 'location',
        value: location,
        normalizedValue: location.toLowerCase(),
        searchTerms: [location, location.toLowerCase()],
        description: `Location: ${location}`,
        importance: CONFIG.scoreWeights.location,
      });
    }

    // Companies (after "company", "firm", "organization")
    const companyPattern = /(?:company|firm|organization|org|business)[\s:]+([A-Za-z][A-Za-z0-9\s]{2,30})/gi;
    let companyMatch;
    while ((companyMatch = companyPattern.exec(query)) !== null) {
      const company = companyMatch[1].trim();
      criteria.push({
        id: `company_${++idCounter}`,
        type: 'company',
        value: company,
        normalizedValue: company.toLowerCase(),
        searchTerms: [company, company.toLowerCase()],
        description: `Company: ${company}`,
        importance: CONFIG.scoreWeights.company,
      });
    }

    // Dates (various formats)
    const datePattern = /\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi;
    const dates = query.match(datePattern) || [];
    for (const date of dates) {
      criteria.push({
        id: `date_${++idCounter}`,
        type: 'date',
        value: date,
        normalizedValue: date.toLowerCase(),
        searchTerms: [date],
        description: `Date: ${date}`,
        importance: CONFIG.scoreWeights.date,
      });
    }

    // Amounts (with currency symbols or words)
    const amountPattern = /(?:rs\.?|₹|inr|usd|\$)?\s*(\d[\d,]*\.?\d*)\s*(?:lakh|crore|thousand|k|million|m|billion)?/gi;
    let amountMatch;
    while ((amountMatch = amountPattern.exec(query)) !== null) {
      const amount = amountMatch[1].replace(/,/g, '');
      if (parseFloat(amount) > 100) { // Only meaningful amounts
        criteria.push({
          id: `amount_${++idCounter}`,
          type: 'amount',
          value: amountMatch[0].trim(),
          normalizedValue: amount,
          searchTerms: [amount, amountMatch[0]],
          description: `Amount: ${amountMatch[0]}`,
          importance: CONFIG.scoreWeights.amount,
        });
      }
    }

    // If no criteria found, use the whole query as keyword
    if (criteria.length === 0) {
      criteria.push({
        id: `keyword_1`,
        type: 'keyword',
        value: query,
        normalizedValue: query.toLowerCase(),
        searchTerms: [query, ...query.split(/\s+/).filter(w => w.length > 2)],
        description: `Search: ${query}`,
        importance: CONFIG.scoreWeights.keyword,
      });
    }

    logger.info(`Extracted ${criteria.length} criteria`, criteria.map(c => c.description));
    return criteria;
  }

  /**
   * AI-powered criteria extraction
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
      "searchTerms": ["term1", "term2"],
      "description": "what this is",
      "importance": 1-10
    }
  ]
}

Rules:
- Extract EVERY distinct piece of information
- Names: person names (first + last)
- Locations: cities, states, addresses
- ID numbers: PAN, Aadhaar, passport, etc.
- Generate multiple search terms for each (variations, parts)
- Importance: phone/email/ID=9, name=10, location=6, keyword=3`;

    const content = await this.callAI(prompt, 'Extract search criteria. Respond only with valid JSON.');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        let idCounter = 0;
        return (parsed.criteria || []).map((c: { type?: string; value?: string; searchTerms?: string[]; description?: string; importance?: number }) => ({
          id: `${c.type}_${++idCounter}`,
          type: c.type || 'keyword',
          value: c.value || '',
          normalizedValue: (c.value || '').toLowerCase(),
          searchTerms: c.searchTerms || [c.value],
          description: c.description || c.value,
          importance: c.importance || 5,
        }));
      } catch (e) {
        logger.warn('Failed to parse AI criteria response', e);
      }
    }
    
    throw new Error('AI extraction failed');
  }

  /**
   * Generate instructions for local AI model
   */
  private generateAIInstructions(query: string, criteria: SearchCriterion[]): string {
    return `INVESTIGATION SEARCH CONTEXT:
You are analyzing search results for an investigation query.

ORIGINAL QUERY: "${query}"

EXTRACTED CRITERIA:
${criteria.map(c => `- ${c.type.toUpperCase()}: ${c.value} (importance: ${c.importance}/10)`).join('\n')}

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
    if (criteria.length >= 3) return 'intersection';
    if (criteria.length >= 2) return 'intersection';
    return 'union';
  }

  // =========================================================================
  // STAGE 2: PARALLEL SEARCH
  // =========================================================================

  /**
   * Search for each criterion separately
   */
  private async searchForCriterion(criterion: SearchCriterion): Promise<StoredResult[]> {
    const results: StoredResult[] = [];

    for (const searchTerm of criterion.searchTerms) {
      if (searchTerm.length < 2) continue;

      try {
        const pageResults = await this.fetchAllPages(searchTerm);
        
        for (const result of pageResults) {
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
          results.push(this.storedResults.get(key)!);
        }
      } catch (error) {
        logger.error(`Search failed for criterion: ${criterion.description}`, error);
      }
    }

    return results;
  }

  /**
   * Fetch all pages for a search term
   */
  private async fetchAllPages(searchTerm: string): Promise<Array<{ table: string; record: Record<string, unknown> }>> {
    const allResults: Array<{ table: string; record: Record<string, unknown> }> = [];
    let cursor: string | undefined;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < CONFIG.maxPagesPerQuery) {
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

  // =========================================================================
  // STAGE 3: CROSS-REFERENCE
  // =========================================================================

  /**
   * Cross-reference results to find matches
   */
  private crossReferenceResults(criteria: SearchCriterion[]): CrossReferencedResult[] {
    const results: CrossReferencedResult[] = [];

    for (const stored of this.storedResults.values()) {
      // Calculate match score
      let matchScore = 0;
      const matchDetails: string[] = [];

      for (const match of stored.matchedCriteria) {
        const weight = CONFIG.scoreWeights[match.criterionType] || 3;
        matchScore += weight;
        matchDetails.push(`Matched ${match.criterionType}: ${match.matchedValue}`);
      }

      // Bonus for matching multiple criteria
      if (stored.matchCount > 1) {
        matchScore *= (1 + (stored.matchCount * 0.5)); // 50% bonus per additional match
      }

      const isExactMatch = stored.matchCount === criteria.length;

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

    // Sort by match score (highest first)
    results.sort((a, b) => b.matchScore - a.matchScore);

    // Put exact matches at the top
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

    // Build AI analysis prompt with full context
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
    
    if (exactMatches.length > 0) {
      return `Found ${exactMatches.length} exact match(es) that satisfy all criteria: ${analysis.criteria.map(c => c.description).join(', ')}. These records matched on name, location, and phone number as requested.`;
    }
    
    if (results.length > 0) {
      return `Found ${results.length} partial matches. No records matched ALL criteria exactly, but ${results.filter(r => r.matchCount > 1).length} records matched multiple criteria.`;
    }
    
    return 'No results found matching any of the search criteria. Consider broadening your search.';
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

  async search(query: string): Promise<IntelligentSearchResponse> {
    const startTime = Date.now();
    this.storedResults.clear();
    this.pagesFetched = 0;

    logger.info(`Starting intelligent search for: "${query}"`);

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
    });

    // Stage 2: Search for each criterion
    this.updateProgress({
      stage: 'searching',
      message: `Searching for ${analysis.criteria.length} criteria...`,
      progress: 10,
      criteriaProcessed: 0,
      totalCriteria: analysis.criteria.length,
      resultsFound: 0,
    });

    for (let i = 0; i < analysis.criteria.length; i++) {
      const criterion = analysis.criteria[i];
      await this.searchForCriterion(criterion);
      
      this.updateProgress({
        stage: 'searching',
        message: `Searched for: ${criterion.description}`,
        progress: 10 + ((i + 1) / analysis.criteria.length) * 40,
        criteriaProcessed: i + 1,
        totalCriteria: analysis.criteria.length,
        resultsFound: this.storedResults.size,
      });
    }

    logger.info(`Search complete`, {
      uniqueResults: this.storedResults.size,
      pagesFetched: this.pagesFetched,
    });

    // Stage 3: Cross-reference
    this.updateProgress({
      stage: 'cross_referencing',
      message: 'Cross-referencing results to find matches...',
      progress: 60,
      criteriaProcessed: analysis.criteria.length,
      totalCriteria: analysis.criteria.length,
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
      criteriaProcessed: analysis.criteria.length,
      totalCriteria: analysis.criteria.length,
      resultsFound: results.length,
    });

    const insights = await this.analyzeResults(analysis, results);

    // Complete
    this.updateProgress({
      stage: 'complete',
      message: 'Search complete!',
      progress: 100,
      criteriaProcessed: analysis.criteria.length,
      totalCriteria: analysis.criteria.length,
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
      },
    };
  }
}

export default IntelligentSearchEngine;
