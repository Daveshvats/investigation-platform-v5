/**
 * Semantic Query Parser V2
 * Natural language query understanding with intent detection and query planning
 * Implements 2026 research on semantic search and query understanding
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  ParsedQuery,
  QueryIntent,
  QueryFilter,
  TimeRange,
  QueryConstraint,
} from './types';
import { HybridEntityExtractor } from './hybrid-entity-extractor';

// ============================================================================
// INTENT PATTERNS
// ============================================================================

interface IntentPattern {
  intent: QueryIntent;
  patterns: RegExp[];
  extractParameters: (match: RegExpMatchArray, text: string) => Partial<ParsedQuery>;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'find_entity',
    patterns: [
      /(?:find|search|show|get|list|display)\s+(?:all\s+)?(?:people|persons|individuals?|records?)\s+(?:with|having|where)?/gi,
      /(?:find|search|show)\s+(?:phone|email|pan|aadhaar|account|vehicle)/gi,
      /who\s+(?:has|is|owns|uses)/gi,
    ],
    extractParameters: (match, text) => ({
      suggestedActions: ['search_database', 'extract_entities'],
    }),
  },
  {
    intent: 'find_connections',
    patterns: [
      /(?:find|show|trace|identify)\s+(?:all\s+)?(?:connections?|links?|relationships?|associations?)/gi,
      /(?:connected|linked|related|associated)\s+(?:to|with)/gi,
      /how\s+(?:is\s+)?(?:are\s+)?(.+?)\s+(?:connected|linked|related)/gi,
      /common\s+(?:between|among)/gi,
    ],
    extractParameters: (match, text) => ({
      suggestedActions: ['build_graph', 'find_paths', 'identify_clusters'],
    }),
  },
  {
    intent: 'find_transactions',
    patterns: [
      /(?:find|show|list)\s+(?:all\s+)?(?:transactions?|transfers?|payments?)/gi,
      /(?:money|funds?)\s+(?:transferred?|sent|received|paid)/gi,
      /(?:financial|banking)\s+(?:activity|history|records?)/gi,
      /(?:transferred?|received?|paid)\s+(?:Rs|INR|₹)/gi,
    ],
    extractParameters: (match, text) => ({
      suggestedActions: ['search_transactions', 'analyze_patterns', 'timeline_analysis'],
    }),
  },
  {
    intent: 'analyze_patterns',
    patterns: [
      /(?:analyze|analyse|identify|detect)\s+(?:patterns?|trends?|anomalies?)/gi,
      /(?:suspicious|unusual|irregular)\s+(?:activity|pattern|behavior)/gi,
      /(?:frequency|temporal|spatial)\s+(?:analysis|pattern)/gi,
    ],
    extractParameters: (match, text) => ({
      suggestedActions: ['pattern_analysis', 'anomaly_detection', 'generate_insights'],
    }),
  },
  {
    intent: 'timeline_analysis',
    patterns: [
      /(?:timeline|chronology|sequence)\s+(?:of|for|showing)/gi,
      /(?:what\s+happened|events?)\s+(?:between|from|during|in)/gi,
      /(?:history|chronological)\s+(?:of|for)/gi,
    ],
    extractParameters: (match, text) => ({
      suggestedActions: ['build_timeline', 'sequence_events', 'temporal_analysis'],
    }),
  },
  {
    intent: 'risk_assessment',
    patterns: [
      /(?:risk|threat|danger)\s+(?:assessment|analysis|level)/gi,
      /(?:assess|evaluate|calculate)\s+(?:risk|threat)/gi,
      /(?:high|medium|low)\s+risk/gi,
      /(?:red\s+flag|warning|alert)/gi,
    ],
    extractParameters: (match, text) => ({
      suggestedActions: ['risk_scoring', 'threat_detection', 'generate_report'],
    }),
  },
  {
    intent: 'generate_report',
    patterns: [
      /(?:generate|create|produce|make)\s+(?:a\s+)?(?:report|document|summary)/gi,
      /(?:export|download|save)\s+(?:as|to)\s+(?:pdf|report)/gi,
      /(?:comprehensive|detailed|full)\s+(?:report|analysis)/gi,
    ],
    extractParameters: (match, text) => ({
      suggestedActions: ['generate_pdf_report', 'compile_findings', 'create_summary'],
    }),
  },
];

// ============================================================================
// TIME EXTRACTION PATTERNS
// ============================================================================

const TIME_PATTERNS = {
  relative: [
    { pattern: /last\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)/gi, 
      extract: (match: RegExpMatchArray): TimeRange => {
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const now = new Date();
        let start: Date;
        
        switch (unit) {
          case 'day':
          case 'days':
            start = new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
            break;
          case 'week':
          case 'weeks':
            start = new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
          case 'months':
            start = new Date(now.setMonth(now.getMonth() - amount));
            break;
          case 'year':
          case 'years':
            start = new Date(now.setFullYear(now.getFullYear() - amount));
            break;
          default:
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        
        return { start, end: new Date() };
      }
    },
    { pattern: /(?:yesterday|today|this\s+week|this\s+month|this\s+year)/gi,
      extract: (match: RegExpMatchArray): TimeRange => {
        const text = match[0].toLowerCase();
        const now = new Date();
        
        if (text === 'yesterday') {
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          return { start: yesterday, end: yesterday };
        }
        if (text === 'today') {
          return { start: now, end: now };
        }
        if (text === 'this week') {
          const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
          return { start: weekStart, end: new Date() };
        }
        if (text === 'this month') {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          return { start: monthStart, end: new Date() };
        }
        if (text === 'this year') {
          const yearStart = new Date(now.getFullYear(), 0, 1);
          return { start: yearStart, end: new Date() };
        }
        
        return { start: undefined, end: undefined };
      }
    },
  ],
  absolute: [
    { pattern: /(?:from|between)\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\s+(?:to|and)\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/gi,
      extract: (match: RegExpMatchArray): TimeRange => {
        return {
          start: new Date(match[1]),
          end: new Date(match[2]),
        };
      }
    },
    { pattern: /(?:in|during)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})?/gi,
      extract: (match: RegExpMatchArray): TimeRange => {
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
        const monthIndex = months.indexOf(match[1].toLowerCase());
        const year = match[2] ? parseInt(match[2]) : new Date().getFullYear();
        const start = new Date(year, monthIndex, 1);
        const end = new Date(year, monthIndex + 1, 0);
        return { start, end };
      }
    },
  ],
  aliases: [
    { pattern: /last\s+24\s*hours?/gi, range: { relative: 'last_24h' } as TimeRange },
    { pattern: /last\s+week/gi, range: { relative: 'last_7d' } as TimeRange },
    { pattern: /last\s+month/gi, range: { relative: 'last_30d' } as TimeRange },
    { pattern: /last\s+(?:quarter|3\s*months?)/gi, range: { relative: 'last_90d' } as TimeRange },
    { pattern: /last\s+year/gi, range: { relative: 'last_1y' } as TimeRange },
  ],
};

// ============================================================================
// FILTER EXTRACTION PATTERNS
// ============================================================================

const FILTER_PATTERNS = [
  // Location filters
  {
    pattern: /(?:from|in|at|located\s+in|based\s+in)\s+([A-Za-z\s]+(?:city|town|state|district)?)/gi,
    type: 'location',
    extract: (match: RegExpMatchArray): QueryFilter => ({
      field: 'location',
      operator: 'contains',
      value: match[1].trim(),
    }),
  },
  // Amount filters
  {
    pattern: /(?:more|greater|above|exceeding|over)\s+than\s+(?:Rs\.?|INR|₹)?\s*([\d,]+)/gi,
    type: 'amount_min',
    extract: (match: RegExpMatchArray): QueryFilter => ({
      field: 'amount',
      operator: 'greater_than',
      value: parseFloat(match[1].replace(/,/g, '')),
    }),
  },
  {
    pattern: /(?:less|below|under|below)\s+than\s+(?:Rs\.?|INR|₹)?\s*([\d,]+)/gi,
    type: 'amount_max',
    extract: (match: RegExpMatchArray): QueryFilter => ({
      field: 'amount',
      operator: 'less_than',
      value: parseFloat(match[1].replace(/,/g, '')),
    }),
  },
  // Phone prefix filters
  {
    pattern: /phone\s+(?:starting|beginning)\s+(?:with|from)\s+(\d+)/gi,
    type: 'phone_prefix',
    extract: (match: RegExpMatchArray): QueryFilter => ({
      field: 'phone',
      operator: 'starts_with',
      value: match[1],
    }),
  },
  // Count filters
  {
    pattern: /(?:more|greater)\s+than\s+(\d+)\s+(?:transactions?|records?|entries?)/gi,
    type: 'count_min',
    extract: (match: RegExpMatchArray): QueryFilter => ({
      field: 'count',
      operator: 'greater_than',
      value: parseInt(match[1]),
    }),
  },
];

// ============================================================================
// QUERY PLAN
// ============================================================================

export interface QueryPlan {
  steps: QueryStep[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  estimatedTime: number; // in milliseconds
  requiredData: string[];
}

export interface QueryStep {
  id: string;
  type: 'extract' | 'search' | 'filter' | 'correlate' | 'analyze' | 'aggregate' | 'generate';
  description: string;
  parameters: Record<string, unknown>;
  dependsOn: string[];
}

// ============================================================================
// SEMANTIC QUERY PARSER CLASS
// ============================================================================

export class SemanticQueryParser {
  private entityExtractor: HybridEntityExtractor;

  constructor(entityExtractor?: HybridEntityExtractor) {
    this.entityExtractor = entityExtractor || new HybridEntityExtractor();
  }

  /**
   * Main parsing method
   */
  async parse(query: string): Promise<ParsedQuery> {
    const startTime = Date.now();

    // Step 1: Extract entities from query
    const entities = await this.entityExtractor.extract(query);

    // Step 2: Detect intent
    const intent = this.detectIntent(query);

    // Step 3: Extract filters
    const filters = this.extractFilters(query, entities);

    // Step 4: Extract time range
    const timeRange = this.extractTimeRange(query);

    // Step 5: Extract location
    const location = this.extractLocation(query);

    // Step 6: Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(intent, entities, filters);

    // Step 7: Build constraints
    const constraints = this.extractConstraints(query);

    const parsedQuery: ParsedQuery = {
      original: query,
      intent,
      entities,
      filters,
      timeRange,
      location,
      constraints,
      suggestedActions,
    };

    console.log(`Query parsed in ${Date.now() - startTime}ms, intent: ${intent}`);
    return parsedQuery;
  }

  /**
   * Detect query intent
   */
  private detectIntent(query: string): QueryIntent {
    let bestMatch: { intent: QueryIntent; score: number } = { intent: 'unknown', score: 0 };

    for (const intentPattern of INTENT_PATTERNS) {
      for (const pattern of intentPattern.patterns) {
        const matches = query.match(pattern);
        if (matches) {
          const score = matches.length * pattern.source.length / query.length;
          if (score > bestMatch.score) {
            bestMatch = { intent: intentPattern.intent, score };
          }
        }
      }
    }

    return bestMatch.intent;
  }

  /**
   * Extract filters from query
   */
  private extractFilters(query: string, entities: Entity[]): QueryFilter[] {
    const filters: QueryFilter[] = [];

    // Apply pattern-based filters
    for (const filterPattern of FILTER_PATTERNS) {
      const matches = query.matchAll(filterPattern.pattern);
      for (const match of matches) {
        filters.push(filterPattern.extract(match));
      }
    }

    // Add entity-based filters for HIGH priority entities
    for (const entity of entities) {
      if (entity.priority === 'HIGH') {
        filters.push({
          field: entity.type,
          operator: 'equals',
          value: entity.normalizedValue,
          entity,
        });
      }
    }

    return filters;
  }

  /**
   * Extract time range from query
   */
  private extractTimeRange(query: string): TimeRange | undefined {
    // Check aliases first
    for (const alias of TIME_PATTERNS.aliases) {
      if (alias.pattern.test(query)) {
        return alias.range;
      }
    }

    // Check relative patterns
    for (const relative of TIME_PATTERNS.relative) {
      const matches = query.matchAll(relative.pattern);
      for (const match of matches) {
        return relative.extract(match);
      }
    }

    // Check absolute patterns
    for (const absolute of TIME_PATTERNS.absolute) {
      const matches = query.matchAll(absolute.pattern);
      for (const match of matches) {
        return absolute.extract(match);
      }
    }

    return undefined;
  }

  /**
   * Extract location from query
   */
  private extractLocation(query: string): string | undefined {
    const locationPatterns = [
      /(?:from|in|at|located\s+in|based\s+in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      /(?:city|town|state|district)\s+(?:of\s+)?([A-Z][a-z]+)/g,
    ];

    for (const pattern of locationPatterns) {
      const match = query.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract constraints (limit, order by)
   */
  private extractConstraints(query: string): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];

    // Limit
    const limitMatch = query.match(/(?:limit|top|first)\s+(\d+)/i);
    if (limitMatch) {
      constraints.push({ type: 'limit', value: parseInt(limitMatch[1]) });
    }

    // Order by
    const orderMatch = query.match(/(?:order|sort)\s+(?:by\s+)?(\w+)\s*(ascending|descending|asc|desc)?/i);
    if (orderMatch) {
      constraints.push({ type: 'orderBy', value: `${orderMatch[1]} ${orderMatch[2] || 'desc'}` });
    }

    return constraints;
  }

  /**
   * Generate suggested actions based on intent
   */
  private generateSuggestedActions(
    intent: QueryIntent,
    entities: Entity[],
    filters: QueryFilter[]
  ): string[] {
    const actions: string[] = [];

    switch (intent) {
      case 'find_entity':
        actions.push('search_database');
        if (entities.length > 0) {
          actions.push('extract_entities');
        }
        if (entities.some(e => e.priority === 'HIGH')) {
          actions.push('prioritize_high_confidence');
        }
        break;

      case 'find_connections':
        actions.push('build_knowledge_graph');
        actions.push('find_shortest_paths');
        if (entities.length >= 2) {
          actions.push('find_common_connections');
        }
        actions.push('identify_clusters');
        break;

      case 'find_transactions':
        actions.push('search_transactions');
        actions.push('analyze_patterns');
        if (entities.some(e => e.type === 'amount')) {
          actions.push('financial_analysis');
        }
        break;

      case 'analyze_patterns':
        actions.push('pattern_detection');
        actions.push('anomaly_detection');
        actions.push('generate_insights');
        break;

      case 'timeline_analysis':
        actions.push('build_timeline');
        actions.push('sequence_events');
        break;

      case 'risk_assessment':
        actions.push('calculate_risk_scores');
        actions.push('identify_threats');
        actions.push('generate_risk_report');
        break;

      case 'generate_report':
        actions.push('compile_findings');
        actions.push('generate_pdf_report');
        break;

      default:
        actions.push('search_database');
        actions.push('extract_entities');
    }

    return actions;
  }

  /**
   * Create execution plan from parsed query
   */
  createExecutionPlan(parsedQuery: ParsedQuery): QueryPlan {
    const steps: QueryStep[] = [];
    const requiredData: string[] = [];

    // Step 1: Entity extraction (if needed)
    if (parsedQuery.entities.length === 0) {
      steps.push({
        id: uuidv4(),
        type: 'extract',
        description: 'Extract entities from query',
        parameters: { query: parsedQuery.original },
        dependsOn: [],
      });
    }

    // Step 2: Database search
    const searchStep: QueryStep = {
      id: uuidv4(),
      type: 'search',
      description: 'Search database with extracted entities',
      parameters: {
        entities: parsedQuery.entities.map(e => ({ type: e.type, value: e.normalizedValue })),
        filters: parsedQuery.filters,
        timeRange: parsedQuery.timeRange,
      },
      dependsOn: steps.length > 0 ? [steps[0].id] : [],
    };
    steps.push(searchStep);
    requiredData.push('primary_database');

    // Step 3: Correlation (for connection queries)
    if (parsedQuery.intent === 'find_connections') {
      steps.push({
        id: uuidv4(),
        type: 'correlate',
        description: 'Build correlation graph',
        parameters: { depth: 3 },
        dependsOn: [searchStep.id],
      });
      requiredData.push('graph_database');
    }

    // Step 4: Analysis (for pattern queries)
    if (parsedQuery.intent === 'analyze_patterns' || parsedQuery.intent === 'risk_assessment') {
      steps.push({
        id: uuidv4(),
        type: 'analyze',
        description: 'Perform pattern and anomaly analysis',
        parameters: { detectAnomalies: true, detectPatterns: true },
        dependsOn: [searchStep.id],
      });
    }

    // Step 5: Generate report (if requested)
    if (parsedQuery.intent === 'generate_report') {
      steps.push({
        id: uuidv4(),
        type: 'generate',
        description: 'Generate investigation report',
        parameters: { format: 'pdf', includeGraph: true },
        dependsOn: steps.map(s => s.id),
      });
    }

    // Estimate complexity
    const complexity = steps.length <= 2 ? 'low' : steps.length <= 4 ? 'medium' : 'high';
    const estimatedTime = steps.length * 500 + (parsedQuery.entities.length * 100);

    return {
      steps,
      estimatedComplexity: complexity,
      estimatedTime,
      requiredData: [...new Set(requiredData)],
    };
  }
}

// Export singleton instance
export const semanticQueryParser = new SemanticQueryParser();
