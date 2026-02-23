'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ChevronDown, 
  Download, 
  FileJson, 
  FileSpreadsheet, 
  FileText, 
  Loader2,
  Bookmark,
  Trash2,
  Clock,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import type { GlobalSearchResponse, TableRow as ApiTableRow } from '@/types/api';
import { useSavedSearchesStore } from '@/store/saved-searches';
import { downloadMultiTablePDF } from '@/lib/pdf-export';

interface SearchResultsProps {
  data: GlobalSearchResponse | null;
  isLoading: boolean;
  currentQuery: string;
  currentTable?: string;
}

export function SearchResults({ data, isLoading, currentQuery, currentTable }: SearchResultsProps) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');

  const { searches: savedSearches, addSearch, removeSearch } = useSavedSearchesStore();

  const tables = useMemo(() => {
    if (!data?.results) return [];
    return Object.keys(data.results);
  }, [data]);

  const totalResults = useMemo(() => {
    if (!data?.results) return 0;
    return Object.values(data.results).reduce((sum, arr) => sum + arr.length, 0);
  }, [data]);

  const toggleTable = (table: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(table)) {
      newExpanded.delete(table);
    } else {
      newExpanded.add(table);
    }
    setExpandedTables(newExpanded);
  };

  const toggleSelectRecord = (key: string) => {
    const newSelection = new Set(selectedRecords);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setSelectedRecords(newSelection);
  };

  const toggleSelectTable = (table: string, records: ApiTableRow[]) => {
    const keys = records.map((r, i) => `${table}-${i}`);
    const allSelected = keys.every((k) => selectedRecords.has(k));

    const newSelection = new Set(selectedRecords);
    if (allSelected) {
      keys.forEach((k) => newSelection.delete(k));
    } else {
      keys.forEach((k) => newSelection.add(k));
    }
    setSelectedRecords(newSelection);
  };

  const getSelectedRecords = (): ApiTableRow[] => {
    if (!data?.results) return [];
    const selected: ApiTableRow[] = [];
    Object.entries(data.results).forEach(([table, records]) => {
      records.forEach((record, i) => {
        if (selectedRecords.has(`${table}-${i}`)) {
          selected.push({ ...record, _table: table });
        }
      });
    });
    return selected;
  };

  const getGroupedSelectedRecords = () => {
    if (!data?.results) return {};
    const grouped: Record<string, ApiTableRow[]> = {};
    
    Object.entries(data.results).forEach(([table, records]) => {
      const tableSelected = records.filter((_, i) => selectedRecords.has(`${table}-${i}`));
      if (tableSelected.length > 0) {
        grouped[table] = tableSelected;
      }
    });
    
    return grouped;
  };

  const exportToJSON = (records: ApiTableRow[]) => {
    const jsonStr = JSON.stringify(records, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search_results_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${records.length} records as JSON`);
  };

  const exportToCSV = (records: ApiTableRow[]) => {
    if (records.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = Object.keys(records[0]).filter(h => h !== '_table');
    const csvRows = [
      headers.join(','),
      ...records.map((row) =>
        headers
          .map((h) => {
            const value = row[h];
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      ),
    ];

    const csvStr = csvRows.join('\n');
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search_results_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${records.length} records as CSV`);
  };

  const exportToPDF = async () => {
    const groupedRecords = getGroupedSelectedRecords();
    const tables = Object.entries(groupedRecords);
    
    if (tables.length === 0) {
      toast.error('No data to export');
      return;
    }

    setIsExportingPDF(true);
    try {
      await downloadMultiTablePDF({
        tables: tables.map(([tableName, records]) => ({
          tableName,
          records,
        })),
      });
      
      const totalCount = tables.reduce((sum, [, records]) => sum + records.length, 0);
      toast.success(`Exported ${totalCount} records as PDF`);
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF. Please try again.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleSaveSearch = () => {
    if (!saveName.trim() || !currentQuery.trim()) return;
    
    addSearch({
      name: saveName.trim(),
      query: currentQuery,
      table: currentTable,
    });
    
    setSaveName('');
    setShowSaveDialog(false);
    toast.success('Search saved successfully');
  };

  if (isLoading) {
    return (
      <div className="space-y-4 mt-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4 mt-6">
      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Found <strong>{totalResults}</strong> results in{' '}
            <strong>{tables.length}</strong> tables
          </span>
          <Badge variant="secondary">
            {data.search_time.toFixed(2)}ms
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {selectedRecords.size > 0 && (
            <Badge variant="default">{selectedRecords.size} selected</Badge>
          )}
          
          {/* Save Search Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSaveDialog(true)}
          >
            <Bookmark className="h-4 w-4 mr-2" />
            Save Search
          </Button>
          
          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                {selectedRecords.size > 0 
                  ? `Export ${selectedRecords.size} selected`
                  : `Export all ${totalResults} results`}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportToJSON(getSelectedRecords())}>
                <FileJson className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToCSV(getSelectedRecords())}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPDF} disabled={isExportingPDF}>
                {isExportingPDF ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Results by Table */}
      {tables.map((table) => {
        const records = data.results[table] || [];
        const isExpanded = expandedTables.has(table);
        const allSelected = records.every((_, i) =>
          selectedRecords.has(`${table}-${i}`)
        );

        return (
          <Card key={table}>
            <Collapsible open={isExpanded} onOpenChange={() => toggleTable(table)}>
              <CardHeader className="pb-3">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ChevronDown
                        className={`h-5 w-5 transition-transform ${
                          isExpanded ? '' : '-rotate-90'
                        }`}
                      />
                      {table}
                      <Badge variant="secondary">{records.length}</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleSelectTable(table, records)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <ScrollArea className="max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          {records.length > 0 &&
                            Object.keys(records[0]).map((col) => (
                              <TableHead key={col} className="whitespace-nowrap">
                                {col}
                              </TableHead>
                            ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((record, i) => {
                          const key = `${table}-${i}`;
                          const isSelected = selectedRecords.has(key);
                          return (
                            <TableRow
                              key={key}
                              data-selected={isSelected}
                              className="data-[selected=true]:bg-muted cursor-pointer"
                              onClick={() => toggleSelectRecord(key)}
                            >
                              <TableCell className="w-10">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelectRecord(key)}
                                />
                              </TableCell>
                              {Object.entries(record).map(([col, val]) => (
                                <TableCell
                                  key={col}
                                  className="max-w-xs truncate"
                                >
                                  {formatCellValue(val)}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      {/* Load More */}
      {data.has_more && (
        <div className="flex justify-center">
          <Button variant="outline">Load More Results</Button>
        </div>
      )}

      {/* Save Search Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Search</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="searchName">Search Name</Label>
              <Input
                id="searchName"
                placeholder="My saved search"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Query</Label>
              <p className="text-sm text-muted-foreground">{currentQuery}</p>
            </div>
            {currentTable && (
              <div className="space-y-2">
                <Label>Table</Label>
                <p className="text-sm text-muted-foreground">{currentTable}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSearch} disabled={!saveName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
