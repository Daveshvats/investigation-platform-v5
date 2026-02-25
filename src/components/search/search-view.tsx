'use client';

import { useState } from 'react';
import { SearchBar } from './search-bar';
import { SearchResults } from './search-results';
import { useGlobalSearch } from '@/hooks/useApi';
import { useSavedSearchesStore } from '@/store/saved-searches';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bookmark, 
  Trash2, 
  Clock, 
  ChevronDown,
  Search as SearchIcon 
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { GlobalSearchResponse } from '@/types/api';

export function SearchView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTable, setSearchTable] = useState<string | undefined>();
  const [searchResults, setSearchResults] = useState<GlobalSearchResponse | null>(null);
  const [showSavedSearches, setShowSavedSearches] = useState(false);

  const { refetch, isLoading } = useGlobalSearch(searchQuery, {
    limit: 50,
    tables: searchTable ? [searchTable] : undefined,
  });

  const { searches: savedSearches, removeSearch, updateLastUsed } = useSavedSearchesStore();

  const handleSearch = async (query: string, table?: string) => {
    setSearchQuery(query);
    setSearchTable(table);
    
    // Trigger search
    setTimeout(async () => {
      const result = await refetch();
      if (result.data) {
        setSearchResults(result.data);
      }
    }, 100);
  };

  const handleLoadSavedSearch = (search: { query: string; table?: string }) => {
    setSearchQuery(search.query);
    setSearchTable(search.table);
    handleSearch(search.query, search.table);
    updateLastUsed(search.query);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Search</h2>
        <p className="text-muted-foreground">
          Search across all tables or target specific tables.
        </p>
      </div>

      {/* Search Bar */}
      <SearchBar 
        onSearch={handleSearch} 
        isLoading={isLoading}
        initialQuery={searchQuery}
        initialTable={searchTable}
      />

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <Card>
          <Collapsible open={showSavedSearches} onOpenChange={setShowSavedSearches}>
            <CardHeader className="pb-2">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Bookmark className="h-4 w-4" />
                    Saved Searches
                    <Badge variant="secondary">{savedSearches.length}</Badge>
                  </CardTitle>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      showSavedSearches ? '' : '-rotate-90'
                    }`}
                  />
                </div>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <ScrollArea className="max-h-48">
                  <div className="space-y-2">
                    {savedSearches.map((search) => (
                      <div
                        key={search.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted cursor-pointer"
                        onClick={() => handleLoadSavedSearch(search)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <SearchIcon className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium text-sm truncate">{search.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="truncate">"{search.query}"</span>
                            {search.table && (
                              <Badge variant="outline" className="text-xs">
                                {search.table}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {search.lastUsed && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(search.lastUsed).toLocaleDateString()}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSearch(search.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Search Results */}
      {searchResults && (
        <SearchResults results={searchResults} query={searchQuery} />
      )}
    </div>
  );
}
