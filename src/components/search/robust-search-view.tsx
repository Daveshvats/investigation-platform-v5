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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Search, 
  Network, 
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Target,
  Download,
  Sparkles,
  Shield,
  Table,
  Loader2,
  Maximize2,
  X,
  FileText,
} from 'lucide-react';
import { useSettingsStore } from '@/store/settings';
import { CorrelationGraphView } from './correlation-graph-view';
import { InsightsPanel } from './insights-panel';
import { toast } from 'sonner';
import { addActivity } from '@/components/dashboard/user-activity-card';

interface ProgressUpdate {
  stage: string;
  message: string;
  progress: number;
  currentPage: number;
  totalResults: number;
  hasMore: boolean;
}

interface Entity {
  type: string;
  value: string;
  originalText: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
}

interface FilteredResult {
  table: string;
  record: Record<string, unknown>;
  matchedFields: string[];
  matchedEntities: string[];
  score: number;
}

interface RobustSearchResponse {
  success: boolean;
  query: string;
  extraction: {
    entities: Entity[];
    highValue: Entity[];
    mediumValue: Entity[];
    lowValue: Entity[];
    relationships: any[];
    extractionTime?: number;
  };
  filteredResults: FilteredResult[];
  results: FilteredResult[];
  correlationGraph: {
    nodes: any[];
    edges: any[];
  } | null;
  insights: any;
  v2Insights?: {
    patterns: number;
    anomalies: number;
    riskIndicators: number;
  };
  metadata: {
    searchTime: number;
    entitiesSearched: number;
    iterationsPerformed: number;
    totalRecordsSearched: number;
    apiCalls?: number;
    totalFetched?: number;
    v2Enabled: boolean;
  };
}

