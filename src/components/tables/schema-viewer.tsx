'use client';

import { useSchema } from '@/hooks/useApi';
import { useAppStore } from '@/store/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, Key, Search } from 'lucide-react';

export function SchemaViewer() {
  const { selectedTable } = useAppStore();
  const { data: schema, isLoading } = useSchema(selectedTable);

  if (!selectedTable) {
    return (
      <div className="h-[calc(100vh-280px)] flex items-center justify-center border rounded-lg bg-muted/10">
        <div className="text-center">
          <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No Table Selected</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Select a table to view its schema
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!schema) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            Unable to load schema for {selectedTable}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            {schema.table}
          </CardTitle>
          {schema.primary_key && (
            <Badge variant="outline" className="gap-1">
              <Key className="h-3 w-3" />
              PK: {schema.primary_key}
            </Badge>
          )}
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{schema.columns.length} columns</span>
          <span>{schema.searchable.length} searchable</span>
          <span>{schema.sortable.length} sortable</span>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Nullable</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schema.columns.map((column) => (
              <TableRow key={column.name}>
                <TableCell className="font-mono text-sm">
                  {column.name}
                  {schema.primary_key === column.name && (
                    <Key className="inline h-3 w-3 ml-1 text-primary" />
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {column.type}
                </TableCell>
                <TableCell>
                  <Badge variant={column.nullable ? 'secondary' : 'default'} className="text-xs">
                    {column.nullable ? 'NULL' : 'NOT NULL'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {schema.searchable.includes(column.name) && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Search className="h-3 w-3" />
                        Searchable
                      </Badge>
                    )}
                    {schema.sortable.includes(column.name) && (
                      <Badge variant="outline" className="text-xs">
                        Sortable
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
