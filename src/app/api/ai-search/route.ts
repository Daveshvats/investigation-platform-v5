import { NextRequest, NextResponse } from 'next/server';
import { OptimizedSearchEngine } from '@/lib/optimized-search';
import { createLogger } from '@/lib/logger';
import { shouldUseLocalAI } from '@/lib/local-ai-client';

const logger = createLogger('OptimizedSearch-API');

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    return NextResponse.json({
      success: true,
      config: {
        aiMode: shouldUseLocalAI() ? 'local' : 'cloud',
        features: {
          parallelProcessing: true,
          intelligentCaching: true,
          queryPrioritization: true,
          earlyTermination: true,
          csvExport: true,
        },
        optimizations: {
          maxConcurrentSearches: 5,
          cacheEnabled: true,
          priorityLevels: ['P1', 'P2', 'P3', 'P4', 'P5'],
          earlyTerminationThreshold: 3,
        }
      }
    });
  }

  return NextResponse.json({ success: true });
}

/**
 * POST /api/ai-search
 * 
 * Optimized AI Search with:
 * 1. Parallel Processing - Concurrent search execution
 * 2. Intelligent Caching - LRU cache with semantic-aware TTL
 * 3. Query Prioritization - Search high-selectivity criteria first
 * 4. Early Termination - Stop when sufficient exact matches found
 * 5. CSV Export - Export results to CSV
 * 
 * Request body:
 * - query: Search query string
 * - apiBaseUrl: Optional API base URL override
 * - bearerToken: Optional bearer token override
 * - options: Optional search options
 *   - engine: 'optimized' (default) | 'intelligent'
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { query, apiBaseUrl, bearerToken, options } = body as {
      query: string;
      apiBaseUrl?: string;
      bearerToken?: string;
      options?: {
        engine?: 'optimized' | 'intelligent';
      };
    };

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query is required' },
        { status: 400 }
      );
    }

    logger.info(`Optimized search for: "${query}"`);

    // Use optimized search engine
    const searchEngine = new OptimizedSearchEngine({
      apiBaseUrl: apiBaseUrl || process.env.API_BASE_URL || '',
      bearerToken: bearerToken || process.env.API_BEARER_TOKEN || '',
      progressCallback: (progress) => {
        logger.debug(`Progress: ${progress.stage} - ${progress.message}`);
      },
    });

    const result = await searchEngine.search(query.trim());

    logger.info(`Optimized search complete`, {
      criteriaCount: result.metadata.criteriaCount,
      totalResults: result.metadata.totalSearched,
      exactMatches: result.metadata.exactMatches,
      partialMatches: result.metadata.partialMatches,
      pagesFetched: result.metadata.pagesFetched,
      cacheHits: result.metadata.cacheHits,
      cacheMisses: result.metadata.cacheMisses,
      earlyTermination: result.metadata.earlyTermination,
      searchesSkipped: result.metadata.searchesSkipped,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(result);

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Search failed', error, { duration });

    let errorMessage = 'Search failed';
    let helpText: string[] = [];

    if (error instanceof Error) {
      errorMessage = error.message;

      if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to the database API';
        helpText = [
          'Check if your API server is running',
          'Verify the API URL in settings (sidebar)',
          'Test: curl "http://your-api-url/api/search?q=test"',
        ];
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
