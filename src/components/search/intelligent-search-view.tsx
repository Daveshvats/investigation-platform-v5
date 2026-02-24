'use client';

/**
 * Intelligent Search View Component
 * 
 * 2026 Best Practices UI:
 * - Shows entity classification (HIGH vs LOW value)
 * - Displays search vs filter criteria
 * - Real-time progress updates
 * - Knowledge graph visualization
 * - AI-powered insights
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Sparkles, 
  Network, 
  FileText, 
  Users, 
  Phone, 
  Mail, 
  Hash, 
  MapPin,
  Building,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Brain,
  Database,
  RefreshCw
} from 'lucide-react';

// Types
interface ExtractedEntity {
  type: 'phone' | 'email' | 'id_number' | 'account' | 'name' | 'location' | 'company';
  value: string;
  normalized: string;
  searchValue: 'HIGH' | 'MEDIUM' | 'LOW';
  searchPriority: number;
  confidence: number;
}

interface SearchResult {
  id: string;
  table: string;
  record: Record<string, unknown>;
  matchScore: number;
  matchedSearchTerms: string[];
  matchedFilters: string[];
}

interface EntityNode {
  id: string;
  type: string;
  value: string;
  count: number;
  sources: string[];
}

interface KnowledgeGraph {
  nodes: EntityNode[];
  edges: Array<{
    source: string;
    target: string;
    weight: number;
    type: string;
  }>;
  clusters: Array<{
    id: string;
    nodes: string[];
    label: string;
  }>;
}

interface Insights {
  summary: string;
  keyFindings: string[];
  entityConnections: string[];
  recommendations: string[];
  confidence: number;
}

interface SearchMetadata {
  duration: number;
  apiCalls: number;
  pagesFetched: number;
  iterations: number;
  entitiesExtracted: number;
  highValueEntities: number;
  lowValueEntities: number;
  aiModel: string;
  localAIUsed: boolean;
}

interface IntelligentSearchResponse {
  success: boolean;
  query: {
    originalQuery: string;
    searchCriteria: Array<{
      type: string;
      category: string;
      value: string;
      normalizedValue: string;
      priority: number;
    }>;
    filterCriteria: Array<{
      type: string;
      category: string;
      value: string;
      normalizedValue: string;
    }>;
    intent: string;
  };
  results: SearchResult[];
  totalResults: number;
  uniqueResults: number;
  duplicatesRemoved: number;
  knowledgeGraph: KnowledgeGraph;
  insights: Insights;
  metadata: SearchMetadata;
}

interface ProgressState {
  stage: string;
  message: string;
  progress: number;
  currentPage?: number;
  totalResults?: number;
  iteration?: number;
  discoveredEntities?: string[];
}

// Entity type icons and colors
const entityConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  phone: { icon: Phone, color: 'bg-green-500', label: 'Phone' },
  email: { icon: Mail, color: 'bg-blue-500', label: 'Email' },
  id_number: { icon: Hash, color: 'bg-purple-500', label: 'ID Number' },
  account: { icon: Database, color: 'bg-orange-500', label: 'Account' },
  name: { icon: Users, color: 'bg-gray-500', label: 'Name' },
  location: { icon: MapPin, color: 'bg-red-500', label: 'Location' },
  company: { icon: Building, color: 'bg-indigo-500', label: 'Company' },
};

export function IntelligentSearchView() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<IntelligentSearchResponse | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('results');
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Execute intelligent search
  const executeSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResponse(null);
    setProgress({ stage: 'parsing', message: 'Analyzing query...', progress: 5 });

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/api/intelligent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: abortControllerRef.current.signal,
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }

      setResponse(data.data);
      setProgress({ stage: 'complete', message: 'Search complete!', progress: 100 });

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Search cancelled');
      } else {
        setError((err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // Cancel search
  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setProgress(null);
  }, []);

  // Render entity badge
  const renderEntityBadge = (entity: { type: string; value: string; searchValue?: string }) => {
    const config = entityConfig[entity.type] || entityConfig.name;
    const Icon = config.icon;
    const isHighValue = entity.searchValue === 'HIGH';

    return (
      <Badge
        key={`${entity.type}-${entity.value}`}
        variant={isHighValue ? 'default' : 'secondary'}
        className={`${isHighValue ? 'bg-green-600 hover:bg-green-700' : ''} gap-1`}
      >
        <Icon className="h-3 w-3" />
        {entity.value}
        {isHighValue && <span className="ml-1 text-xs">SEARCH</span>}
      </Badge>
    );
  };

  // Render results table
  const renderResults = () => {
    if (!response) return null;

    return (
      <div className="space-y-4">
        {/* Results summary */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{response.uniqueResults.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Unique Results</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{response.totalResults.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Fetched</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{response.duplicatesRemoved.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Duplicates Removed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{response.knowledgeGraph.nodes.length}</div>
              <div className="text-sm text-muted-foreground">Entities Discovered</div>
            </CardContent>
          </Card>
        </div>

        {/* Results list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search Results</CardTitle>
            <CardDescription>
              Showing {Math.min(50, response.results.length)} of {response.results.length} results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {response.results.slice(0, 50).map((result, i) => (
                  <div
                    key={result.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{result.table}</Badge>
                        <span className="text-sm text-muted-foreground">
                          Score: {(result.matchScore * 100).toFixed(0)}%
                        </span>
                      </div>
                      {result.matchedFilters.length > 0 && (
                        <div className="flex gap-1">
                          {result.matchedFilters.slice(0, 3).map((f, j) => (
                            <Badge key={j} variant="secondary" className="text-xs">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-sm">
                      {Object.entries(result.record)
                        .filter(([k, v]) => v !== null && v !== undefined && v !== '')
                        .slice(0, 5)
                        .map(([key, value]) => (
                          <span key={key} className="mr-4">
                            <span className="font-medium">{key}:</span>{' '}
                            {String(value).slice(0, 50)}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render knowledge graph
  const renderKnowledgeGraph = () => {
    if (!response) return null;

    const { nodes, edges, clusters } = response.knowledgeGraph;

    return (
      <div className="space-y-4">
        {/* Clusters */}
        {clusters.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="h-5 w-5" />
                Entity Clusters
              </CardTitle>
              <CardDescription>
                Groups of related entities found in the data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {clusters.slice(0, 10).map((cluster) => (
                  <div key={cluster.id} className="p-3 border rounded-lg">
                    <div className="font-medium mb-2">{cluster.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {cluster.nodes.length} connected entities
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top entities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Entities</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {nodes.slice(0, 50).map((node) => {
                  const config = entityConfig[node.type] || entityConfig.name;
                  const Icon = config.icon;
                  
                  return (
                    <div
                      key={node.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${config.color} text-white`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium">{node.value}</div>
                          <div className="text-xs text-muted-foreground">
                            {node.type} · {node.sources.join(', ')}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline">{node.count}</Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Strong connections */}
        {edges.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Strong Connections</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {edges.filter(e => e.weight >= 2).slice(0, 20).map((edge, i) => {
                  const sourceNode = nodes.find(n => n.id === edge.source);
                  const targetNode = nodes.find(n => n.id === edge.target);
                  
                  if (!sourceNode || !targetNode) return null;
                  
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 border rounded">
                      <Badge variant="outline">{sourceNode.value}</Badge>
                      <span className="text-muted-foreground">↔</span>
                      <Badge variant="outline">{targetNode.value}</Badge>
                      <Badge variant="secondary">{edge.weight}x</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Render insights
  const renderInsights = () => {
    if (!response) return null;

    const { insights, metadata } = response;

    return (
      <div className="space-y-4">
        {/* Summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Analysis Summary
            </CardTitle>
            {metadata.localAIUsed && (
              <Badge variant="outline" className="w-fit gap-1">
                <Zap className="h-3 w-3" />
                Local AI ({metadata.aiModel})
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-lg">{insights.summary}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Confidence:</span>
              <Progress value={insights.confidence * 100} className="h-2 w-32" />
              <span className="text-sm font-medium">
                {(insights.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Key Findings */}
        {insights.keyFindings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Key Findings</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {insights.keyFindings.map((finding, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Entity Connections */}
        {insights.entityConnections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Entity Connections</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {insights.entityConnections.map((conn, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Network className="h-5 w-5 text-blue-500 mt-0.5" />
                    <span>{conn}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Recommendations */}
        {insights.recommendations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {insights.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Sparkles className="h-5 w-5 text-amber-500 mt-0.5" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Duration:</span>{' '}
                <span className="font-medium">{metadata.duration.toLocaleString()}ms</span>
              </div>
              <div>
                <span className="text-muted-foreground">API Calls:</span>{' '}
                <span className="font-medium">{metadata.apiCalls}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Pages Fetched:</span>{' '}
                <span className="font-medium">{metadata.pagesFetched}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Iterations:</span>{' '}
                <span className="font-medium">{metadata.iterations}</span>
              </div>
              <div>
                <span className="text-muted-foreground">High-Value Entities:</span>{' '}
                <span className="font-medium text-green-600">{metadata.highValueEntities}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Low-Value Entities:</span>{' '}
                <span className="font-medium text-gray-500">{metadata.lowValueEntities}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Intelligent Search
          </CardTitle>
          <CardDescription>
            Uses AI to extract unique identifiers and find precise results.
            Only searches for HIGH-VALUE entities (phone, email, ID, account).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter search query (e.g., '9635036967' or 'rahul@gmail.com')"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
              className="flex-1"
            />
            {isLoading ? (
              <Button variant="destructive" onClick={cancelSearch}>
                Cancel
              </Button>
            ) : (
              <Button onClick={executeSearch} disabled={!query.trim()}>
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            )}
          </div>

          {/* Progress */}
          {isLoading && progress && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {progress.message}
                </span>
                <span className="text-muted-foreground">{progress.progress}%</span>
              </div>
              <Progress value={progress.progress} />
              {progress.discoveredEntities && progress.discoveredEntities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-sm text-muted-foreground">New identifiers:</span>
                  {progress.discoveredEntities.map((entity, i) => (
                    <Badge key={i} variant="outline" className="bg-green-50">
                      {entity}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Query Analysis */}
      {response && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Query Analysis</CardTitle>
            <CardDescription>
              Intent: {response.query.intent}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {/* Search Criteria (HIGH VALUE) */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-green-500" />
                  Search Terms (HIGH VALUE)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {response.query.searchCriteria.map((c, i) => (
                    <Badge key={i} className="bg-green-600">
                      {c.category}: {c.value}
                    </Badge>
                  ))}
                  {response.query.searchCriteria.length === 0 && (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                </div>
              </div>

              {/* Filter Criteria (LOW VALUE) */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  Filter Terms (LOW VALUE)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {response.query.filterCriteria.map((c, i) => (
                    <Badge key={i} variant="secondary">
                      {c.category}: {c.value}
                    </Badge>
                  ))}
                  {response.query.filterCriteria.length === 0 && (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Tabs */}
      {response && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="results">
              <FileText className="h-4 w-4 mr-2" />
              Results ({response.uniqueResults})
            </TabsTrigger>
            <TabsTrigger value="graph">
              <Network className="h-4 w-4 mr-2" />
              Knowledge Graph
            </TabsTrigger>
            <TabsTrigger value="insights">
              <Brain className="h-4 w-4 mr-2" />
              AI Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="mt-4">
            {renderResults()}
          </TabsContent>

          <TabsContent value="graph" className="mt-4">
            {renderKnowledgeGraph()}
          </TabsContent>

          <TabsContent value="insights" className="mt-4">
            {renderInsights()}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default IntelligentSearchView;
