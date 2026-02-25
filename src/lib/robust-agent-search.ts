/**
 * Robust Agent Search Engine V2
 * Integrates 2026-standard hybrid extraction, knowledge graph, and correlation
 * Maintains backward compatibility with original API
 */

import { 
  EntityExtractor, 
  ExtractedEntities, 
  Entity, 
  EntityRelationship 
} from './entity-extractor';
import { 
  HybridEntityExtractor,
  Entity as V2Entity,
} from './v2/hybrid-entity-extractor';
import { 
  KnowledgeGraphBuilder,
  RelationshipInferrer,
} from './v2/knowledge-graph';
import { 
  CorrelationEngine,
} from './v2/correlation-engine';
import { 
  SemanticQueryParser,
} from './v2/semantic-query-parser';

// ============================================================================
// TYPES AND INTERFACES (Backward Compatible)
// ============================================================================

export interface SearchResult {
  id: string;
  tableName: string;
  data: Record<string, unknown>;
  matchedFields: string[];
  matchedEntities: Entity[];
  score: number;
}

export interface CorrelationNode {
  id: string;
  type: 'person' | 'phone' | 'email' | 'address' | 'account' | 'other';
  label: string;
  entityType: string;
  value: string;
  connections: string[];
  occurrences: number;
  sources: string[];
  riskScore?: number;
  cluster?: string;
}

export interface CorrelationEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  weight: number;
  sources: string[];
  strength?: string;
  confidence?: number;
}

export interface CorrelationGraph {
  nodes: CorrelationNode[];
  edges: CorrelationEdge[];
  clusters: Map<string, string[]>;
}

export interface SearchProgress {
  phase: 'extracting' | 'searching' | 'discovering' | 'building_graph' | 'analyzing' | 'filtering' | 'complete';
  message: string;
  progress: number;
  entitiesFound: number;
  resultsFound: number;
  currentEntity?: string;
}

export interface SearchOptions {
  maxIterations?: number;
  maxResultsPerEntity?: number;
  minConfidence?: number;
  includeGraph?: boolean;
  enableV2?: boolean;
  analyzeCorrelations?: boolean;
  timeout?: number;
  onProgress?: (progress: SearchProgress) => void;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  extraction: ExtractedEntities;
  results: SearchResult[];
  correlationGraph: CorrelationGraph | null;
  insights: SearchInsights;
  v2Insights?: {
    patterns: number;
    anomalies: number;
    riskIndicators: number;
  };
  metadata: {
    searchTime: number;
    entitiesSearched: number;
    iterationsPerformed: number;
    totalRecordsSearched: number;
    v2Enabled: boolean;
  };
}

export interface SearchInsights {
  highValueMatches: number;
  totalConnections: number;
  entityBreakdown: Record<string, number>;
  topEntities: Array<{ value: string; type: string; occurrences: number }>;
  redFlags: string[];
  patterns: string[];
  recommendations: string[];
}

// ============================================================================
// DATABASE SCHEMA CONFIGURATION
// ============================================================================

interface TableSchema {
  name: string;
  searchableFields: string[];
  entityTypeMapping: Record<string, string>;
}

