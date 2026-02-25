/**
 * PDF Report Generation API Endpoint
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
      extraction,
      results,
      correlationGraph,
      insights,
      metadata,
    } = body;

    if (!query || !results) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: query, results' },
        { status: 400 }
      );
    }

    logger.info('Generating PDF report', { 
      query, 
      resultsCount: results.length,
      graphNodes: correlationGraph?.nodes?.length || 0
    });

    const reportData: ReportData = {
      query,
      extraction,
      results,
      correlationGraph,
      insights,
      metadata: {
        searchTime: metadata?.searchTime || 0,
        entitiesSearched: metadata?.entitiesSearched || 0,
        iterationsPerformed: metadata?.iterationsPerformed || 0,
        totalRecordsSearched: metadata?.totalRecordsSearched || 0,
        apiCalls: metadata?.apiCalls || 0,
        totalFetched: metadata?.totalFetched || 0,
        v2Enabled: metadata?.v2Enabled || false,
      },
    };

    const pdfBuffer = await enhancedReportGenerator.generateReport(reportData);

    logger.info('PDF report generated successfully', { 
      size: pdfBuffer.length 
    });

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
