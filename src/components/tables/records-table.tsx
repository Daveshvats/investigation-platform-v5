'use client';

import { useState, useRef, useEffect } from 'react';
import { useRecords, useSchema } from '@/hooks/useApi';
import { useAppStore } from '@/store/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Table2, Search, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { addActivity } from '@/components/dashboard/user-activity-card';

// Record Detail Dialog
function RecordDialog({ 
  record, 
  columns, 
  open, 
  onOpenChange 
}: { 
  record: Record<string, unknown> | null;
  columns: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!record) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="h-5 w-5" />
            Record Details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {columns.map((col) => (
            <div key={col} className="grid grid-cols-3 gap-2 py-2 border-b">
              <div className="font-mono text-sm text-muted-foreground">{col}</div>
              <div className="col-span-2 text-sm break-all">
                {record[col] !== null && record[col] !== undefined ? (
                  String(record[col])
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

export function RecordsTable() {
  const { selectedTable } = useAppStore();
  const [pageSize, setPageSize] = useState(50);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const { data: schema, isLoading: schemaLoading, error: schemaError } = useSchema(selectedTable);
  const { data: recordsData, isLoading: recordsLoading, error: recordsError, refetch } = useRecords(selectedTable, {
    limit: pageSize,
    cursor,
  });

  const isLoading = schemaLoading || recordsLoading;
  const error = schemaError || recordsError;

  // Track activity when table is viewed
  useEffect(() => {
    if (selectedTable && recordsData?.data?.length) {
      addActivity({
        type: 'table',
        description: `Viewed table: ${selectedTable} (${recordsData.data.length} records)`,
      });
    }
  }, [selectedTable, recordsData?.data?.length]);

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

  if (!selectedTable) {
    return (
      <div className="h-[calc(100vh-280px)] flex items-center justify-center border rounded-lg bg-muted/10">
        <div className="text-center">
          <Table2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No Table Selected</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Select a table from the list to view its records
          </p>
        </div>
      </div>
    );
  }

  // Backend returns "data" array, not "records"
  const records = recordsData?.data || [];
  const hasMore = recordsData?.has_more || false;
  const nextCursor = recordsData?.next_cursor;
  const count = recordsData?.count || 0;

  // Get ALL column names from first record or schema
  const columns = schema?.columns?.map(c => c.name) || 
    (records.length > 0 ? Object.keys(records[0]) : []);

  // Filter records by search query
  const filteredRecords = searchQuery
    ? records.filter((record: Record<string, unknown>) =>
        Object.values(record).some((value) =>
          String(value).toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : records;

  // Show error if API failed
  if (error) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Table2 className="h-5 w-5" />
            Records
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load records. Please check if the backend API is running at the configured URL.
              <br /><br />
              Error: {error?.message || 'Unknown error'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const handleRecordClick = (record: Record<string, unknown>) => {
    setSelectedRecord(record);
    setDialogOpen(true);
  };

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Table2 className="h-5 w-5" />
              Records
              {count > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {count.toLocaleString()} records
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 pl-8"
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            💡 Click any row to see full details • Shift+Scroll for horizontal scroll
          </p>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              {searchQuery ? 'No matching records' : 'No records found in this table'}
            </div>
          ) : (
            <div ref={tableContainerRef} className="overflow-x-auto overflow-y-auto h-[calc(100vh-400px)]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-8 bg-background">#</TableHead>
                    {columns.map((col: string) => (
                      <TableHead key={col} className="font-mono text-xs whitespace-nowrap bg-background">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.slice(0, 100).map((record: Record<string, unknown>, i: number) => (
                    <TableRow 
                      key={i} 
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleRecordClick(record)}
                    >
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      {columns.map((col: string) => (
                        <TableCell key={col} className="max-w-[200px]">
                          <div className="truncate" title={String(record[col] ?? '')}>
                            {record[col] !== null && record[col] !== undefined
                              ? String(record[col])
                              : <span className="text-muted-foreground italic">null</span>}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination with cursor */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCursor(undefined);
                }}
                className="border rounded px-2 py-1 text-sm bg-background"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {count} records {hasMore ? '(more available)' : ''}
              </span>
              {cursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCursor(undefined)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  First Page
                </Button>
              )}
              {hasMore && nextCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCursor(nextCursor)}
                >
                  Next Page
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Record Detail Dialog */}
      <RecordDialog
        record={selectedRecord}
        columns={columns}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