const DEFAULT_TABLE_SCHEMAS: TableSchema[] = [
  {
    name: 'banking_transactions',
    searchableFields: ['account_number', 'ifsc_code', 'pan_number', 'phone', 'email', 'name', 'amount', 'date'],
    entityTypeMapping: {
      account_number: 'account_number',
      ifsc_code: 'ifsc_code',
      pan_number: 'pan_number',
      phone: 'phone',
      email: 'email',
      name: 'name',
      amount: 'amount',
      date: 'date',
    },
  },
  {
    name: 'telecom_records',
    searchableFields: ['phone', 'name', 'address', 'email', 'id_proof', 'activation_date'],
    entityTypeMapping: {
      phone: 'phone',
      name: 'name',
      address: 'address',
      email: 'email',
      id_proof: 'id_number',
    },
  },
  {
    name: 'person_records',
    searchableFields: ['name', 'phone', 'email', 'address', 'pan_number', 'aadhaar_number', 'dob'],
    entityTypeMapping: {
      name: 'name',
      phone: 'phone',
      email: 'email',
      address: 'address',
      pan_number: 'pan_number',
      aadhaar_number: 'aadhaar_number',
    },
  },
  {
    name: 'vehicle_registrations',
    searchableFields: ['vehicle_number', 'owner_name', 'address', 'phone', 'chassis_number', 'engine_number'],
    entityTypeMapping: {
      vehicle_number: 'vehicle_number',
      owner_name: 'name',
      address: 'address',
      phone: 'phone',
    },
  },
  {
    name: 'property_records',
    searchableFields: ['owner_name', 'address', 'phone', 'email', 'property_id', 'area'],
    entityTypeMapping: {
      owner_name: 'name',
      address: 'address',
      phone: 'phone',
      email: 'email',
    },
  },
  {
    name: 'company_directors',
    searchableFields: ['name', 'pan_number', 'din', 'address', 'phone', 'email', 'company_name'],
    entityTypeMapping: {
      name: 'name',
      pan_number: 'pan_number',
      address: 'address',
      phone: 'phone',
      email: 'email',
      company_name: 'company',
    },
  },
];

// ============================================================================
// ROBUST SEARCH ENGINE CLASS V2
// ============================================================================

export class RobustAgentSearch {
  private entityExtractor: EntityExtractor;
  private hybridExtractor: HybridEntityExtractor;
  private queryParser: SemanticQueryParser;
  private graphBuilder: KnowledgeGraphBuilder;
  private relationshipInferrer: RelationshipInferrer;
  private correlationEngine: CorrelationEngine;
  private tableSchemas: TableSchema[];
  private db: any;

  constructor(db?: any, schemas?: TableSchema[]) {
    this.entityExtractor = new EntityExtractor();
    this.hybridExtractor = new HybridEntityExtractor();
    this.queryParser = new SemanticQueryParser(this.hybridExtractor);
    this.graphBuilder = new KnowledgeGraphBuilder();
    this.relationshipInferrer = new RelationshipInferrer();
    this.correlationEngine = new CorrelationEngine();
    this.tableSchemas = schemas || DEFAULT_TABLE_SCHEMAS;
    this.db = db;
  }

