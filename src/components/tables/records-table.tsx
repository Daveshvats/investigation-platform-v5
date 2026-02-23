'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRecords, useSchema } from '@/hooks/useApi';
import { useAppStore } from '@/store/settings';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  FileJson,
  FileSpreadsheet,
  FileText,
  Columns,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import type { TableRow as ApiTableRow } from '@/types/api';
import { downloadPDF } from '@/lib/pdf-export';

export function RecordsTable() {
  const { selectedTable } = useAppStore();
  const { data: schema } = useSchema(selectedTable);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const params = useMemo(
    () => ({
      page,
      limit: pageSize,
      sort_by: sortBy || undefined,
      sort_order: sortOrder,
      search: searchQuery || undefined,
    }),
    [page, pageSize, sortBy, sortOrder, searchQuery]
  );

  const { data: recordsData, isLoading } = useRecords(selectedTable, params);

  const records = recordsData?.records || [];
  const total = recordsData?.total || 0;
  const totalPages = recordsData?.total_pages || 1;

  // Get columns from schema or first record
  const allColumns = useMemo(() => {
    if (schema?.columns) {
      return schema.columns.map((c) => c.name);
    }
    if (records.length > 0) {
      return Object.keys(records[0]);
    }
    return [];
  }, [schema, records]);

  // Initialize visible columns
  useMemo(() => {
    if (allColumns.length > 0 && visibleColumns.size === 0) {
      // Show first 8 columns by default
      setVisibleColumns(new Set(allColumns.slice(0, 8)));
    }
  }, [allColumns, visibleColumns.size]);

  const columns = useMemo(() => {
    return allColumns.filter((col) => visibleColumns.has(col));
  }, [allColumns, visibleColumns]);

  const handleSelectAll = () => {
    if (selectedRows.size === records.length) {
      setSelectedRows(new Set());
    } else {
      const pk = schema?.primary_key || 'id';
      setSelectedRows(new Set(records.map((r) => String(r[pk] || JSON.stringify(r)))));
    }
  };

  const handleSelectRow = (rowKey: string) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(rowKey)) {
      newSelection.delete(rowKey);
    } else {
      newSelection.add(rowKey);
    }
    setSelectedRows(newSelection);
  };

  const getSelectedRecords = (): ApiTableRow[] => {
    return selectedRows.size > 0
      ? records.filter((r) => selectedRows.has(getRowKey(r)))
      : records;
  };

  const exportToJSON = (data: ApiTableRow[]) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTable || 'export'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} records as JSON`);
  };

  const exportToCSV = (data: ApiTableRow[]) => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map((row) =>
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
    a.download = `${selectedTable || 'export'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} records as CSV`);
  };

  const exportToPDF = async (data: ApiTableRow[]) => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    setIsExportingPDF(true);
    try {
      await downloadPDF({
        tableName: selectedTable || 'export',
        records: data,
        selectedFields: Array.from(visibleColumns),
      });
      toast.success(`Exported ${data.length} records as PDF`);
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF. Please try again.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const getRowKey = (record: ApiTableRow): string => {
    const pk = schema?.primary_key;
    if (pk && record[pk] !== undefined) {
      return String(record[pk]);
    }
    return JSON.stringify(record);
  };

  const toggleColumn = (col: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(col)) {
      newVisible.delete(col);
    } else {
      newVisible.add(col);
    }
    setVisibleColumns(newVisible);
  };

  if (!selectedTable) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Select a table to view records</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            Records
            {total > 0 && (
              <Badge variant="secondary" className="font-normal">
                {total} total
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedRows.size > 0 && (
              <Badge variant="default">{selectedRows.size} selected</Badge>
            )}
            
            {/* Column Visibility Toggle */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Toggle Columns</h4>
                  <div className="max-h-64 overflow-auto space-y-1">
                    {allColumns.map((col) => (
                      <div key={col} className="flex items-center space-x-2">
                        <Checkbox
                          id={`col-${col}`}
                          checked={visibleColumns.has(col)}
                          onCheckedChange={() => toggleColumn(col)}
                        />
                        <label
                          htmlFor={`col-${col}`}
                          className="text-sm cursor-pointer truncate"
                        >
                          {col}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

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
                  {selectedRows.size > 0 
                    ? `Export ${selectedRows.size} selected`
                    : `Export all ${records.length} records`}
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
                <DropdownMenuItem 
                  onClick={() => exportToPDF(getSelectedRecords())}
                  disabled={isExportingPDF}
                >
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

        {/* Search and Filters */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search records..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {schema?.sortable && schema.sortable.length > 0 && (
            <Select value={sortBy || "__none__"} onValueChange={(v) => setSortBy(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {schema.sortable.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {sortBy && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No records found
          </div>
        ) : (
          <ScrollArea className="h-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        records.length > 0 &&
                        selectedRows.size === records.length
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  {columns.map((col) => (
                    <TableHead key={col} className="whitespace-nowrap">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record, idx) => {
                  const rowKey = getRowKey(record);
                  return (
                    <TableRow
                      key={rowKey || idx}
                      data-selected={selectedRows.has(rowKey)}
                      className="data-[selected=true]:bg-muted"
                    >
                      <TableCell className="w-10">
                        <Checkbox
                          checked={selectedRows.has(rowKey)}
                          onCheckedChange={() => handleSelectRow(rowKey)}
                        />
                      </TableCell>
                      {columns.map((col) => (
                        <TableCell key={col} className="max-w-xs truncate">
                          {formatCellValue(record[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
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
