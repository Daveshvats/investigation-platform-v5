/**
 * Investigation API Route
 * Handles streaming investigation requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { investigationAgent, type InvestigationStep, type InvestigationResult } from '@/lib/investigation-agent';

export const maxDuration = 300; // 5 minutes max

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, stream = false } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // For non-streaming requests
    if (!stream) {
      await investigationAgent.initialize();
      const result = await investigationAgent.investigate(query);
      return NextResponse.json(result);
    }

    // For streaming requests
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Initialize agent
          await investigationAgent.initialize();
          
          // Send initial message
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'start', query })}\n\n`)
          );

          // Run investigation with progress callbacks
          const result = await investigationAgent.investigate(query, (step: InvestigationStep) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'step', step })}\n\n`)
            );
          });

          // Send final result
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`)
          );

          controller.close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              error: error instanceof Error ? error.message : 'Unknown error' 
            })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Investigation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
