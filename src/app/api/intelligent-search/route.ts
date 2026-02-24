/**
 * Intelligent Search API Route
 * 
 * Uses 2026 best practices:
 * - GLiNER-style entity extraction
 * - Ollama local AI for reasoning
 * - Semantic similarity for deduplication
 */

import { NextRequest, NextResponse } from 'next/server';
import { createIntelligentSearch, type IntelligentSearchResponse } from '@/lib/intelligent-agent-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export interface SearchRequest {
  query: string;
  config?: {
    apiBaseUrl?: string;
    maxPages?: number;
    maxResults?: number;
    maxIterations?: number;
    useLocalAI?: boolean;
    aiModel?: string;
    deduplicationThreshold?: number;
  };
}

export interface SearchResponse {
  success: boolean;
  data?: IntelligentSearchResponse;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<SearchResponse>> {
  try {
    const body: SearchRequest = await request.json();

    if (!body.query || typeof body.query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Query is required' },
        { status: 400 }
      );
    }

    // Create search engine with config
    const searchEngine = createIntelligentSearch({
      apiBaseUrl: body.config?.apiBaseUrl || process.env.SEARCH_API_URL,
      maxPages: body.config?.maxPages || 500,
      maxResults: body.config?.maxResults || 50000,
      maxIterations: body.config?.maxIterations || 3,
      useLocalAI: body.config?.useLocalAI ?? true,
      aiModel: body.config?.aiModel || 'qwen2.5:3b',
      deduplicationThreshold: body.config?.deduplicationThreshold || 0.95,
    });

    // Execute search
    const result = await searchEngine.search(body.query);

    return NextResponse.json({
      success: result.success,
      data: result,
    });

  } catch (error) {
    console.error('Intelligent search error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<SearchResponse>> {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json(
      { success: false, error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  try {
    // Create search engine with default config
    const searchEngine = createIntelligentSearch({
      apiBaseUrl: process.env.SEARCH_API_URL,
      useLocalAI: true,
      aiModel: 'qwen3:4b',
    });

    // Execute search
    const result = await searchEngine.search(query);

    return NextResponse.json({
      success: result.success,
      data: result,
    });

  } catch (error) {
    console.error('Intelligent search error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
