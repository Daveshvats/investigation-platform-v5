'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/settings';
import { 
  Bookmark, 
  Search, 
  Plus, 
  Trash2, 
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

interface SavedSearch {
  id: string;
  query: string;
  tables: string[];
  timestamp: string;
  count?: number;
}

const STORAGE_KEY = 'saved-searches';

// Get saved searches from localStorage
const getStoredSearches = (): SavedSearch[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save searches to localStorage
const saveSearches = (searches: SavedSearch[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch (e) {
    console.error('Failed to save searches:', e);
  }
};

// Export function to add a search from other components
export const addSavedSearch = (query: string, tables: string[] = ['all'], count?: number) => {
  if (!query.trim()) return;
  
  const searches = getStoredSearches();
  
  // Check if this query already exists
  if (searches.some(s => s.query.toLowerCase() === query.toLowerCase())) {
    return; // Don't add duplicates
  }
  
  const newSearch: SavedSearch = {
    id: Date.now().toString(),
    query: query.trim(),
    tables,
    timestamp: new Date().toISOString(),
    count,
  };
  
  const updated = [newSearch, ...searches].slice(0, 20); // Keep max 20 saved searches
  saveSearches(updated);
};

const formatDate = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function SavedSearchesCard() {
  const { setCurrentView } = useAppStore();
  // Use lazy initialization to avoid calling setState in effect
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => getStoredSearches());
  const [newQuery, setNewQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddSearch = () => {
    if (!newQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    const newSearch: SavedSearch = {
      id: Date.now().toString(),
      query: newQuery.trim(),
      tables: ['all'],
      timestamp: new Date().toISOString(),
    };

    const updated = [newSearch, ...savedSearches];
    setSavedSearches(updated);
    saveSearches(updated);
    setNewQuery('');
    setIsAdding(false);
    toast.success('Search saved!');
  };

  const handleDeleteSearch = (id: string) => {
    const updated = savedSearches.filter(s => s.id !== id);
    setSavedSearches(updated);
    saveSearches(updated);
    toast.success('Search removed');
  };

  const handleRunSearch = (query: string) => {
    // Navigate to search view - in a real app, you'd pass the query
    setCurrentView('search');
    toast.info(`Running search: "${query}"`);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            Saved Searches
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setIsAdding(!isAdding)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Add New Search */}
        {isAdding && (
          <div className="flex gap-2 mb-4 pb-4 border-b">
            <Input
              placeholder="Enter search query..."
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSearch()}
              className="flex-1"
              autoFocus
            />
            <Button size="sm" onClick={handleAddSearch}>
              Save
            </Button>
          </div>
        )}

        {/* Saved Searches List */}
        {savedSearches.length === 0 ? (
          <div className="text-center py-8">
            <Bookmark className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No saved searches yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Save your frequent searches for quick access
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {savedSearches.map((search) => (
              <div 
                key={search.id} 
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex-shrink-0 p-2 rounded-full bg-blue-500/10">
                  <Search className="h-4 w-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{search.query}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {search.tables.join(', ')}
                    </Badge>
                    {search.count !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {search.count} results
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(search.timestamp)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRunSearch(search.query)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteSearch(search.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Footer */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t text-xs text-muted-foreground">
          <span>{savedSearches.length} saved searches</span>
          {savedSearches.length > 0 && (
            <span>Last saved: {formatDate(savedSearches[0].timestamp)}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
