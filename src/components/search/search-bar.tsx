'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTables } from '@/hooks/useApi';
import { Search, Loader2 } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string, table?: string) => void;
  isLoading?: boolean;
  initialQuery?: string;
  initialTable?: string;
}

export function SearchBar({ onSearch, isLoading, initialQuery = '', initialTable }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedTable, setSelectedTable] = useState<string>(initialTable || 'all');
  const { data: tablesData } = useTables();

  // Update state when props change
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (initialTable) {
      setSelectedTable(initialTable);
    }
  }, [initialTable]);

  const tables = tablesData?.tables || [];

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query, selectedTable === 'all' ? undefined : selectedTable);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search across all tables..."
          className="pl-10 h-12 text-base"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <Select value={selectedTable} onValueChange={setSelectedTable}>
        <SelectTrigger className="w-48 h-12">
          <SelectValue placeholder="Select table" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Tables</SelectItem>
          {tables
            .filter((t) => t.searchable.length > 0)
            .map((table) => (
              <SelectItem key={table.name} value={table.name}>
                {table.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button className="h-12 px-6" onClick={handleSearch} disabled={isLoading || !query.trim()}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Search className="h-4 w-4 mr-2" />
        )}
        Search
      </Button>
    </div>
  );
}
