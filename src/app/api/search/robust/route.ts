/**
 * Robust Search API Endpoint - V2 Enhanced
 * Calls the actual backend API with iterative lead discovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { entityExtractor } from '@/lib/entity-extractor';
import { logger } from '@/lib/logger';
import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

interface SearchRequest {
  query: string;
  apiBaseUrl?: string;
  bearerToken?: string;
  options?: {
    maxIterations?: number;
    maxResultsPerEntity?: number;
    includeGraph?: boolean;
    generateReport?: boolean;
    enableV2?: boolean;
    analyzeCorrelations?: boolean;
  };
}

interface Entity {
  type: string;
  value: string;
  originalText: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
}

interface SearchResult {
  id: string;
  table: string;
  tableName: string;
  record: Record<string, unknown>;
  data: Record<string, unknown>;
  matchedFields: string[];
  matchedEntities: string[];
  score: number;
}

// ============================================================================
// API HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const endTimer = logger.time('Search Request');

  try {
    const body: SearchRequest = await request.json();
    const { query, apiBaseUrl = 'http://localhost:8080', bearerToken, options = {} } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Query is required' },
        { status: 400 }
      );
    }

    logger.info('Received search request', { query, options, apiBaseUrl });

    // Configure V2 features
    const enableV2 = options.enableV2 !== false;
    const maxIterations = options.maxIterations || 5;
    const maxResultsPerEntity = options.maxResultsPerEntity || 100;
    
    // Safety limit: maximum total entities to search to prevent runaway loops
    const MAX_TOTAL_ENTITIES = 50;

    // Columns to skip when extracting entities (noise/metadata columns)
    const SKIP_COLUMNS = new Set([
      'global_id',
      's_indx',
      'is_deleted',
      'updated_at',
      'created_at',
      'deleted_at',
      'id',
      '_id',
      'uuid',
      'timestamp',
      'version',
      'rowid',
      'pk',
    ]);

    // Create axios instance for backend API
    const apiClient = axios.create({
      baseURL: apiBaseUrl,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        ...(bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {}),
      },
    });

    // Step 1: Extract entities from query using regex
    logger.debug('Extracting entities from query');
    const extraction = entityExtractor.extract(query);

    logger.info('Entities extracted', {
      highValue: extraction.highValue.length,
      mediumValue: extraction.mediumValue.length,
      lowValue: extraction.lowValue.length,
      relationships: extraction.relationships.length,
    });

    // Step 2: Iterative search with lead discovery
    const allResults: SearchResult[] = [];
    const searchedEntities = new Set<string>();
    let iterationsPerformed = 0;

    // Start with HIGH and MEDIUM value entities
    const searchQueue: Entity[] = [
      ...extraction.highValue,
      ...extraction.mediumValue,
    ];

    let totalApiCalls = 0;
    let totalFetched = 0;

    while (iterationsPerformed < maxIterations && searchQueue.length > 0) {
      iterationsPerformed++;
      logger.debug(`Search iteration ${iterationsPerformed}`, { queueSize: searchQueue.length });

      const entitiesToSearch = [...searchQueue];
      searchQueue.length = 0; // Clear queue for next iteration

      for (const entity of entitiesToSearch) {
        const entityKey = `${entity.type}:${entity.value}`;

        if (searchedEntities.has(entityKey)) continue;
        searchedEntities.add(entityKey);

        logger.debug(`Searching for entity`, { type: entity.type, value: entity.value });

        try {
          // Call the backend API to search for this entity
          const response = await apiClient.get('/api/search', {
            params: {
              q: entity.value,
              limit: maxResultsPerEntity,
            },
          });

          totalApiCalls++;
          
          // Handle various response formats from backend
          let searchResults: any[] = [];
          const data = response.data;
          
          if (Array.isArray(data)) {
            // Direct array response
            searchResults = data;
          } else if (data?.results) {
            if (Array.isArray(data.results)) {
              // results is an array
              searchResults = data.results;
            } else if (typeof data.results === 'object') {
              // results is an object with table names as keys (like { "b2b": [...], "b2b_20260126": [...] })
              for (const [tableName, records] of Object.entries(data.results)) {
                if (Array.isArray(records)) {
                  for (const record of records) {
                    searchResults.push({ ...record, _source_table: tableName });
                  }
                }
              }
            }
          } else if (data?.records && Array.isArray(data.records)) {
            searchResults = data.records;
          } else if (data?.data && Array.isArray(data.data)) {
            searchResults = data.data;
          } else if (data?.items && Array.isArray(data.items)) {
            searchResults = data.items;
          } else {
            // Log the actual structure for debugging
            logger.debug('Unknown response structure', { 
              keys: Object.keys(data || {}),
              sample: JSON.stringify(data).substring(0, 500)
            });
          }
          
          totalFetched += searchResults.length;

          logger.debug('Backend search response', { 
            entityValue: entity.value, 
            resultCount: searchResults.length,
            responseKeys: Object.keys(data || {})
          });

          // Process results
          for (const result of searchResults) {
            const tableName = result._source_table || result.table_name || result.tableName || result._table || 'unknown';
            const recordData = result.data || result;
            
            // Find matched fields
            const matchedFields: string[] = [];
            const searchValue = entity.value.toLowerCase();
            
            for (const [key, value] of Object.entries(recordData)) {
              if (String(value).toLowerCase().includes(searchValue)) {
                matchedFields.push(key);
              }
            }

            const searchResult: SearchResult = {
              id: `${tableName}_${recordData.id || Math.random().toString(36).substr(2, 9)}`,
              table: tableName,
              tableName,
              record: recordData,
              data: recordData,
              matchedFields,
              matchedEntities: [entity.value],
              score: calculateScore(recordData, entity, matchedFields),
            };
            
            allResults.push(searchResult);
          }

          // Lead Discovery: Extract new entities from results for next iteration
          if (iterationsPerformed < maxIterations && searchedEntities.size < MAX_TOTAL_ENTITIES) {
            for (const result of searchResults) {
              const recordData = result.data || result;
              
              // Filter out noise/metadata columns before extracting entities
              const filteredData: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(recordData)) {
                const keyLower = key.toLowerCase();
                
                // Skip noise columns
                if (SKIP_COLUMNS.has(keyLower) || keyLower.endsWith('_id') || keyLower.startsWith('_')) {
                  continue;
                }
                
                // Skip values that look like database IDs or noise
                if (typeof value === 'number') {
                  // Skip very large numbers (likely IDs)
                  if (Math.abs(value) > 9999999999) continue;
                  // Skip negative numbers that are likely artifacts
                  if (value < 0) continue;
                  // Skip floats that are likely IDs (like 700001.0)
                  if (!Number.isInteger(value)) continue;
                }
                
                // Skip string values that look like scientific notation or IDs
                if (typeof value === 'string') {
                  // Skip scientific notation
                  if (/e\+?\d+$/i.test(value)) continue;
                  // Skip very long numbers (likely IDs)
                  if (/^\d{15,}$/.test(value.trim())) continue;
                  // Skip negative number strings
                  if (/^-\d+$/.test(value.trim())) continue;
                }
                
                filteredData[key] = value;
              }
              
              const dataString = JSON.stringify(filteredData);
              const newExtraction = entityExtractor.extract(dataString);

              // Add HIGH and MEDIUM value entities to search queue
              for (const newEntity of [...newExtraction.highValue, ...newExtraction.mediumValue]) {
                const newKey = `${newEntity.type}:${newEntity.value}`;
                
                // Skip if already searched, already in queue, or hit safety limit
                if (searchedEntities.size >= MAX_TOTAL_ENTITIES) {
                  logger.debug('Reached max entities limit, stopping discovery');
                  break;
                }
                
                if (!searchedEntities.has(newKey) && !searchQueue.some(e => `${e.type}:${e.value}` === newKey)) {
                  searchQueue.push(newEntity);
                  logger.debug('Discovered new lead', { type: newEntity.type, value: newEntity.value });
                }
              }
            }
          }

        } catch (error: any) {
          logger.error(`Search failed for entity: ${entity.value}`, error);
          // Continue with other entities even if one fails
        }
      }

      logger.info(`Iteration ${iterationsPerformed} complete`, {
        resultsSoFar: allResults.length,
        newLeadsDiscovered: searchQueue.length,
      });
    }

    // Step 3: Filter results with LOW value entities (like location, company names)
    let filteredResults = allResults;

    if (extraction.lowValue.length > 0) {
      filteredResults = allResults.filter(result => {
        const dataString = JSON.stringify(result.data).toLowerCase();
        return extraction.lowValue.some(entity => 
          dataString.includes(entity.value.toLowerCase())
        );
      });

      // If filtering removes all results, keep original results
      if (filteredResults.length === 0 && allResults.length > 0) {
        logger.info('Filtering removed all results, keeping unfiltered');
        filteredResults = allResults;
      }
    }

    // Deduplicate results by id
    const seenIds = new Set<string>();
    filteredResults = filteredResults.filter(result => {
      if (seenIds.has(result.id)) return false;
      seenIds.add(result.id);
      return true;
    });

    // Step 4: Build correlation graph
    const correlationGraph = buildCorrelationGraph(filteredResults, enableV2);

    // Step 5: Generate insights
    const insights = generateInsights(filteredResults, extraction, correlationGraph, enableV2);

    const searchTime = Date.now() - startTime;
    endTimer();

    const response = {
      success: true,
      query,
      extraction: {
        entities: extraction.entities,
        highValue: extraction.highValue,
        mediumValue: extraction.mediumValue,
        lowValue: extraction.lowValue,
        relationships: extraction.relationships,
        extractionTime: extraction.extractionTime,
      },
      filteredResults: filteredResults.slice(0, 500),
      results: filteredResults.slice(0, 500),
      correlationGraph,
      insights,
      v2Insights: enableV2 ? {
        patterns: insights.patterns.length,
        anomalies: insights.redFlags.length,
        riskIndicators: insights.recommendations.length,
      } : undefined,
      metadata: {
        searchTime,
        entitiesSearched: searchedEntities.size,
        iterationsPerformed,
        totalRecordsSearched: allResults.length,
        apiCalls: totalApiCalls,
        totalFetched,
        v2Enabled: enableV2,
      },
    };

    logger.info('Search completed', {
      resultsCount: filteredResults.length,
      searchTime,
      v2Enabled: enableV2,
      iterations: iterationsPerformed,
      apiCalls: totalApiCalls,
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Search request failed', error);

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateScore(record: any, entity: Entity, matchedFields: string[]): number {
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

function buildCorrelationGraph(results: SearchResult[], useV2: boolean = true) {
  const nodes: any[] = [];
  const edges: any[] = [];
  const nodeMap = new Map<string, any>();
  
  // Columns to skip when extracting entities for graph
  const skipColumns = new Set([
    'global_id', 's_indx', 'is_deleted', 'updated_at', 'created_at',
    'deleted_at', 'id', '_id', 'uuid', 'timestamp', 'version', 'rowid', 'pk',
  ]);

  for (const result of results) {
    // Filter out noise columns before extracting entities
    const filteredData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.data)) {
      const keyLower = key.toLowerCase();
      
      // Skip noise columns
      if (skipColumns.has(keyLower) || keyLower.endsWith('_id') || keyLower.startsWith('_')) {
        continue;
      }
      
      // Skip values that look like database IDs or noise
      if (typeof value === 'number') {
        if (Math.abs(value) > 9999999999) continue;
        if (value < 0) continue;
        if (!Number.isInteger(value)) continue;
      }
      
      if (typeof value === 'string') {
        if (/e\+?\d+$/i.test(value)) continue;
        if (/^\d{15,}$/.test(value.trim())) continue;
        if (/^-\d+$/.test(value.trim())) continue;
      }
      
      filteredData[key] = value;
    }
    
    const dataString = JSON.stringify(filteredData);
    const extracted = entityExtractor.extract(dataString);

    for (const entity of extracted.entities) {
      const nodeId = `${entity.type}:${entity.value}`;

      if (!nodeMap.has(nodeId)) {
        const node = {
          id: nodeId,
          label: entity.value,
          type: mapEntityType(entity.type),
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

    // Create edges with V2 enhancements
    const entityIds = extracted.entities.map(e => `${e.type}:${e.value}`);
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
  }

  // Update edge strengths (V2 enhancement)
  for (const edge of edges) {
    if (edge.weight >= 5) {
      edge.strength = 'strong';
      edge.confidence = 0.85;
    } else if (edge.weight >= 2) {
      edge.strength = 'moderate';
      edge.confidence = 0.7;
    }
  }

  return { nodes, edges };
}

function generateInsights(results: SearchResult[], extraction: any, graph: any, useV2: boolean = true) {
  const entityBreakdown: Record<string, number> = {};
  const redFlags: string[] = [];
  const patterns: string[] = [];
  const recommendations: string[] = [];

  for (const entity of extraction.entities) {
    entityBreakdown[entity.type] = (entityBreakdown[entity.type] || 0) + 1;
  }

  const topEntities = graph.nodes
    .sort((a: any, b: any) => b.occurrences - a.occurrences)
    .slice(0, 10)
    .map((n: any) => ({
      value: n.value,
      type: n.entityType,
      occurrences: n.occurrences,
    }));

  // V2 enhanced red flags
  const highConnectionNodes = graph.nodes.filter((n: any) => n.connections.length > 3);
  if (highConnectionNodes.length > 0) {
    redFlags.push(`${highConnectionNodes.length} entities with unusually high connections detected`);
  }

  const crossTableEntities = graph.nodes.filter((n: any) => n.sources.length > 1);
  if (crossTableEntities.length > 0) {
    redFlags.push(`${crossTableEntities.length} entities found across multiple data sources`);
  }

  // Phone number reuse
  const phoneNodes = graph.nodes.filter((n: any) => n.entityType === 'phone');
  const reusedPhones = phoneNodes.filter((n: any) => n.occurrences > 1);
  if (reusedPhones.length > 0) {
    redFlags.push(`${reusedPhones.length} phone numbers associated with multiple records`);
  }

  // V2 patterns
  if (extraction.highValue.length > 0) {
    patterns.push(`Search initiated with ${extraction.highValue.length} unique identifier(s)`);
  }

  if (results.length > 10) {
    patterns.push(`Large result set (${results.length} records) indicates potential data correlation`);
  }

  // V2 recommendations
  if (topEntities.length > 0) {
    recommendations.push(`Investigate "${topEntities[0].value}" - highest occurrence entity (${topEntities[0].occurrences} occurrences)`);
  }

  if (redFlags.length > 0) {
    recommendations.push('Review detected red flags for potential anomalies');
  }

  if (results.length > 50) {
    recommendations.push('Consider narrowing search criteria for more focused results');
  }

  return {
    highValueMatches: extraction.highValue.length,
    totalConnections: graph.edges.length,
    entityBreakdown,
    topEntities,
    redFlags,
    patterns,
    recommendations,
  };
}

function mapEntityType(entityType: string): string {
  const mapping: Record<string, string> = {
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
  };
  return mapping[entityType] || 'other';
}
