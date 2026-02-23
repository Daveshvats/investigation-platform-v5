'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTables } from '@/hooks/useApi';
import { Database, Table2, Search } from 'lucide-react';

export function StatsCard() {
  const { data: tablesData, isLoading } = useTables();

  const tables = tablesData?.tables || [];
  const totalColumns = tables.reduce((sum, t) => sum + t.columns, 0);
  const searchableTables = tables.filter((t) => t.searchable.length > 0).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          Database Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Table2 className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{tables.length}</span>
              </div>
              <p className="text-xs text-muted-foreground">Tables</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{totalColumns}</span>
              </div>
              <p className="text-xs text-muted-foreground">Columns</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{searchableTables}</span>
              </div>
              <p className="text-xs text-muted-foreground">Searchable</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
