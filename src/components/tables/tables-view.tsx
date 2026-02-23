'use client';

import { TableList } from './table-list';
import { SchemaViewer } from './schema-viewer';
import { RecordsTable } from './records-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/store/settings';
import { Table2, Database } from 'lucide-react';

export function TablesView() {
  const { selectedTable } = useAppStore();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Tables Browser</h2>
        <p className="text-muted-foreground">
          Browse tables, view schemas, and explore records.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Table List */}
        <div className="lg:col-span-3">
          <TableList />
        </div>

        {/* Schema & Records */}
        <div className="lg:col-span-9">
          {selectedTable ? (
            <Tabs defaultValue="records" className="h-full">
              <TabsList>
                <TabsTrigger value="records" className="gap-2">
                  <Table2 className="h-4 w-4" />
                  Records
                </TabsTrigger>
                <TabsTrigger value="schema" className="gap-2">
                  <Database className="h-4 w-4" />
                  Schema
                </TabsTrigger>
              </TabsList>
              <TabsContent value="records" className="mt-4">
                <RecordsTable />
              </TabsContent>
              <TabsContent value="schema" className="mt-4">
                <SchemaViewer />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-[calc(100vh-240px)] flex items-center justify-center border rounded-lg bg-muted/10">
              <div className="text-center">
                <Table2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Table Selected</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Select a table from the list to view its records and schema
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
