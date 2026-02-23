import { NextRequest, NextResponse } from 'next/server';
import {
  profileTable,
  findTableRelationships,
  type TableProfile,
} from '@/lib/smart-field-detection';
import { getAIEngine } from '@/lib/ai-investigation-engine';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { tables, analysisType, query } = body as {
      tables: Array<{ name: string; records: Record<string, unknown>[] }>;
      analysisType?: 'full' | 'profile' | 'insights' | 'narrative' | 'query' | 'redflags';
      query?: string;
    };

    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No tables provided for analysis' },
        { status: 400 }
      );
    }

    // Step 1: Profile all tables
    const profiles: TableProfile[] = tables.map(t => profileTable(t.name, t.records));
    
    // Step 2: Find relationships between tables
    const relationships = findTableRelationships(profiles);

    // Step 3: Get AI engine
    const aiEngine = getAIEngine();

    // Step 4: Perform requested analysis
    let analysisResult: any = {
      profiles,
      relationships,
    };

    if (analysisType === 'profile' || analysisType === 'full') {
      // Return profiling results
      analysisResult.tableSummaries = profiles.map(p => ({
        name: p.tableName,
        recordCount: p.totalRecords,
        purpose: p.detectedPurpose,
        keyFields: p.keyFields,
        fieldTypes: p.fields.reduce((acc, f) => {
          acc[f.fieldName] = {
            type: f.detectedType,
            confidence: f.confidence,
            fillRate: ((f.statistics.filled / f.statistics.total) * 100).toFixed(1) + '%',
          };
          return acc;
        }, {} as Record<string, any>),
      }));
    }

    if (analysisType === 'insights' || analysisType === 'full') {
      // Generate insights for each table
      const allInsights: any[] = [];
      
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const profile = profiles[i];
        
        // Analyze sample records
        const sampleRecords = table.records.slice(0, 5);
        for (const record of sampleRecords) {
          try {
            const insights = await aiEngine.analyzeCase(table.name, record, profile);
            allInsights.push(...insights);
          } catch (e) {
            console.error('Insight generation error:', e);
          }
        }
      }
      
      analysisResult.insights = allInsights;
    }

    if (analysisType === 'narrative' || analysisType === 'full') {
      // Generate narrative for first table with data
      if (tables.length > 0 && tables[0].records.length > 0) {
        try {
          const narrative = await aiEngine.generateNarrative(
            tables[0].name,
            tables[0].records,
            profiles[0]
          );
          analysisResult.narrative = narrative;
        } catch (e) {
          console.error('Narrative generation error:', e);
        }
      }
    }

    if (analysisType === 'query' && query) {
      // Natural language query
      try {
        const queryResult = await aiEngine.queryData(query, tables);
        analysisResult.queryResult = queryResult;
      } catch (e) {
        console.error('Query error:', e);
        analysisResult.queryResult = {
          answer: 'Error processing query',
          relevantRecords: [],
          suggestedQueries: [],
        };
      }
    }

    if (analysisType === 'redflags' || analysisType === 'full') {
      // Detect red flags
      try {
        const redFlags = await aiEngine.detectRedFlags(
          tables.map((t, i) => ({ ...t, profile: profiles[i] }))
        );
        analysisResult.redFlags = redFlags;
      } catch (e) {
        console.error('Red flag detection error:', e);
      }
    }

    if (analysisType === 'full') {
      // Cross-case analysis
      try {
        const crossAnalysis = await aiEngine.crossCaseAnalysis(
          tables.map((t, i) => ({ ...t, profile: profiles[i] }))
        );
        analysisResult.crossAnalysis = crossAnalysis;
      } catch (e) {
        console.error('Cross analysis error:', e);
      }

      // Suggested queries
      try {
        const suggestedQueries = await aiEngine.suggestQueries(
          tables.map((t, i) => ({ ...t, profile: profiles[i] }))
        );
        analysisResult.suggestedQueries = suggestedQueries;
      } catch (e) {
        console.error('Query suggestion error:', e);
      }
    }

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ...analysisResult,
      processingTime,
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        processingTime: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
