import { NextRequest, NextResponse } from 'next/server';
import type { CrossReferencedResult } from '@/lib/optimized-search';

interface CSVExportRequest {
  results: CrossReferencedResult[];
  query: string;
  metadata?: {
    criteriaCount: number;
    totalSearched: number;
    exactMatches: number;
    partialMatches: number;
    duration: number;
  };
}

/**
 * Convert results to CSV format
 */
function resultsToCSV(results: CrossReferencedResult[], query: string): string {
  if (results.length === 0) {
    return 'No results to export';
  }

  // Collect all unique fields from all records
  const allFields = new Set<string>();
  results.forEach(r => {
    Object.keys(r.record).forEach(key => allFields.add(key));
  });

  // Define standard fields order
  const standardFields = [
    'name', 'full_name', 'person_name', 'customer_name', 'suspect_name',
    'phone', 'mobile', 'phone_number', 'contact',
    'email', 'email_id', 'email_address',
    'address', 'city', 'state', 'location',
    'pan_number', 'pan', 'aadhaar', 'id_number',
    'account_number', 'account',
    'company', 'company_name', 'firm_name',
    'amount', 'transaction_amount', 'value',
    'date', 'transaction_date', 'created_at',
  ];

  // Sort fields: standard fields first, then alphabetically
  const sortedFields = Array.from(allFields).sort((a, b) => {
    const aIndex = standardFields.findIndex(f => a.toLowerCase().includes(f));
    const bIndex = standardFields.findIndex(f => b.toLowerCase().includes(f));
    
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

  // CSV Header
  const headers = [
    'Rank',
    'Table',
    'Match Score',
    'Match Count',
    'Is Exact Match',
    'Matched Criteria',
    ...sortedFields,
  ];

  // CSV Rows
  const rows = results.map((result, index) => {
    const matchedCriteria = result.matchDetails.join('; ');
    const recordValues = sortedFields.map(field => {
      const value = result.record[field];
      if (value === null || value === undefined) return '';
      const strValue = String(value);
      // Escape quotes and wrap in quotes if contains comma or quote
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    });

    return [
      index + 1,
      result.table,
      Math.round(result.matchScore),
      result.matchCount,
      result.isExactMatch ? 'Yes' : 'No',
      `"${matchedCriteria.replace(/"/g, '""')}"`,
      ...recordValues,
    ];
  });

  // Build CSV
  const csvLines = [
    `# Search Query: ${query}`,
    `# Exported: ${new Date().toISOString()}`,
    `# Total Results: ${results.length}`,
    `# Exact Matches: ${results.filter(r => r.isExactMatch).length}`,
    '',
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ];

  return csvLines.join('\n');
}

/**
 * POST /api/export/csv
 * 
 * Export search results to CSV format
 */
export async function POST(request: NextRequest) {
  try {
    const body: CSVExportRequest = await request.json();
    const { results, query } = body;

    if (!results || !Array.isArray(results)) {
      return NextResponse.json(
        { success: false, error: 'Results array is required' },
        { status: 400 }
      );
    }

    const csv = resultsToCSV(results, query);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeQuery = query.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `search_results_${safeQuery}_${timestamp}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('CSV export error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/export/csv
 * 
 * Get CSV export status and options
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    format: 'CSV',
    features: {
      includeMatchScore: true,
      includeMatchCount: true,
      includeExactMatchFlag: true,
      includeMatchedCriteria: true,
      allRecordFields: true,
    },
    options: {
      maxResults: 10000,
      encoding: 'utf-8',
      delimiter: ',',
      quoteChar: '"',
    },
  });
}
