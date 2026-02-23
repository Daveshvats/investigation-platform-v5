'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTables, useSchema } from '@/hooks/useApi';
import { useAppStore } from '@/store/settings';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table2,
  Search,
  ArrowUpDown,
  Filter,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function TableList() {
  const { data, isLoading } = useTables();
  const { selectedTable, setSelectedTable } = useAppStore();

  const tables = data?.tables || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Table2 className="h-5 w-5" />
          Tables
          <Badge variant="secondary" className="ml-auto">
            {tables.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-1 p-4 pt-0">
            {tables.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tables found
              </div>
            ) : (
              tables.map((table) => (
                <Button
                  key={table.name}
                  variant={selectedTable === table.name ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-between h-auto py-3 px-3',
                    selectedTable === table.name && 'bg-secondary'
                  )}
                  onClick={() => setSelectedTable(table.name)}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-medium">{table.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{table.columns} columns</span>
                      {table.searchable.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Search className="h-3 w-3" />
                          <span>{table.searchable.length}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
