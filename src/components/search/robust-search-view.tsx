'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Network, 
  Database, 
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
  Zap,
  Users,
  GitBranch,
  Activity,
  Layers,
  Sparkles,
  FileText,
} from 'lucide-react';
import { useSettingsStore } from '@/store/settings';
import type { RobustSearchResponse, FilteredResult } from '@/lib/robust-agent-search';
import { CorrelationGraphView } from './correlation-graph-view';

interface ProgressUpdate {
  stage: string;
  message: string;
  progress: number;
  currentPage: number;
  totalResults: number;
  hasMore: boolean;
  iteration?: number;
  discoveredEntities?: string[];
}

export function RobustSearchView() {
  const { baseUrl, bearerToken } = useSettingsStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [results, setResults] = useState<RobustSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<string>('all');
  const abortControllerRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);
    setResults(null);
    setProgress({
      stage: 'parsing',
      message: 'Analyzing query...',
      progress: 5,
      currentPage: 0,
      totalResults: 0,
      hasMore: true,
    });

    abortControllerRef.current = new AbortController();

    // Simulate progress updates during search
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (!prev) return null;
        
        // Cycle through stages
        const stages = ['parsing', 'searching', 'paginating', 'iterating', 'filtering', 'analyzing'];
        const currentIndex = stages.indexOf(prev.stage);
        const nextIndex = Math.min(currentIndex + 1, stages.length - 1);
        
        // Increase progress gradually
        const progressIncrement = Math.random() * 5 + 2;
        const newProgress = Math.min(prev.progress + progressIncrement, 90);
        
        return {
          stage: newProgress > 85 ? 'analyzing' : stages[nextIndex],
          message: newProgress > 85 
            ? 'Generating insights and building correlation graph...'
            : prev.progress > 60 
              ? `Processing ${prev.totalResults.toLocaleString()} results...`
              : prev.progress > 30
                ? `Fetching page ${prev.currentPage + 1}...`
                : 'Searching...',
          progress: newProgress,
          currentPage: prev.currentPage + (Math.random() > 0.7 ? 1 : 0),
          totalResults: prev.totalResults + Math.floor(Math.random() * 50),
          hasMore: true,
        };
      });
    }, 300);

    try {
      const response = await fetch('/api/robust-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          apiBaseUrl: baseUrl,
          bearerToken: bearerToken || undefined,
        }),
        signal: abortControllerRef.current.signal,
      });

      clearInterval(progressInterval);
      const data = await response.json();

      if (data.success) {
        setProgress({
          stage: 'complete',
          message: 'Search complete!',
          progress: 100,
          currentPage: data.metadata.apiCalls,
          totalResults: data.totalFetched,
          hasMore: false,
        });
        setResults(data);
      } else {
        setError(data.error || 'Search failed');
      }
    } catch (err) {
      clearInterval(progressInterval);
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Search cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    } finally {
      setIsSearching(false);
      abortControllerRef.current = null;
    }
  }, [searchQuery, baseUrl, bearerToken]);

  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const toggleRecord = (id: string) => {
    setExpandedRecords(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  // Get unique tables
  const tables = results?.filteredResults 
    ? [...new Set(results.filteredResults.map(r => r.table))]
    : [];

  // Filter results by table
  const displayResults = results?.filteredResults
    ? selectedTable === 'all' 
      ? results.filteredResults 
      : results.filteredResults.filter(r => r.table === selectedTable)
    : [];

  // Export to CSV
  const handleExportCSV = useCallback(async () => {
    if (!results) return;

    try {
      const response = await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: results.filteredResults,
          query: results.query.originalQuery,
        }),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investigation_${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [results]);

  // Export to PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  
  const handleExportPDF = useCallback(async () => {
    if (!results) return;
    
    setIsExportingPDF(true);
    try {
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: results.query.originalQuery,
          results: results.filteredResults,
          graph: results.correlationGraph,
          insights: results.insights,
          metadata: results.metadata,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investigation_report_${Date.now()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExportingPDF(false);
    }
  }, [results]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center gap-3 mb-3">
          <Network className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold">Robust Agent Search</h2>
          <Badge variant="secondary" className="text-xs">
            <Layers className="h-3 w-3 mr-1" />
            Iterative Discovery
          </Badge>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="rahul sharma from delhi having no. 9876543210"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="flex-1"
            disabled={isSearching}
          />
          {isSearching ? (
            <Button variant="destructive" onClick={cancelSearch}>
              Cancel
            </Button>
          ) : (
            <Button onClick={runSearch} disabled={!searchQuery.trim()}>
              <Network className="mr-2 h-4 w-4" />Search
            </Button>
          )}
        </div>

        {/* Real-time Progress */}
        {isSearching && progress && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                {progress.message}
              </span>
              <span className="text-muted-foreground">{Math.round(progress.progress)}%</span>
            </div>
            <Progress value={progress.progress} className="h-2" />
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span><Database className="inline h-3 w-3 mr-1" />{progress.totalResults} results</span>
              <span><Layers className="inline h-3 w-3 mr-1" />Page {progress.currentPage}</span>
              {progress.iteration && (
                <span className="text-purple-500">
                  <GitBranch className="inline h-3 w-3 mr-1" />Iteration {progress.iteration}
                </span>
              )}
            </div>
            {progress.discoveredEntities && progress.discoveredEntities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground">Discovered:</span>
                {progress.discoveredEntities.slice(0, 5).map((entity, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{entity}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-2 text-xs text-muted-foreground">
          Searches phone/email first, uses full pagination, discovers new identifiers iteratively
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
              <Network className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Robust Iterative Search</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                Comprehensive search with entity discovery and relationship mapping
              </p>
              <div className="space-y-2 text-sm max-w-md">
                <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded flex items-center gap-2">
                  <span className="text-green-600 font-medium">1.</span>
                  <span>Extract identifiers (phone, email, ID, name, location)</span>
                </div>
                <div className="p-2 bg-blue-50 dark:bg-blue-950/20 rounded flex items-center gap-2">
                  <span className="text-blue-600 font-medium">2.</span>
                  <span>Search with full pagination (all results)</span>
                </div>
                <div className="p-2 bg-purple-50 dark:bg-purple-950/20 rounded flex items-center gap-2">
                  <span className="text-purple-600 font-medium">3.</span>
                  <span>Discover new identifiers from results</span>
                </div>
                <div className="p-2 bg-orange-50 dark:bg-orange-950/20 rounded flex items-center gap-2">
                  <span className="text-orange-600 font-medium">4.</span>
                  <span>Build correlation graph & generate insights</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Summary Card */}
            <Card className="bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" />
                  Investigation Summary
                  {results.query.aiEntityExtraction && (
                    <Badge variant="default" className="ml-2 bg-purple-500 text-white">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Enhanced
                    </Badge>
                  )}
                  {results.insights.localAIUsed && (
                    <Badge variant="outline" className="ml-1 text-purple-600 border-purple-300">
                      AI Insights: {results.insights.aiModel}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-3">{results.insights.summary}</p>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
                  <div className="p-2 bg-background rounded border">
                    <div className="text-xs text-muted-foreground">Total Fetched</div>
                    <div className="text-lg font-bold">{results.totalFetched.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-background rounded border">
                    <div className="text-xs text-muted-foreground">Results</div>
                    <div className="text-lg font-bold text-green-600">{results.totalFiltered.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-background rounded border">
                    <div className="text-xs text-muted-foreground">API Calls</div>
                    <div className="text-lg font-bold">{results.metadata.apiCalls}</div>
                  </div>
                  <div className="p-2 bg-background rounded border">
                    <div className="text-xs text-muted-foreground">Duration</div>
                    <div className="text-lg font-bold">{(results.metadata.duration / 1000).toFixed(1)}s</div>
                  </div>
                  <div className="p-2 bg-background rounded border">
                    <div className="text-xs text-muted-foreground">Iterations</div>
                    <div className="text-lg font-bold text-purple-600">{results.metadata.iterations}</div>
                  </div>
                  <div className="p-2 bg-background rounded border">
                    <div className="text-xs text-muted-foreground">Duplicates</div>
                    <div className="text-lg font-bold text-orange-600">{results.duplicatesRemoved}</div>
                  </div>
                </div>

                {/* Discovered Entities */}
                {results.metadata.discoveredEntityList && results.metadata.discoveredEntityList.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-muted-foreground mb-1">
                      Discovered Entities ({results.metadata.discoveredEntities}):
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {results.metadata.discoveredEntityList.slice(0, 10).map((entity, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{entity}</Badge>
                      ))}
                      {results.metadata.discoveredEntityList.length > 10 && (
                        <Badge variant="secondary" className="text-[10px]">
                          +{results.metadata.discoveredEntityList.length - 10} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Search Details */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="default">
                    <Search className="h-3 w-3 mr-1" />
                    {results.metadata.primarySearchTerm}
                  </Badge>
                  {results.metadata.filtersApplied.map((f, i) => (
                    <Badge key={i} variant="secondary">
                      <Filter className="h-3 w-3 mr-1" />
                      {f}
                    </Badge>
                  ))}
                  {results.metadata.earlyStopped && (
                    <Badge variant="destructive">Limit Reached</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tabs for Results/Graph/Insights */}
            <Tabs defaultValue="results" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="results">
                  <Database className="h-4 w-4 mr-2" />
                  Results ({results.totalFiltered})
                </TabsTrigger>
                <TabsTrigger value="graph">
                  <GitBranch className="h-4 w-4 mr-2" />
                  Correlations ({results.correlationGraph.nodes.length})
                </TabsTrigger>
                <TabsTrigger value="insights">
                  <Zap className="h-4 w-4 mr-2" />
                  Insights
                </TabsTrigger>
              </TabsList>

              {/* Results Tab */}
              <TabsContent value="results" className="space-y-3">
                {/* Table Filter */}
                {tables.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant={selectedTable === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTable('all')}
                    >
                      All Tables
                    </Button>
                    {tables.map(table => (
                      <Button
                        key={table}
                        variant={selectedTable === table ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedTable(table)}
                      >
                        {table}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Export Buttons */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleExportPDF}
                    disabled={isExportingPDF}
                  >
                    {isExportingPDF ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Export PDF Report
                  </Button>
                </div>

                {/* Results List */}
                {displayResults.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <XCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No results match the filter criteria</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayResults.slice(0, 50).map((result) => (
                      <ResultCard 
                        key={result.id} 
                        result={result} 
                        isExpanded={expandedRecords.has(result.id)}
                        onToggle={() => toggleRecord(result.id)}
                      />
                    ))}
                    {displayResults.length > 50 && (
                      <p className="text-center text-sm text-muted-foreground py-2">
                        Showing 50 of {displayResults.length} results
                      </p>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Graph Tab */}
              <TabsContent value="graph">
                <CorrelationGraphView 
                  graph={results.correlationGraph}
                  searchHistory={[results.metadata.primarySearchTerm, ...results.metadata.discoveredEntityList.slice(0, 5)]}
                  discoveredEntities={results.metadata.discoveredEntityList}
                />
              </TabsContent>

              {/* Insights Tab */}
              <TabsContent value="insights" className="space-y-3">
                {/* Entity Connections Table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Entity Connections
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {results.insights.entityConnections.slice(0, 15).map((conn, i) => (
                        <div key={i} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{conn.type}</Badge>
                            <span className="font-medium">{conn.entity}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {conn.tables.join(', ').slice(0, 30)}
                            </span>
                            <Badge variant="secondary">{conn.appearances}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Patterns */}
                {results.insights.patterns.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Detected Patterns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1 text-sm">
                        {results.insights.patterns.map((pattern, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            <span>{pattern}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                {results.insights.recommendations.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1 text-sm">
                        {results.insights.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Zap className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Top Matches */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Top Matches</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {results.insights.topMatches.slice(0, 5).map((result) => (
                      <div key={result.id} className="p-2 bg-muted/50 rounded text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px]">{result.table}</Badge>
                          <Badge className="text-[10px] bg-green-500">
                            {Math.round(result.matchScore * 100)}% match
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {Object.entries(result.record).slice(0, 3).map(([k, v]) => 
                            `${k}: ${String(v).slice(0, 20)}`
                          ).join(' • ')}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
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
}: { 
  result: FilteredResult; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  return (
    <div className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{result.table}</Badge>
          <span className="text-sm font-medium truncate max-w-[200px]">
            {Object.values(result.record).slice(0, 2).filter(v => v).join(' • ') || 'View Details'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {Math.round(result.matchScore * 100)}%
          </Badge>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-2 pt-2 border-t text-xs space-y-1">
          {Object.entries(result.record).slice(0, 10).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground">{key}:</span>
              <span className={`truncate max-w-[250px] text-right ${key in result.highlights ? 'font-semibold text-primary' : ''}`}>
                {value !== null && value !== undefined ? String(value).slice(0, 80) : '-'}
              </span>
            </div>
          ))}
          {result.matchedFilters.length > 0 && (
            <div className="pt-2 flex flex-wrap gap-1">
              {result.matchedFilters.map((f, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{f}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RobustSearchView;