export function RobustSearchView() {
  const { baseUrl, authType, authToken, bearerToken } = useSettingsStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [results, setResults] = useState<RobustSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('results');
  const [v2Enabled, setV2Enabled] = useState(true);
  const [graphModalOpen, setGraphModalOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
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
        
        const stages = ['parsing', 'searching', 'discovering', 'iterating', 'filtering', 'analyzing'];
        const currentIndex = stages.indexOf(prev.stage);
        const nextIndex = Math.min(currentIndex + 1, stages.length - 1);
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
      // Use authToken if available, otherwise fall back to bearerToken
      const token = authToken || bearerToken;
      
      const response = await fetch('/api/search/robust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          apiBaseUrl: baseUrl,
          // Send both bearerToken and apiKey based on authType
          bearerToken: authType === 'bearer' ? token : undefined,
          apiKey: authType === 'api-key' ? token : undefined,
          options: {
            maxIterations: 5,
            maxResultsPerEntity: 100,
            includeGraph: true,
            generateReport: false,
            enableV2: v2Enabled,
            analyzeCorrelations: v2Enabled,
          },
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
          currentPage: data.metadata?.apiCalls || 0,
          totalResults: data.filteredResults?.length || 0,
          hasMore: false,
        });
        setResults(data);
        // Track activity for Deep Search
        addActivity({
          type: 'search',
          description: `Deep Search: "${searchQuery}" (${data.filteredResults?.length || 0} results)`,
        });
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
  }, [searchQuery, baseUrl, authType, authToken, bearerToken, v2Enabled]);

  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const toggleRecord = (id: string) => {
    setExpandedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleExportCSV = useCallback(async () => {
    if (!results?.filteredResults) return;

    const allRecords = results.filteredResults.map(r => ({
      ...r.record,
      _table: r.table,
      _matchedFields: r.matchedFields.join(', '),
      _score: r.score,
    }));

    if (allRecords.length === 0) {
      toast.error('No records to export');
      return;
    }

    const headers = Array.from(
      new Set(allRecords.flatMap(r => Object.keys(r)))
    );
    const csvRows = [
      headers.join(','),
      ...allRecords.map(record =>
        headers.map(h => {
          const val = (record as any)[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') ? `"${str}"` : str;
        }).join(',')
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investigation_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
    addActivity({ type: 'export', description: 'Exported Deep Search results to CSV' });
  }, [results]);

  const handleExportPDF = useCallback(async () => {
    if (!results || !results.filteredResults || results.filteredResults.length === 0) {
      toast.error('No results to export');
      return;
    }
    
    setIsGeneratingPdf(true);
    toast.info('Generating PDF report...');
    
    try {
      const payload = {
        query: results.query,
        extraction: results.extraction,
        results: results.filteredResults,
        correlationGraph: results.correlationGraph,
        insights: results.insights,
        metadata: results.metadata,
      };
      
      console.log('Sending PDF request with payload:', {
        query: payload.query,
        resultsCount: payload.results?.length,
        hasExtraction: !!payload.extraction,
      });
      
      const response = await fetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('PDF generation failed:', errorData);
        throw new Error(errorData.error || 'Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investigation_report_${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('PDF report generated successfully!');
      addActivity({ type: 'export', description: 'Exported Deep Search results to PDF' });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate PDF report');
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [results]);

  // Example queries
  const exampleQueries = [
    'find subodh from delhi having phone 9748247177',
    'rahul sharma connected to aman verma',
    'phone 9876543210 in mumbai',
    'PAN ABCDE1234F transactions',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Network className="h-6 w-6" />
              Deep Search
              {v2Enabled && (
                <Badge variant="default" className="ml-2 bg-gradient-to-r from-blue-600 to-purple-600">
                  <Sparkles className="h-3 w-3 mr-1" />
                  V2 Enhanced
                </Badge>
              )}
            </h2>
            <p className="text-muted-foreground">
              {v2Enabled 
                ? '2026-standard: Hybrid NER, Knowledge Graph, Pattern Detection, Risk Analysis'
                : 'Full pagination, correlation graph, and intelligent filtering'
              }
            </p>
          </div>
          
          {/* V2 Toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="v2-mode"
              checked={v2Enabled}
              onCheckedChange={setV2Enabled}
            />
            <Label htmlFor="v2-mode" className="text-sm">
              <div className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                V2 Engine
              </div>
            </Label>
          </div>
        </div>
      </div>

      {/* Search Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input
              placeholder="e.g., find subodh from delhi having phone 9748247177"
              className="flex-1 h-12"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isSearching && runSearch()}
              disabled={isSearching}
            />
            {isSearching ? (
              <Button variant="destructive" className="h-12 px-6" onClick={cancelSearch}>
                Cancel
              </Button>
            ) : (
              <Button className="h-12 px-6" onClick={runSearch} disabled={!searchQuery.trim()}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            )}
          </div>

          {/* Example queries */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-sm text-muted-foreground">Try:</span>
            {exampleQueries.map((q, i) => (
              <Button
                key={i}
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setSearchQuery(q)}
              >
                {q}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {isSearching && progress && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">{progress.message}</p>
                <Progress value={progress.progress} className="h-1 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Extracted Entities Summary */}
      {results?.extraction?.entities && results.extraction.entities.length > 0 && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-green-900 dark:text-green-100">Extracted Entities:</span>
              {results.extraction.entities.filter((e: Entity) => e.priority === 'HIGH').length > 0 && (
                <div className="flex items-center gap-1">
                  <Badge variant="default" className="bg-red-500">
                    HIGH: {results.extraction.entities.filter((e: Entity) => e.priority === 'HIGH').length}
                  </Badge>
                  <span className="text-xs text-green-800 dark:text-green-200">
                    ({results.extraction.entities.filter((e: Entity) => e.priority === 'HIGH').map((e: Entity) => e.value).join(', ')})
                  </span>
                </div>
              )}
              {results.extraction.entities.filter((e: Entity) => e.priority === 'MEDIUM').length > 0 && (
                <Badge variant="secondary">
                  MEDIUM: {results.extraction.entities.filter((e: Entity) => e.priority === 'MEDIUM').length}
                </Badge>
              )}
              {results.extraction.entities.filter((e: Entity) => e.priority === 'LOW').length > 0 && (
                <Badge variant="outline">
                  LOW: {results.extraction.entities.filter((e: Entity) => e.priority === 'LOW').length}
                </Badge>
              )}
              
              {/* V2 Insights Badge */}
              {results.v2Insights && v2Enabled && (
                <div className="flex items-center gap-2 ml-auto">
                  <Badge variant="outline" className="border-blue-400 text-blue-700">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {results.v2Insights.patterns} patterns
                  </Badge>
                  {results.v2Insights.anomalies > 0 && (
                    <Badge variant="outline" className="border-orange-400 text-orange-700">
                      {results.v2Insights.anomalies} anomalies
                    </Badge>
                  )}
                  {results.v2Insights.riskIndicators > 0 && (
                    <Badge variant="outline" className="border-red-400 text-red-700">
                      {results.v2Insights.riskIndicators} risks
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {results && results.filteredResults && results.filteredResults.length > 0 && (
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="results" className="flex items-center gap-1">
                  <Table className="h-4 w-4" />
                  Results ({results.filteredResults.length})
                </TabsTrigger>
                <TabsTrigger value="insights" className="flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  Insights
                  {v2Enabled && results.v2Insights && (
                    <Badge variant="secondary" className="ml-1 text-xs">V2</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <div className="flex gap-2">
                {/* Graph Modal Button */}
                <Dialog open={graphModalOpen} onOpenChange={setGraphModalOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={!results.correlationGraph?.nodes?.length}>
                      <Network className="mr-2 h-4 w-4" />
                      View Graph
                      <Badge variant="secondary" className="ml-2">
                        {results.correlationGraph?.nodes?.length || 0} nodes
                      </Badge>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] max-h-[95vh] h-[90vh] p-0">
                    <div className="absolute top-4 right-4 z-50">
                      <Button 
                        variant="secondary" 
                        size="icon"
                        onClick={() => setGraphModalOpen(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="w-full h-full">
                      {results.correlationGraph && (
                        <CorrelationGraphView graph={results.correlationGraph} />
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                <Button onClick={handleExportCSV} disabled={isSearching}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                
                <Button 
                  variant="default" 
                  onClick={handleExportPDF} 
                  disabled={isSearching || isGeneratingPdf || !results?.filteredResults?.length}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {isGeneratingPdf ? 'Generating...' : 'Export PDF Report'}
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <TabsContent value="results" className="m-0">
                <Card>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[calc(100vh-500px)]">
                      <div className="p-4 space-y-2">
                        {results.filteredResults.map((result, i) => (
                          <div
                            key={`${result.table}-${i}`}
                            className="border rounded-lg overflow-hidden"
                          >
                            <div
                              className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer hover:bg-muted"
                              onClick={() => toggleRecord(`${result.table}-${i}`)}
                            >
                              <div className="flex items-center gap-2">
                                {expandedRecords.has(`${result.table}-${i}`) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                                <span className="font-medium">{result.table}</span>
                                <Badge variant="outline" className="text-xs">
                                  Score: {(result.score * 100).toFixed(0)}%
                                </Badge>
                              </div>
                              <div className="flex gap-1">
                                {result.matchedFields.slice(0, 3).map((f, j) => (
                                  <Badge key={j} variant="secondary" className="text-xs">
                                    {f}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            {expandedRecords.has(`${result.table}-${i}`) && (
                              <div className="p-3 bg-background border-t">
                                <pre className="text-xs overflow-x-auto">
                                  {JSON.stringify(result.record, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="insights" className="m-0">
                {results.insights && <InsightsPanel insights={results.insights} />}
              </TabsContent>
            </div>
          </Tabs>

          {/* Metadata */}
          {results.metadata && (
            <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
              <div className="flex gap-4">
                <span>Search time: {results.metadata.searchTime}ms</span>
                <span>API calls: {results.metadata.apiCalls}</span>
                <span>Total fetched: {results.metadata.totalFetched}</span>
                <span>Iterations: {results.metadata.iterationsPerformed}</span>
              </div>
              {results.metadata.v2Enabled && (
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  V2 Engine Enabled
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* No Results Message */}
      {results && results.filteredResults && results.filteredResults.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No results found for your query.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Try different search terms or check if your backend API is running at {baseUrl}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
