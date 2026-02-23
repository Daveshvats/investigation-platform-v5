'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Search, 
  Bot, 
  Database, 
  Sparkles, 
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  Download,
  AlertTriangle,
  Zap,
  FileText,
} from 'lucide-react';
import { useSettingsStore } from '@/store/settings';

// Types
interface SearchCriterion {
  id: string;
  type: string;
  value: string;
  description: string;
  importance: number;
  classification: 'search' | 'filter';
  reason: string;
}

interface QueryAnalysis {
  originalQuery: string;
  intent: string;
  searchCriteria: SearchCriterion[];
  filterCriteria: SearchCriterion[];
}

interface StoredResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  matchedSearchCriteria: string[];
  passedFilters: boolean;
  filterMatches: string[];
  relevanceScore: number;
}

interface SmartSearchResponse {
  success: boolean;
  analysis: QueryAnalysis;
  results: StoredResult[];
  filteredResults: StoredResult[];
  csvPath?: string;
  metadata: {
    searchCriteriaCount: number;
    filterCriteriaCount: number;
    totalResults: number;
    filteredResults: number;
    pagesFetched: number;
    duration: number;
    apiErrors: string[];
    aiMode: string;
  };
  insights: {
    summary: string;
    recommendations: string[];
  };
  error?: string;
  helpText?: string[];
}

