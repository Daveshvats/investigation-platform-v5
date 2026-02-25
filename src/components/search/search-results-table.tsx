'use client';

/**
 * Search Results Table Component
 * Displays search results in a table format
 */

import React, { useState, useMemo } from 'react';
import { useInvestigationStore, SearchResult } from '@/store/investigation-store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';

interface Props {
  results: SearchResult[];
}

export function SearchResultsTable({ results }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<string>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = [...results];

    // Apply text filter
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      filtered = filtered.filter(r => 
        JSON.stringify(r.data).toLowerCase().includes(lowerFilter) ||
        r.tableName.toLowerCase().includes(lowerFilter)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'score':
          comparison = (a.score || 0) - (b.score || 0);
          break;
        case 'tableName':
          comparison = a.tableName.localeCompare(b.tableName);
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [results, filterText, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedResults = filteredResults.slice(startIndex, startIndex + pageSize);

  // Get all unique fields from results
  const allFields = useMemo(() => {
    const fields = new Set<string>();
    results.forEach(r => {
      Object.keys(r.data).forEach(key => fields.add(key));
    });
    return Array.from(fields).slice(0, 8); // Limit columns
  }, [results]);

  // Get unique table names
  const tableNames = useMemo(() => {
    return [...new Set(results.map(r => r.tableName))];
  }, [results]);

  if (results.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent>
          <p className="text-muted-foreground">No results found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter results..."
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-8"
          />
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Score</SelectItem>
            <SelectItem value="tableName">Table</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
        >
          {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
        </Button>
      </div>

      {/* Table names summary */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tableNames.map(name => {
          const count = results.filter(r => r.tableName === name).length;
          return (
            <Badge key={name} variant="secondary">
              {name}: {count}
            </Badge>
          );
        })}
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground mb-2">
        Showing {startIndex + 1}-{Math.min(startIndex + pageSize, filteredResults.length)} of {filteredResults.length} results
      </p>

      {/* Table */}
      <div className="flex-1 overflow-auto border rounded-lg">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead className="w-24">Table</TableHead>
              <TableHead className="w-20">Score</TableHead>
              <TableHead className="w-32">Matched</TableHead>
              {allFields.map(field => (
                <TableHead key={field}>{field}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedResults.map((result, index) => (
              <TableRow key={result.id} className="hover:bg-muted/50">
                <TableCell className="font-mono text-xs">
                  {startIndex + index + 1}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {result.tableName}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(result.score || 0) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {(result.score || 0).toFixed(2)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {result.matchedFields.slice(0, 2).map((field, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {field}
                      </Badge>
                    ))}
                    {result.matchedFields.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{result.matchedFields.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {allFields.map(field => (
                  <TableCell key={field} className="max-w-xs truncate text-sm">
                    {result.data[field] !== undefined && result.data[field] !== null
                      ? String(result.data[field]).substring(0, 50)
                      : '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={(v) => {
            setPageSize(Number(v));
            setCurrentPage(1);
          }}>
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
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