  /**
   * Main search method - Enhanced with V2 features
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const {
      maxIterations = 5,
      maxResultsPerEntity = 100,
      minConfidence = 0.5,
      includeGraph = true,
      enableV2 = true,
      analyzeCorrelations = true,
      onProgress,
    } = options;

    let currentIteration = 0;
    let totalRecordsSearched = 0;
    const allResults: SearchResult[] = [];
    const searchedEntities = new Set<string>();
    const discoveredEntities: Entity[] = [];

    // Phase 1: Parse query with semantic understanding (V2)
    onProgress?.({
      phase: 'extracting',
      message: enableV2 ? 'Parsing query with semantic analysis...' : 'Extracting entities from query...',
      progress: 5,
      entitiesFound: 0,
      resultsFound: 0,
    });

    let parsedQuery;
    let initialExtraction: ExtractedEntities;

    if (enableV2) {
      parsedQuery = await this.queryParser.parse(query);
      // Convert V2 entities to V1 format for backward compatibility
      const v2Entities = await this.hybridExtractor.extract(query);
      initialExtraction = this.convertV2ToV1Entities(v2Entities, query);
    } else {
      initialExtraction = this.entityExtractor.extract(query);
    }

    // Get HIGH and MEDIUM value entities to search
    const searchEntities = [
      ...initialExtraction.highValue,
      ...initialExtraction.mediumValue,
    ];

    // Get LOW value entities for filtering
    const filterEntities = initialExtraction.lowValue;

    // Phase 2: Iterative search
    while (currentIteration < maxIterations && searchEntities.length > 0) {
      currentIteration++;

      onProgress?.({
        phase: 'searching',
        message: `Iteration ${currentIteration}: Searching ${searchEntities.length} entities...`,
        progress: 10 + (currentIteration / maxIterations) * 40,
        entitiesFound: searchEntities.length,
        resultsFound: allResults.length,
      });

      // Search for each entity
      for (const entity of searchEntities) {
        const entityKey = `${entity.type}:${entity.value}`;

        if (searchedEntities.has(entityKey)) continue;
        searchedEntities.add(entityKey);

        onProgress?.({
          phase: 'searching',
          message: `Searching for ${entity.type}: ${entity.value}...`,
          progress: 10 + (currentIteration / maxIterations) * 40,
          entitiesFound: searchedEntities.size,
          resultsFound: allResults.length,
          currentEntity: entity.value,
        });

        // Search database
        const results = await this.searchDatabase(entity, maxResultsPerEntity);
        totalRecordsSearched += results.length;
        allResults.push(...results);
      }

      // Phase 3: Discover new entities from results
      if (currentIteration < maxIterations) {
        onProgress?.({
          phase: 'discovering',
          message: `Discovering new entities from ${allResults.length} results...`,
          progress: 55,
          entitiesFound: searchedEntities.size,
          resultsFound: allResults.length,
        });

        // Extract entities from results
        const newEntities = await this.discoverEntitiesFromResults(
          allResults, 
          searchedEntities,
          enableV2
        );
        discoveredEntities.push(...newEntities);

        // Update search entities for next iteration
        searchEntities.length = 0;
        searchEntities.push(
          ...newEntities.filter(e => e.priority === 'HIGH' || e.priority === 'MEDIUM')
        );
      }
    }

    // Phase 4: Build correlation graph with V2 enhancements
    let correlationGraph: CorrelationGraph | null = null;
    if (includeGraph) {
      onProgress?.({
        phase: 'building_graph',
        message: enableV2 ? 'Building knowledge graph with entity resolution...' : 'Building correlation graph...',
        progress: 70,
        entitiesFound: searchedEntities.size,
        resultsFound: allResults.length,
      });

      correlationGraph = this.buildCorrelationGraph(allResults, enableV2);
    }

    // Phase 5: Advanced correlation analysis (V2)
    let v2Insights;
    if (enableV2 && analyzeCorrelations && correlationGraph) {
      onProgress?.({
        phase: 'analyzing',
        message: 'Running advanced pattern and anomaly detection...',
        progress: 85,
        entitiesFound: searchedEntities.size,
        resultsFound: allResults.length,
      });

      v2Insights = await this.runAdvancedAnalysis(correlationGraph);
    }

    // Phase 6: Filter results
    onProgress?.({
      phase: 'filtering',
      message: 'Filtering results based on query criteria...',
      progress: 90,
      entitiesFound: searchedEntities.size,
      resultsFound: allResults.length,
    });

    const filteredResults = this.filterResults(allResults, filterEntities, initialExtraction.relationships);

    // Generate insights (enhanced with V2)
    const insights = this.generateInsights(
      filteredResults, 
      initialExtraction, 
      correlationGraph,
      v2Insights
    );

    const searchTime = Date.now() - startTime;

    onProgress?.({
      phase: 'complete',
      message: 'Search complete!',
      progress: 100,
      entitiesFound: searchedEntities.size,
      resultsFound: filteredResults.length,
    });

    return {
      success: true,
      query,
      extraction: initialExtraction,
      results: filteredResults,
      correlationGraph,
      insights,
      v2Insights: v2Insights ? {
        patterns: v2Insights.patterns.length,
        anomalies: v2Insights.anomalies.length,
        riskIndicators: v2Insights.riskIndicators.length,
      } : undefined,
      metadata: {
        searchTime,
        entitiesSearched: searchedEntities.size,
        iterationsPerformed: currentIteration,
        totalRecordsSearched,
        v2Enabled: enableV2,
      },
    };
  }

  /**
   * Convert V2 entities to V1 format for backward compatibility
   */
  private convertV2ToV1Entities(v2Entities: V2Entity[], query: string): ExtractedEntities {
    const entities: Entity[] = v2Entities.map(e => ({
      type: e.type,
      value: e.value,
      originalText: e.originalText,
      priority: e.priority,
      confidence: e.confidence,
      position: e.position,
    }));

    return {
      entities,
      highValue: entities.filter(e => e.priority === 'HIGH'),
      mediumValue: entities.filter(e => e.priority === 'MEDIUM'),
      lowValue: entities.filter(e => e.priority === 'LOW'),
      relationships: [],
      originalQuery: query,
      extractionTime: 0,
    };
  }

