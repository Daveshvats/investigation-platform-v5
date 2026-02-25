'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Download, 
  FileJson, 
  FileSpreadsheet,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import type { GlobalSearchResponse } from '@/types/api';
import { addActivity } from '@/components/dashboard/user-activity-card';

interface SearchResultsProps {
  results: GlobalSearchResponse;
  query: string;
}

// Get all unique columns from records
function getAllColumns(records: Record<string, unknown>[]): string[] {
  const cols = new Set<string>();
  records.forEach(rec => Object.keys(rec).forEach(k => cols.add(k)));
  return Array.from(cols);
}

// Highlight text that matches search terms
function HighlightText({ text, searchTerms }: { text: string; searchTerms: string[] }) {
  if (!searchTerms.length || !text) return <>{text}</>;
  
  const lowerText = text.toLowerCase();
  const segments: Array<{ text: string; highlight: boolean }> = [];
  
  // Find all matches
  const matches: Array<{ start: number; end: number }> = [];
  for (const term of searchTerms) {
    const lower = term.toLowerCase();
    let pos = 0;
    while (true) {
      const idx = lowerText.indexOf(lower, pos);
      if (idx === -1) break;
      matches.push({ start: idx, end: idx + lower.length });
      pos = idx + 1;
    }
  }
  
  if (matches.length === 0) return <>{text}</>;
  
  // Sort and merge overlapping
  matches.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const m of matches) {
    if (merged.length === 0 || merged[merged.length - 1].end < m.start) {
      merged.push(m);
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, m.end);
    }
  }
  
  // Build segments
  let lastEnd = 0;
  for (const m of merged) {
    if (m.start > lastEnd) {
      segments.push({ text: text.substring(lastEnd, m.start), highlight: false });
    }
    segments.push({ text: text.substring(m.start, m.end), highlight: true });
    lastEnd = m.end;
  }
  if (lastEnd < text.length) {
    segments.push({ text: text.substring(lastEnd), highlight: false });
  }
  
  return (
    <>
      {segments.map((seg, i) => 
        seg.highlight ? (
          <mark key={i} className="bg-yellow-200 text-black px-0.5 rounded">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

// Record Detail Dialog Component
function RecordDialog({ 
  record, 
  columns, 
  open, 
  onOpenChange,
  searchTerms 
}: { 
  record: Record<string, unknown> | null;
  columns: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchTerms: string[];
}) {
  if (!record) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Record Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {columns.map((col) => (
            <div key={col} className="grid grid-cols-3 gap-2 py-2 border-b">
              <div className="font-mono text-sm text-muted-foreground">{col}</div>
              <div className="col-span-2 text-sm break-all">
                {record[col] !== null && record[col] !== undefined ? (
                  <HighlightText text={String(record[col])} searchTerms={searchTerms} />
                ) : (
                  <span className="text-muted-foreground italic">null</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SearchResults({ results, query }: SearchResultsProps) {
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Track activity when results are received
  useEffect(() => {
    if (results && query) {
      const totalResults = Object.values(results.results || {}).reduce((sum, arr) => sum + arr.length, 0);
      addActivity({
        type: 'search',
        description: `Searched for "${query}" (${totalResults} results)`,
      });
    }
  }, [results, query]);

  // Extract search terms for highlighting
  const searchTerms = useMemo(() => {
    const terms: string[] = [];
    const words = query.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length >= 2) terms.push(word);
    }
    return terms;
  }, [query]);

  const tables = useMemo(() => {
    if (!results?.results) return [];
    return Object.keys(results.results);
  }, [results]);

  const totalResults = useMemo(() => {
    if (!results?.results) return 0;
    return Object.values(results.results).reduce((sum, arr) => sum + arr.length, 0);
  }, [results]);

  // Handle shift + scroll for horizontal scrolling
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const toggleSelectRecord = (key: string) => {
    const newSelection = new Set(selectedRecords);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setSelectedRecords(newSelection);
  };

  const handleRecordClick = (record: Record<string, unknown>, columns: string[]) => {
    setSelectedRecord(record);
    setSelectedColumns(columns);
    setDialogOpen(true);
  };

  const exportToJSON = () => {
    const jsonStr = JSON.stringify(results.results, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search_results_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to JSON');
    addActivity({ type: 'export', description: 'Exported search results to JSON' });
  };

  const exportToCSV = () => {
    const allRecords: Record<string, unknown>[] = [];
    Object.entries(results.results).forEach(([table, records]) => {
      records.forEach((record) => {
        allRecords.push({ ...record, _table: table });
      });
    });

    if (allRecords.length === 0) {
      toast.error('No records to export');
      return;
    }

    const headers = Array.from(
      new Set(allRecords.flatMap((r) => Object.keys(r)))
    );
    const csvRows = [
      headers.join(','),
      ...allRecords.map((record) =>
        headers
          .map((h) => {
            const val = record[h];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') ? `"${str}"` : str;
          })
          .join(',')
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search_results_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
    addActivity({ type: 'export', description: 'Exported search results to CSV' });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Search Results
                <Badge variant="secondary">{totalResults} records</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Query: "{query}" • {tables.length} tables • {results.search_time}ms
              </p>
              <p className="text-xs text-muted-foreground">
                💡 Click any row to see full details • Shift+Scroll for horizontal scroll
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportToJSON}>
                <FileJson className="h-4 w-4 mr-2" />
                JSON
              </Button>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tables.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No results found for your query
            </div>
          ) : (
            <div ref={tableContainerRef} className="overflow-x-auto max-h-[calc(100vh-400px)]">
              <div className="space-y-6 min-w-max">
                {tables.map((table) => {
                  const records = results.results[table] || [];
                  const allColumns = getAllColumns(records);

                  return (
                    <div key={table} className="border rounded-lg overflow-hidden">
                      {/* Table Header */}
                      <div className="bg-secondary/50 px-4 py-2 font-medium flex items-center justify-between sticky top-0 z-10">
                        <span>{table}</span>
                        <Badge variant="secondary">{records.length} records</Badge>
                      </div>
                      
                      {/* Table Content */}
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            {allColumns.map((col) => (
                              <TableHead key={col} className="font-mono text-xs whitespace-nowrap bg-background">
                                {col}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {records.slice(0, 100).map((record, i) => {
                            const key = `${table}-${i}`;
                            return (
                              <TableRow 
                                key={key} 
                                className="hover:bg-muted/50 cursor-pointer"
                                onClick={() => handleRecordClick(record, allColumns)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedRecords.has(key)}
                                    onCheckedChange={() => toggleSelectRecord(key)}
                                  />
                                </TableCell>
                                {allColumns.map((col) => (
                                  <TableCell key={col} className="max-w-[200px]">
                                    <div className="truncate" title={String(record[col] ?? '')}>
                                      {record[col] !== null && record[col] !== undefined ? (
                                        <HighlightText 
                                          text={String(record[col])} 
                                          searchTerms={searchTerms} 
                                        />
                                      ) : (
                                        <span className="text-muted-foreground italic">null</span>
                                      )}
                                    </div>
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      
                      {records.length > 100 && (
                        <div className="p-2 text-center text-sm text-muted-foreground bg-muted/50">
                          Showing 100 of {records.length} records
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Detail Dialog */}
      <RecordDialog
        record={selectedRecord}
        columns={selectedColumns}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        searchTerms={searchTerms}
      />
    </>
  );
}
