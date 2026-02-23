'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSchema } from '@/hooks/useApi';
import { useAppStore } from '@/store/settings';
import { Key, Search, ArrowUpDown, Filter } from 'lucide-react';

export function SchemaViewer() {
  const { selectedTable } = useAppStore();
  const { data: schema, isLoading } = useSchema(selectedTable);

  if (!selectedTable) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Select a table to view its schema</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!schema) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Failed to load schema</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{schema.table} Schema</CardTitle>
          {schema.primary_key && (
            <Badge variant="outline" className="gap-1">
              <Key className="h-3 w-3" />
              PK: {schema.primary_key}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {schema.searchable.length > 0 && (
            <div className="flex items-center gap-1">
              <Search className="h-4 w-4" />
              <span>{schema.searchable.length} searchable</span>
            </div>
          )}
          {schema.sortable.length > 0 && (
            <div className="flex items-center gap-1">
              <ArrowUpDown className="h-4 w-4" />
              <span>{schema.sortable.length} sortable</span>
            </div>
          )}
          {schema.filterable && schema.filterable.length > 0 && (
            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4" />
              <span>{schema.filterable.length} filterable</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Nullable</TableHead>
              <TableHead>Features</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schema.columns.map((column) => (
              <TableRow key={column.name}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {column.name}
                    {column.name === schema.primary_key && (
                      <Key className="h-3 w-3 text-primary" />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {column.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  {column.nullable ? (
                    <Badge variant="outline" className="text-xs">
                      nullable
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      required
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {schema.searchable.includes(column.name) && (
                      <Badge variant="default" className="text-xs">
                        search
                      </Badge>
                    )}
                    {schema.sortable.includes(column.name) && (
                      <Badge variant="secondary" className="text-xs">
                        sort
                      </Badge>
                    )}
                    {schema.filterable?.includes(column.name) && (
                      <Badge variant="outline" className="text-xs">
                        filter
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