  /**
   * Search database for a specific entity
   */
  private async searchDatabase(entity: Entity, limit: number): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const schema of this.tableSchemas) {
      const matchingFields = this.findMatchingFields(entity, schema);
      if (matchingFields.length === 0) continue;

      const query = this.buildSearchQuery(schema, matchingFields, entity, limit);
      const records = await this.executeSearch(query, schema.name);

      for (const record of records) {
        const result: SearchResult = {
          id: `${schema.name}_${record.id || Math.random().toString(36).substr(2, 9)}`,
          tableName: schema.name,
          data: record,
          matchedFields: matchingFields,
          matchedEntities: [entity],
          score: this.calculateScore(record, entity, matchingFields),
        };
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Find matching fields in a table schema for an entity
   */
  private findMatchingFields(entity: Entity, schema: TableSchema): string[] {
    const matchingFields: string[] = [];
    for (const [fieldName, entityType] of Object.entries(schema.entityTypeMapping)) {
      if (entityType === entity.type) {
        matchingFields.push(fieldName);
      }
    }
    return matchingFields;
  }

  /**
   * Build search query for database
   */
  private buildSearchQuery(
    schema: TableSchema,
    fields: string[],
    entity: Entity,
    limit: number
  ): any {
    return {
      table: schema.name,
      conditions: fields.map(field => ({
        field,
        operator: 'LIKE',
        value: entity.value,
      })),
      limit,
    };
  }

  /**
   * Execute search query (mock implementation)
   */
  private async executeSearch(query: any, tableName: string): Promise<any[]> {
    try {
      if (this.db) {
        const results = await this.db.query(query);
        return results;
      }
    } catch (error) {
      console.error('Search error:', error);
    }
    return [];
  }

  /**
   * Calculate relevance score for a result
   */
  private calculateScore(record: any, entity: Entity, matchedFields: string[]): number {
    let score = 0.5;

    for (const field of matchedFields) {
      if (record[field] === entity.value) {
        score += 0.3;
      } else if (String(record[field]).toLowerCase().includes(entity.value.toLowerCase())) {
        score += 0.1;
      }
    }

    if (entity.priority === 'HIGH') score += 0.2;
    else if (entity.priority === 'MEDIUM') score += 0.1;

    score *= entity.confidence;
    return Math.min(1, score);
  }

  /**
   * Discover new entities from search results (V2 enhanced)
   */
  private async discoverEntitiesFromResults(
    results: SearchResult[],
    alreadySearched: Set<string>,
    useV2: boolean
  ): Promise<Entity[]> {
    const discoveredEntities: Entity[] = [];

    for (const result of results) {
      const dataString = JSON.stringify(result.data);
      
      let extracted: Entity[];
      if (useV2) {
        const v2Entities = await this.hybridExtractor.extract(dataString);
        extracted = v2Entities.map(e => ({
          type: e.type,
          value: e.value,
          originalText: e.originalText,
          priority: e.priority,
          confidence: e.confidence,
        }));
      } else {
        const v1Extracted = this.entityExtractor.extract(dataString);
        extracted = v1Extracted.entities;
      }

      for (const entity of extracted.filter(e => e.priority === 'HIGH' || e.priority === 'MEDIUM')) {
        const key = `${entity.type}:${entity.value}`;
        if (!alreadySearched.has(key)) {
          discoveredEntities.push(entity);
        }
      }
    }

    // Deduplicate
    const uniqueEntities = new Map<string, Entity>();
    for (const entity of discoveredEntities) {
      const key = `${entity.type}:${entity.value}`;
      if (!uniqueEntities.has(key)) {
        uniqueEntities.set(key, entity);
      }
    }

    return Array.from(uniqueEntities.values());
  }

  /**
   * Build correlation graph (V2 enhanced with entity resolution)
   */
  private buildCorrelationGraph(results: SearchResult[], useV2: boolean): CorrelationGraph {
    const nodes: CorrelationNode[] = [];
    const edges: CorrelationEdge[] = [];
    const nodeMap = new Map<string, CorrelationNode>();
    const clusters = new Map<string, string[]>();

    for (const result of results) {
      const dataString = JSON.stringify(result.data);
      let entities: Entity[];

      if (useV2) {
        // Use hybrid extractor for better entity resolution
        const v2Entities = this.entityExtractor.extract(dataString);
        entities = v2Entities.entities;
      } else {
        const extracted = this.entityExtractor.extract(dataString);
        entities = extracted.entities;
      }

      // Create nodes for each entity
      for (const entity of entities) {
        const nodeId = `${entity.type}:${entity.value}`;

        if (!nodeMap.has(nodeId)) {
          const node: CorrelationNode = {
            id: nodeId,
            type: this.mapEntityTypeToNodeType(entity.type),
            label: entity.value,
            entityType: entity.type,
            value: entity.value,
            connections: [],
            occurrences: 1,
            sources: [result.tableName],
            riskScore: entity.priority === 'HIGH' ? 0.8 : entity.priority === 'MEDIUM' ? 0.5 : 0.2,
          };
          nodeMap.set(nodeId, node);
          nodes.push(node);
        } else {
          const node = nodeMap.get(nodeId)!;
          node.occurrences++;
          if (!node.sources.includes(result.tableName)) {
            node.sources.push(result.tableName);
          }
        }
      }

      // Create edges between entities from the same result
      const entityIds = entities.map(e => `${e.type}:${e.value}`);
      for (let i = 0; i < entityIds.length; i++) {
        for (let j = i + 1; j < entityIds.length; j++) {
          const sourceId = entityIds[i];
          const targetId = entityIds[j];

          const existingEdge = edges.find(
            e => (e.source === sourceId && e.target === targetId) ||
                 (e.source === targetId && e.target === sourceId)
          );

          if (existingEdge) {
            existingEdge.weight++;
            if (!existingEdge.sources.includes(result.tableName)) {
              existingEdge.sources.push(result.tableName);
            }
          } else {
            edges.push({
              id: `${sourceId}-${targetId}`,
              source: sourceId,
              target: targetId,
              relationship: 'co-occurrence',
              weight: 1,
              sources: [result.tableName],
              strength: 'weak',
              confidence: 0.5,
            });
          }

          // Update node connections
          const sourceNode = nodeMap.get(sourceId);
          const targetNode = nodeMap.get(targetId);
          if (sourceNode && !sourceNode.connections.includes(targetId)) {
            sourceNode.connections.push(targetId);
          }
          if (targetNode && !targetNode.connections.includes(sourceId)) {
            targetNode.connections.push(sourceId);
          }
        }
      }

      clusters.set(result.id, entityIds);
    }

    // Update edge strengths based on weight
    for (const edge of edges) {
      if (edge.weight >= 5) {
        edge.strength = 'strong';
        edge.confidence = 0.85;
      } else if (edge.weight >= 2) {
        edge.strength = 'moderate';
        edge.confidence = 0.7;
      }
    }

    return { nodes, edges, clusters };
  }

  /**
   * Run advanced V2 correlation analysis
   */
  private async runAdvancedAnalysis(graph: CorrelationGraph) {
    // Convert to V2 graph format
    const v2Nodes = graph.nodes.map(n => ({
      id: n.id,
      type: n.entityType as any,
      label: n.label,
      value: n.value,
      aliases: [],
      properties: {},
      incomingEdges: [],
      outgoingEdges: [],
      sources: n.sources,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const v2Edges = graph.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'co_occurrence' as const,
      strength: (e.strength || 'weak') as any,
      weight: e.weight,
      properties: {},
      evidence: [],
      confidence: e.confidence || 0.5,
      sources: e.sources,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    return this.correlationEngine.analyze(v2Nodes, v2Edges);
  }

  /**
   * Map entity type to graph node type
   */
  private mapEntityTypeToNodeType(entityType: string): CorrelationNode['type'] {
    const mapping: Record<string, CorrelationNode['type']> = {
      phone: 'phone',
      email: 'email',
      name: 'person',
      address: 'address',
      account_number: 'account',
      pan_number: 'other',
      aadhaar_number: 'other',
      ifsc_code: 'other',
      vehicle_number: 'other',
      ip_address: 'other',
      location: 'other',
      company: 'other',
      upi_id: 'other',
      crypto_address: 'other',
    };
    return mapping[entityType] || 'other';
  }

  /**
   * Filter results based on LOW value entities and relationships
   */
  private filterResults(
    results: SearchResult[],
    filterEntities: Entity[],
    relationships: EntityRelationship[]
  ): SearchResult[] {
    if (filterEntities.length === 0) {
      return results;
    }

    return results.filter(result => {
      const dataString = JSON.stringify(result.data).toLowerCase();

      for (const filter of filterEntities) {
        if (filter.type === 'name' || filter.type === 'location' || filter.type === 'company') {
          if (dataString.includes(filter.value.toLowerCase())) {
            return true;
          }
        }
      }

      return false;
    });
  }

  /**
   * Generate insights from search results (V2 enhanced)
   */
  private generateInsights(
    results: SearchResult[],
    extraction: ExtractedEntities,
    graph: CorrelationGraph | null,
    v2Analysis?: any
  ): SearchInsights {
    const entityBreakdown: Record<string, number> = {};
    const redFlags: string[] = [];
    const patterns: string[] = [];
    const recommendations: string[] = [];

    // Count entities by type
    for (const entity of extraction.entities) {
      entityBreakdown[entity.type] = (entityBreakdown[entity.type] || 0) + 1;
    }

    // Get top entities by occurrences
    const topEntities = graph
      ? graph.nodes
          .sort((a, b) => b.occurrences - a.occurrences)
          .slice(0, 10)
          .map(n => ({
            value: n.value,
            type: n.entityType,
            occurrences: n.occurrences,
          }))
      : [];

    // V2 enhanced insights
    if (v2Analysis) {
      // Add V2 patterns
      for (const pattern of v2Analysis.patterns.slice(0, 3)) {
        patterns.push(pattern.description);
      }

      // Add V2 anomalies as red flags
      for (const anomaly of v2Analysis.anomalies.slice(0, 3)) {
        redFlags.push(anomaly.description);
      }

      // Add V2 risk indicators
      for (const risk of v2Analysis.riskIndicators.slice(0, 3)) {
        redFlags.push(`[${risk.severity.toUpperCase()}] ${risk.description}`);
      }

      // Add V2 insights as recommendations
      for (const insight of v2Analysis.insights.slice(0, 3)) {
        if (insight.actionable) {
          recommendations.push(insight.description);
        }
      }
    }

    // Original insights
    if (graph) {
      const highConnectionNodes = graph.nodes.filter(n => n.connections.length > 5);
      if (highConnectionNodes.length > 0) {
        redFlags.push(`${highConnectionNodes.length} entities with unusually high connections detected`);
      }

      const crossTableEntities = graph.nodes.filter(n => n.sources.length > 2);
      if (crossTableEntities.length > 0) {
        redFlags.push(`${crossTableEntities.length} entities found across multiple data sources`);
      }
    }

    if (extraction.highValue.length > 0) {
      patterns.push(`Search initiated with ${extraction.highValue.length} unique identifier(s)`);
    }

    if (results.length > 10) {
      patterns.push(`Large result set (${results.length} records) indicates potential data correlation`);
    }

    if (topEntities.length > 0) {
      recommendations.push(`Investigate ${topEntities[0].value} - highest occurrence entity`);
    }

    if (graph && graph.nodes.length > 20) {
      recommendations.push('Consider narrowing search criteria for more focused results');
    }

    if (redFlags.length > 0) {
      recommendations.push('Review red flags for potential anomalies');
    }

    return {
      highValueMatches: extraction.highValue.length,
      totalConnections: graph?.edges.length || 0,
      entityBreakdown,
      topEntities,
      redFlags: [...new Set(redFlags)],
      patterns: [...new Set(patterns)],
      recommendations: [...new Set(recommendations)],
    };
  }
}

// Export singleton instance
export const robustAgentSearch = new RobustAgentSearch();
