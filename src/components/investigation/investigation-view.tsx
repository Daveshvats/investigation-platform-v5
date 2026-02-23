'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/settings';
import { apiClient } from '@/lib/api-client';
import { InvestigationPanel } from '@/components/investigation/investigation-panel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { TableMetadata } from '@/types/api';

export function InvestigationView() {
  const { selectedTable, setSelectedTable } = useAppStore();
  const [tables, setTables] = useState<TableMetadata[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [tableData, setTableData] = useState<Array<{ name: string; records: Record<string, unknown>[] }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Fetch table list
  const fetchTables = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.getTables();
      if (response.tables) {
        setTables(response.tables);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // Toggle table selection
  const toggleTable = (tableName: string) => {
    const newSelected = new Set(selectedTables);
    if (newSelected.has(tableName)) {
      newSelected.delete(tableName);
    } else {
      newSelected.add(tableName);
    }
    setSelectedTables(newSelected);
  };

  // Select all tables
  const selectAllTables = () => {
    setSelectedTables(new Set(tables.map(t => t.name)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedTables(new Set());
  };

  // Load selected table data
  const loadSelectedData = async () => {
    if (selectedTables.size === 0) return;

    setIsLoadingData(true);
    const loadedData: Array<{ name: string; records: Record<string, unknown>[] }> = [];

    try {
      for (const tableName of selectedTables) {
        const response = await apiClient.getRecords(tableName, { limit: 100 });
        loadedData.push({
          name: tableName,
          records: response.records || [],
        });
      }
      setTableData(loadedData);
    } catch (error) {
      console.error('Failed to load table data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Table Selector Sidebar */}
      <div className="w-72 border-r flex flex-col bg-muted/30">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Database className="h-4 w-4" />
              Select Tables
            </h3>
            <Button variant="ghost" size="icon" onClick={fetchTables} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAllTables}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {tables.map((table) => (
              <div
                key={table.name}
                className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                onClick={() => toggleTable(table.name)}
              >
                <Checkbox
                  checked={selectedTables.has(table.name)}
                  onCheckedChange={() => toggleTable(table.name)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{table.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {table.columns} columns • {table.searchable.length} searchable
                  </p>
                </div>
              </div>
            ))}

            {tables.length === 0 && !isLoading && (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No tables found. Check your API connection.
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <Button
            className="w-full"
            onClick={loadSelectedData}
            disabled={selectedTables.size === 0 || isLoadingData}
          >
            {isLoadingData ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Load {selectedTables.size} Table{selectedTables.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
          {tableData.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              {tableData.reduce((sum, t) => sum + t.records.length, 0)} records loaded
            </p>
          )}
        </div>
      </div>

      {/* Main Analysis Panel */}
      <div className="flex-1 overflow-hidden">
        {tableData.length > 0 ? (
          <InvestigationPanel tables={tableData} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Card className="max-w-md">
              <CardContent className="pt-6 text-center">
                <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Select Tables to Analyze</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose tables from the sidebar and click "Load" to start AI-powered investigation analysis.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Badge variant="outline">Auto Field Detection</Badge>
                  <Badge variant="outline">Pattern Recognition</Badge>
                  <Badge variant="outline">Cross-Case Analysis</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default InvestigationView;
