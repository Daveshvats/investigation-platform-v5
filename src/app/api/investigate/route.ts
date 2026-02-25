/**
 * Investigation Platform V2 - Main API Route
 * Comprehensive investigation search with 2026-standard capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { hybridEntityExtractor } from '@/lib/v2/hybrid-entity-extractor';
import { semanticQueryParser } from '@/lib/v2/semantic-query-parser';
import { knowledgeGraphBuilder } from '@/lib/v2/knowledge-graph';
import { correlationEngine } from '@/lib/v2/correlation-engine';
import { aiAnalyst } from '@/lib/v2/insights/ai-analyst';

// ============================================================================
// TYPES
// ============================================================================

interface SearchRequest {
  query: string;
  options?: {
    maxIterations?: number;
    extractEntities?: boolean;
    buildGraph?: boolean;
    analyzeCorrelations?: boolean;
    generateReport?: boolean;
    includeRawData?: boolean;
  };
}

interface SearchProgress {
  phase: string;
  message: string;
  progress: number;
  timestamp: Date;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const progressEvents: SearchProgress[] = [];

  try {
    const body: SearchRequest = await request.json();
    const { query, options = {} } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Default options
    const config = {
      maxIterations: options.maxIterations || 3,
      extractEntities: options.extractEntities !== false,
      buildGraph: options.buildGraph !== false,
      analyzeCorrelations: options.analyzeCorrelations !== false,
      generateReport: options.generateReport !== false,
      includeRawData: options.includeRawData || false,
    };

    // Phase 1: Parse Query
    progressEvents.push({
      phase: 'parsing',
      message: 'Parsing query...',
      progress: 5,
      timestamp: new Date(),
    });

    const parsedQuery = await semanticQueryParser.parse(query);

    // Phase 2: Extract Entities
    progressEvents.push({
      phase: 'extraction',
      message: `Extracting entities from query...`,
      progress: 15,
      timestamp: new Date(),
    });

    const entities = config.extractEntities
      ? await hybridEntityExtractor.extract(query)
      : [];

    // Merge with parsed entities
    const allEntities = [...entities, ...parsedQuery.entities];

    // Phase 3: Search Database (simulated for now)
    progressEvents.push({
      phase: 'searching',
      message: `Searching database for ${allEntities.filter(e => e.priority === 'HIGH').length} high-priority entities...`,
      progress: 30,
      timestamp: new Date(),
    });

    // Simulated search results - in production, this would query actual database
    const searchResults = await simulateDatabaseSearch(allEntities, config.maxIterations);

    // Phase 4: Build Knowledge Graph
    progressEvents.push({
      phase: 'graph_building',
      message: 'Building knowledge graph...',
      progress: 50,
      timestamp: new Date(),
    });

    let graphData = { nodes: [] as any[], edges: [] as any[] };
    let knowledgeGraph = null;

    if (config.buildGraph) {
      // Extract entities from search results
      const resultEntities: any[] = [];
      const resultRelationships: any[] = [];

      for (const result of searchResults) {
        const text = JSON.stringify(result.data);
        const extractedEntities = await hybridEntityExtractor.extract(text);
        resultEntities.push(...extractedEntities);
      }

      // Build graph
      knowledgeGraph = await knowledgeGraphBuilder.build(
        [...allEntities, ...resultEntities],
        resultRelationships
      );

      graphData = knowledgeGraph.toJSON();
    }

    // Phase 5: Correlation Analysis
    progressEvents.push({
      phase: 'correlation',
      message: 'Analyzing patterns and correlations...',
      progress: 70,
      timestamp: new Date(),
    });

    let correlationResult = {
      patterns: [],
      anomalies: [],
      insights: [],
      riskIndicators: [],
      timeline: [],
    };

    if (config.analyzeCorrelations && graphData.nodes.length > 0) {
      correlationResult = await correlationEngine.analyze(
        graphData.nodes,
        graphData.edges
      );
    }

    // Phase 6: Generate Report
    progressEvents.push({
      phase: 'reporting',
      message: 'Generating investigation report...',
      progress: 90,
      timestamp: new Date(),
    });

    let report = null;
    if (config.generateReport) {
      report = await aiAnalyst.generateReport({
        query,
        entities: allEntities,
        graphData,
        correlationResult,
      });
    }

    const processingTime = Date.now() - startTime;

    // Build response
    const response = {
      success: true,
      query,
      parsedQuery: {
        intent: parsedQuery.intent,
        entities: allEntities.map(e => ({
          type: e.type,
          value: e.value,
          priority: e.priority,
          confidence: e.confidence,
        })),
        filters: parsedQuery.filters,
        timeRange: parsedQuery.timeRange,
        suggestedActions: parsedQuery.suggestedActions,
      },
      extraction: {
        totalEntities: allEntities.length,
        highPriority: allEntities.filter(e => e.priority === 'HIGH').length,
        mediumPriority: allEntities.filter(e => e.priority === 'MEDIUM').length,
        lowPriority: allEntities.filter(e => e.priority === 'LOW').length,
        entityBreakdown: allEntities.reduce((acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      search: {
        iterations: 1,
        resultsCount: searchResults.length,
        dataSources: ['local_database'],
      },
      graph: {
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        clusters: knowledgeGraph?.clusters.size || 0,
        avgConnectivity: graphData.nodes.length > 0
          ? (graphData.edges.length * 2) / graphData.nodes.length
          : 0,
      },
      correlation: {
        patternsCount: correlationResult.patterns.length,
        anomaliesCount: correlationResult.anomalies.length,
        insightsCount: correlationResult.insights.length,
        riskIndicatorsCount: correlationResult.riskIndicators.length,
        topInsights: correlationResult.insights.slice(0, 5).map((i: any) => ({
          title: i.title,
          description: i.description,
          confidence: i.confidence,
        })),
        topRisks: correlationResult.riskIndicators.slice(0, 5).map((r: any) => ({
          type: r.type,
          severity: r.severity,
          score: r.score,
        })),
      },
      report: report ? {
        id: report.id,
        title: report.title,
        classification: report.classification,
        status: report.status,
        executiveSummary: report.executiveSummary,
        overallRisk: report.riskAssessment.overallRisk,
        riskScore: report.riskAssessment.riskScore,
        recommendations: report.recommendations.slice(0, 5),
      } : null,
      timeline: correlationResult.timeline.slice(0, 20).map((t: any) => ({
        timestamp: t.timestamp,
        type: t.type,
        description: t.description,
      })),
      metadata: {
        processingTime,
        modelUsed: report?.metadata.modelUsed || 'local',
        timestamp: new Date(),
        version: '2.0.0',
      },
      progress: progressEvents,
    };

    if (config.includeRawData) {
      (response as any).rawData = {
        entities: allEntities,
        searchResults: searchResults.slice(0, 10),
        graphNodes: graphData.nodes,
        graphEdges: graphData.edges,
        fullReport: report,
      };
    }

    return NextResponse.json(response);

  } catch (error: unknown) {
    console.error('Search API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// SIMULATED DATABASE SEARCH
// ============================================================================

async function simulateDatabaseSearch(
  entities: any[],
  maxIterations: number
): Promise<any[]> {
  // In production, this would query actual SQLite database via Prisma
  // For now, return simulated results based on entity types

  const results: any[] = [];

  for (const entity of entities.filter((e: any) => e.priority === 'HIGH')) {
    // Simulate finding related records
    if (entity.type === 'phone') {
      results.push({
        id: `tel_${entity.normalizedValue}`,
        tableName: 'telecom_records',
        data: {
          phone: entity.value,
          name: 'Simulated Name',
          address: 'Simulated Address, City',
          activationDate: '2023-01-15',
          status: 'active',
        },
        matchedFields: ['phone'],
        score: 0.95,
      });
    }

    if (entity.type === 'email') {
      results.push({
        id: `email_${entity.normalizedValue}`,
        tableName: 'person_records',
        data: {
          email: entity.value,
          name: 'Simulated User',
          registrations: ['Platform A', 'Platform B'],
        },
        matchedFields: ['email'],
        score: 0.92,
      });
    }

    if (entity.type === 'pan_number') {
      results.push({
        id: `pan_${entity.normalizedValue}`,
        tableName: 'financial_records',
        data: {
          pan: entity.value,
          name: 'Simulated Tax Payer',
          linkedAccounts: 3,
          lastFiling: '2024-07-31',
        },
        matchedFields: ['pan_number'],
        score: 0.98,
      });
    }

    if (entity.type === 'vehicle_number') {
      results.push({
        id: `veh_${entity.normalizedValue}`,
        tableName: 'vehicle_registrations',
        data: {
          registration: entity.value,
          owner: 'Simulated Owner',
          vehicleType: 'Four Wheeler',
          registrationDate: '2022-03-15',
        },
        matchedFields: ['vehicle_number'],
        score: 0.95,
      });
    }
  }

  // Limit results
  return results.slice(0, 100);
}

// ============================================================================
// GET HANDLER FOR STATUS
// ============================================================================

export async function GET() {
  return NextResponse.json({
    status: 'operational',
    version: '2.0.0',
    capabilities: [
      'hybrid_entity_extraction',
      'semantic_query_parsing',
      'knowledge_graph_construction',
      'correlation_analysis',
      'ai_powered_insights',
      'pdf_report_generation',
    ],
    models: {
      ner: 'hybrid (regex + local)',
      llm: 'ollama-local',
      embeddings: 'available',
    },
    timestamp: new Date(),
  });
}
