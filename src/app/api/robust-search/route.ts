import { NextRequest, NextResponse } from 'next/server';
import { RobustAgentSearchEngine } from '@/lib/robust-agent-search';
import { createLogger } from '@/lib/logger';
import { shouldUseLocalAI } from '@/lib/local-ai-client';

const logger = createLogger('RobustAgentSearch-API');

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for long searches

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    return NextResponse.json({
      success: true,
      config: {
        aiMode: shouldUseLocalAI() ? 'local' : 'cloud',
        features: {
          fullPagination: true,
          cursorSupport: true,
          correlationGraph: true,
          resultFiltering: true,
          csvExport: true,
        },
        pagination: {
          maxPages: 1000,
          pageSize: 100,
          maxResults: 50000,
        },
      },
    });
  }

  return NextResponse.json({ success: true });
}

/**
 * POST /api/robust-search
 * 
 * Robust Agent Search with:
 * 1. Query Parsing - Extract primary (search) and secondary (filter) criteria
 * 2. Full Pagination - Get ALL results using cursor when has_more=true
 * 3. Result Filtering - Filter results based on secondary criteria
 * 4. Correlation Graph - Build entity connection graph
 * 5. Insights Generation - AI-powered analysis
 * 
 * Request body:
 * - query: Search query string (e.g., "rahul sharma from delhi having no. 9876543210")
 * - apiBaseUrl: Optional API base URL override
 * - bearerToken: Optional bearer token override
 * 
 * Response:
 * - query: Parsed query with primary/secondary criteria
 * - allFetchedResults: ALL results from pagination
 * - filteredResults: Results matching secondary criteria
 * - correlationGraph: Entity connection graph for visualization
 * - insights: Summary and recommendations
 * - metadata: Search statistics
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { query, apiBaseUrl, bearerToken } = body as {
      query: string;
      apiBaseUrl?: string;
      bearerToken?: string;
    };

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query is required' },
        { status: 400 }
      );
    }

    logger.info(`Robust agent search for: "${query}"`);

    const searchEngine = new RobustAgentSearchEngine({
      apiBaseUrl: apiBaseUrl || process.env.API_BASE_URL || '',
      bearerToken: bearerToken || process.env.API_BEARER_TOKEN || '',
      progressCallback: (progress) => {
        logger.info(`Progress: ${progress.stage} - ${progress.message}`);
      },
    });

    const result = await searchEngine.search(query.trim());

    logger.info(`Robust search complete`, {
      duration: result.metadata.duration,
      apiCalls: result.metadata.apiCalls,
      cursorsUsed: result.metadata.cursorsUsed.length,
      totalFetched: result.totalFetched,
      totalFiltered: result.totalFiltered,
      correlationNodes: result.correlationGraph.nodes.length,
      correlationEdges: result.correlationGraph.edges.length,
    });

    return NextResponse.json(result);

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Robust search failed', error, { duration });

    let errorMessage = 'Search failed';
    const helpText: string[] = [];

    if (error instanceof Error) {
      errorMessage = error.message;

      if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to the database API';
        helpText.push(
          'Check if your API server is running',
          'Verify the API URL in settings',
          'Test: curl "http://your-api-url/api/search?q=test"'
        );
      }

      if (errorMessage.includes('timeout')) {
        errorMessage = 'Search timed out';
        helpText.push(
          'The search took too long',
          'Try with more specific criteria',
          'Check your network connection'
        );
      }
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
      helpText: helpText.length > 0 ? helpText : undefined,
      duration,
    }, { status: 500 });
  }
}
