'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettingsStore } from '@/store/settings';
import { useTables } from '@/hooks/useApi';
import { 
  Search, 
  Bot, 
  Loader2, 
  Table2, 
  Sparkles,
  TrendingUp,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';

interface RankedResult {
  table: string;
  record: Record<string, unknown>;
  score: number;
  matches: string[];
  highlighted: Record<string, string>;
}

interface AISearchResponse {
  query: string;
  results: RankedResult[];
  totalResults: number;
  searchTime: number;
  aiInsights?: {
    suggestedFilters: string[];
    relatedEntities: string[];
    patterns: string[];
  };
}

export function UnifiedSearchView() {
  const { baseUrl, bearerToken } = useSettingsStore();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<RankedResult[]>([]);
  const [searchTime, setSearchTime] = useState(0);
  const [aiInsights, setAiInsights] = useState<AISearchResponse['aiInsights']>();
  
  const { data: tablesData } = useTables();
  const tables = tablesData?.tables || [];

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setResults([]);
    setAiInsights(undefined);

    try {
      const response = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          apiBaseUrl: baseUrl,
          bearerToken: bearerToken || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResults(data.results || []);
        setSearchTime(data.searchTime || 0);
        setAiInsights(data.aiInsights);
      } else {
        toast.error(data.error || 'Search failed');
      }
    } catch (error) {
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [query, baseUrl, bearerToken]);

  // Group results by table
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.table]) {
      acc[result.table] = [];
    }
    acc[result.table].push(result);
    return acc;
  }, {} as Record<string, RankedResult[]>);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6 text-purple-500" />
          AI Agent Search
          <Badge variant="secondary" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            AI-Powered
          </Badge>
        </h2>
        <p className="text-muted-foreground">
          Intelligent search with AI-powered ranking and insights.
        </p>
      </div>

      {/* Search Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search with natural language..."
                className="pl-10 h-12"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button className="h-12 px-6" onClick={handleSearch} disabled={isLoading || !query.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Bot className="h-4 w-4 mr-2" />
              )}
              {isLoading ? 'Searching...' : 'AI Search'}
            </Button>
          </div>

          {/* Progress */}
          {isLoading && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Analyzing and ranking results...</span>
              </div>
              <Progress value={66} className="h-1" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Insights */}
      {aiInsights && (
        <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {aiInsights.suggestedFilters.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Suggested Filters</p>
                  <div className="flex flex-wrap gap-1">
                    {aiInsights.suggestedFilters.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {aiInsights.relatedEntities.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Related Entities</p>
                  <div className="flex flex-wrap gap-1">
                    {aiInsights.relatedEntities.map((e, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{e}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {aiInsights.patterns.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Patterns Detected</p>
                  <div className="flex flex-wrap gap-1">
                    {aiInsights.patterns.map((p, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {results.length} results in {searchTime}ms
            </p>
          </div>

          <ScrollArea className="h-[calc(100vh-400px)]">
            <div className="space-y-6">
              {Object.entries(groupedResults).map(([table, tableResults]) => (
                <Card key={table}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Table2 className="h-4 w-4" />
                        {table}
                        <Badge variant="secondary">{tableResults.length}</Badge>
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {tableResults.slice(0, 10).map((result, i) => (
                        <div
                          key={i}
                          className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <TrendingUp className="h-3 w-3 text-green-500" />
                                <span className="text-xs text-muted-foreground">
                                  Score: {(result.score * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="text-sm space-y-1">
                                {Object.entries(result.highlighted || result.record).slice(0, 3).map(([key, value]) => (
                                  <div key={key} className="flex gap-2">
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {key}:
                                    </span>
                                    <span 
                                      className="text-xs truncate"
                                      dangerouslySetInnerHTML={{ 
                                        __html: typeof value === 'string' ? value : String(value) 
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                            {result.matches.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {result.matches.slice(0, 3).map((m, j) => (
                                  <Badge key={j} variant="outline" className="text-xs">
                                    {m}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {tableResults.length > 10 && (
                        <p className="text-xs text-center text-muted-foreground py-2">
                          +{tableResults.length - 10} more results
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
