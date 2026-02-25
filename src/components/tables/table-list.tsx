'use client';

import { useTables, useSchema, useStats } from '@/hooks/useApi';
import { useAppStore } from '@/store/settings';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table2, Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TableList() {
  const { data, isLoading } = useTables();
  const { selectedTable, setSelectedTable } = useAppStore();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const tables = data?.tables || [];

  if (tables.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Table2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No tables found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-240px)]">
      <div className="space-y-1 pr-4">
        {tables.map((table) => (
          <Button
            key={table.name}
            variant={selectedTable === table.name ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start gap-3 h-auto py-3',
              selectedTable === table.name && 'bg-secondary'
            )}
            onClick={() => setSelectedTable(table.name)}
          >
            <Table2 className="h-4 w-4 flex-shrink-0" />
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{table.name}</span>
                {table.searchable.length > 0 && (
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    <Search className="h-3 w-3 mr-1" />
                    {table.searchable.length}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {table.columns} columns
              </p>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0" />
          </Button>
        ))}
      </div>
    </ScrollArea>
  );
}