export function UnifiedSearchView() {
  const { baseUrl, bearerToken } = useSettingsStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; message: string } | null>(null);
  const [results, setResults] = useState<SmartSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);
    setResults(null);
    setProgress({ stage: 'init', message: 'Starting...' });

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (!prev) return null;
        const stages = ['analyzing', 'searching', 'filtering', 'exporting'];
        const stageIndex = stages.indexOf(prev.stage);
        if (stageIndex < stages.length - 1) {
          return { stage: stages[stageIndex + 1], message: `${stages[stageIndex + 1]}...` };
        }
        return prev;
      });
    }, 2000);

    try {
      const response = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          apiBaseUrl: baseUrl,
          bearerToken: bearerToken || undefined,
        }),
      });

      clearInterval(progressInterval);
      const data: SmartSearchResponse = await response.json();

      if (data.success) {
        setResults(data);
      } else {
        setError(data.error || 'Search failed');
      }
    } catch (err) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
      setProgress(null);
    }
  }, [searchQuery, baseUrl, bearerToken]);

  const toggleRecord = (id: string) => {
    setExpandedRecords(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center gap-3 mb-3">
          <Zap className="h-5 w-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Smart AI Search</h2>
          <Badge variant="secondary" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            Intelligent Classification
          </Badge>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="rahul sharma from delhi with phone 91231298312"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="flex-1"
            disabled={isSearching}
          />
          <Button onClick={runSearch} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? (
              <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Searching...</>
            ) : (
              <><Bot className="mr-2 h-4 w-4" />Smart Search</>
            )}
          </Button>
        </div>

        {progress && isSearching && (
          <div className="mt-2 text-sm text-muted-foreground">
            <span>{progress.message}</span>
          </div>
        )}

        <div className="mt-2 text-xs text-muted-foreground">
          💡 Searches for specific identifiers (names, phones, IDs), then filters by location
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Results */}
      <ScrollArea className="flex-1 p-4">
        {!results ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Target className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Smart Multi-Criteria Search</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                The AI extracts criteria from your query and intelligently decides what to search vs filter.
              </p>
              <div className="space-y-2 text-sm max-w-md">
                <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded">
                  <strong className="text-green-700">✓ SEARCH:</strong> High-specificity (names, phones, IDs)
                </div>
                <div className="p-2 bg-blue-50 dark:bg-blue-950/20 rounded">
                  <strong className="text-blue-700">⚡ FILTER:</strong> Low-specificity (locations like "Delhi")
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <Card className="bg-primary/5">
              <CardContent className="py-3">
                <p className="text-sm">{results.insights.summary}</p>
                {results.insights.recommendations.length > 0 && (
                  <ul className="mt-2 text-xs text-muted-foreground">
                    {results.insights.recommendations.map((rec, i) => (
                      <li key={i}>• {rec}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* API Errors */}
            {results.metadata.apiErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>API Errors ({results.metadata.apiErrors.length})</AlertTitle>
                <AlertDescription>
                  <ul className="text-xs mt-1">
                    {results.metadata.apiErrors.slice(0, 3).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Criteria */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4 text-green-500" />
                    Searched ({results.analysis.searchCriteria.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {results.analysis.searchCriteria.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs py-1">
                      <Badge variant="default" className="text-[10px]">{c.type}</Badge>
                      <span className="font-medium">{c.value}</span>
                    </div>
                  ))}
                  {results.analysis.searchCriteria.length === 0 && (
                    <span className="text-xs text-muted-foreground">No specific criteria to search</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Filter className="h-4 w-4 text-blue-500" />
                    Filtered ({results.analysis.filterCriteria.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {results.analysis.filterCriteria.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs py-1">
                      <Badge variant="secondary" className="text-[10px]">{c.type}</Badge>
                      <span>{c.value}</span>
                      <span className="text-muted-foreground text-[10px]">({c.reason})</span>
                    </div>
                  ))}
                  {results.analysis.filterCriteria.length === 0 && (
                    <span className="text-xs text-muted-foreground">No filter criteria</span>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Results */}
            {results.filteredResults.length > 0 && (
              <Card className="border-green-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Exact Matches ({results.filteredResults.length})
                  </CardTitle>
                  <CardDescription>Matched all search criteria AND passed all filters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {results.filteredResults.slice(0, 20).map((result) => (
                    <ResultCard 
                      key={result.id} 
                      result={result} 
                      isExpanded={expandedRecords.has(result.id)}
                      onToggle={() => toggleRecord(result.id)}
                      isExact
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {results.results.length > results.filteredResults.length && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Partial Matches ({results.results.length - results.filteredResults.length})
                  </CardTitle>
                  <CardDescription>Matched search criteria but not all filters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {results.results.filter(r => !r.passedFilters).slice(0, 10).map((result) => (
                    <ResultCard 
                      key={result.id} 
                      result={result} 
                      isExpanded={expandedRecords.has(result.id)}
                      onToggle={() => toggleRecord(result.id)}
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {results.results.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <XCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No results found</p>
                <p className="text-xs">Try different search terms</p>
              </div>
            )}

            {/* Metadata */}
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex gap-4">
                    <span><Database className="inline h-3 w-3 mr-1" />{results.metadata.totalResults} total</span>
                    <span><CheckCircle2 className="inline h-3 w-3 mr-1 text-green-500" />{results.metadata.filteredResults} exact</span>
                    <span><Clock className="inline h-3 w-3 mr-1" />{(results.metadata.duration / 1000).toFixed(1)}s</span>
                  </div>
                  {results.csvPath && (
                    <Badge variant="outline" className="text-xs">
                      <FileText className="h-3 w-3 mr-1" />
                      CSV exported
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// Result Card Component
function ResultCard({ 
  result, 
  isExpanded, 
  onToggle, 
  isExact = false 
}: { 
  result: StoredResult; 
  isExpanded: boolean; 
  onToggle: () => void;
  isExact?: boolean;
}) {
  return (
    <div className={`border rounded-lg p-2 ${isExact ? 'border-green-300 bg-green-50/50' : ''}`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{result.table}</Badge>
          <span className="text-sm font-medium truncate max-w-[150px]">
            {Object.values(result.record).slice(0, 2).filter(v => v).join(' • ') || 'View'}
          </span>
          {isExact && <Badge className="text-xs bg-green-500">EXACT</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Score: {result.relevanceScore}
          </Badge>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-2 pt-2 border-t text-xs space-y-1">
          {Object.entries(result.record).slice(0, 8).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground">{key}:</span>
              <span className="truncate max-w-[200px] text-right">
                {value !== null && value !== undefined ? String(value).slice(0, 60) : '-'}
              </span>
            </div>
          ))}
          {result.filterMatches.length > 0 && (
            <div className="pt-1 flex flex-wrap gap-1">
              {result.filterMatches.map((m, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{m}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default UnifiedSearchView;
