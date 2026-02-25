/**
 * Report Generation API Endpoint
 * Generates comprehensive investigation reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { enhancedReportGenerator, ReportData } from '@/lib/report-generator-enhanced';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      query,
      results,
      insights,
      correlationGraph,
      extraction,
      metadata,
      options = {}
    } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Query is required' },
        { status: 400 }
      );
    }

    logger.info('Generating PDF report', { 
      query, 
      resultsCount: results?.length || 0,
      graphNodes: correlationGraph?.nodes?.length || 0
    });

    // Prepare report data with all fields
    const reportData: ReportData = {
      query,
      extraction: extraction || null,
      results: results || [],
      correlationGraph: correlationGraph || null,
      insights: insights || null,
      metadata: {
        searchTime: metadata?.searchTime || 0,
        entitiesSearched: metadata?.entitiesSearched || 0,
        iterationsPerformed: metadata?.iterationsPerformed || 0,
        totalRecordsSearched: metadata?.totalRecordsSearched || 0,
        apiCalls: metadata?.apiCalls || 0,
        totalFetched: metadata?.totalFetched || results?.length || 0,
        v2Enabled: metadata?.v2Enabled || false,
      },
    };

    // Generate PDF
    const pdfBuffer = await enhancedReportGenerator.generateReport(reportData);

    logger.info('PDF report generated successfully', { 
      size: pdfBuffer.length,
      pages: Math.ceil(pdfBuffer.length / 3000) // Rough estimate
    });

    // Return PDF as response
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="investigation_report_${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    logger.error('Failed to generate PDF report', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate report' 
      },
      { status: 500 }
    );
  }
}

// GET endpoint for health check
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Report generation API is available',
    timestamp: new Date().toISOString(),
  });
}
