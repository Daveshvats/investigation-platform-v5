'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface SearchResult {
  success: boolean;
  query: string;
  parsedQuery: {
    intent: string;
    entities: Array<{
      type: string;
      value: string;
      priority: string;
      confidence: number;
    }>;
    filters: any[];
    timeRange?: any;
    suggestedActions: string[];
  };
  extraction: {
    totalEntities: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    entityBreakdown: Record<string, number>;
  };
  graph: {
    nodeCount: number;
    edgeCount: number;
    clusters: number;
    avgConnectivity: number;
  };
  correlation: {
    patternsCount: number;
    anomaliesCount: number;
    insightsCount: number;
    riskIndicatorsCount: number;
    topInsights: Array<{
      title: string;
      description: string;
      confidence: number;
    }>;
    topRisks: Array<{
      type: string;
      severity: string;
      score: number;
    }>;
  };
  report: {
    id: string;
    title: string;
    classification: string;
    status: string;
    executiveSummary: string;
    overallRisk: string;
    riskScore: number;
    recommendations: string[];
  } | null;
  timeline: Array<{
    timestamp: string;
    type: string;
    description: string;
  }>;
  metadata: {
    processingTime: number;
    modelUsed: string;
    timestamp: string;
    version: string;
  };
}

export function InvestigationSearchViewV2() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 500);

    try {
      const response = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          options: {
            maxIterations: 3,
            extractEntities: true,
            buildGraph: true,
            analyzeCorrelations: true,
            generateReport: true,
          },
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      setResult(data);
      setProgress(100);
    } catch (err: any) {
      setError(err.message);
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
    }
  }, [query]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'bg-red-500';
      case 'MEDIUM': return 'bg-yellow-500';
      case 'LOW': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Investigation Platform V2
        </h1>
        <p className="text-muted-foreground">
          2026-standard entity extraction, knowledge graph construction, and AI-powered insights
        </p>
        <div className="flex justify-center gap-2 mt-4">
          <Badge variant="outline" className="text-xs">Hybrid NER</Badge>
          <Badge variant="outline" className="text-xs">Semantic Search</Badge>
          <Badge variant="outline" className="text-xs">Knowledge Graph</Badge>
          <Badge variant="outline" className="text-xs">Local AI</Badge>
        </div>
      </div>

      {/* Search Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Investigation Query</CardTitle>
          <CardDescription>
            Enter your investigation query in natural language. Examples:
            <span className="block mt-2 text-xs space-y-1">
              <code className="bg-muted px-2 py-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => setQuery('Find all people connected to Rahul from Mumbai having phone starting with 987')}>
                Find all people connected to Rahul from Mumbai having phone starting with 987
              </code>
              <code className="bg-muted px-2 py-1 rounded cursor-pointer hover:bg-muted/80 ml-2" onClick={() => setQuery('Show transactions between 9876543210 and any account in last 6 months')}>
                Show transactions between 9876543210 and any account in last 6 months
              </code>
              <code className="bg-muted px-2 py-1 rounded cursor-pointer hover:bg-muted/80 ml-2" onClick={() => setQuery('Analyze patterns for PAN ABCDE1234F')}>
                Analyze patterns for PAN ABCDE1234F
              </code>
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <textarea
              className="flex-1 min-h-[100px] p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your investigation query..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handleSearch();
                }
              }}
            />
            <div className="flex flex-col gap-2">
              <Button 
                onClick={handleSearch} 
                disabled={loading || !query.trim()}
                className="h-12 px-6"
              >
                {loading ? 'Analyzing...' : 'Investigate'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => { setQuery(''); setResult(null); setError(null); }}
                disabled={loading}
              >
                Clear
              </Button>
            </div>
          </div>

          {loading && (
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{result.extraction.totalEntities}</div>
                <div className="text-sm text-muted-foreground">Entities Found</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{result.graph.nodeCount}</div>
                <div className="text-sm text-muted-foreground">Graph Nodes</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{result.correlation.patternsCount}</div>
                <div className="text-sm text-muted-foreground">Patterns</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Badge className={getRiskColor(result.report?.overallRisk || 'low')}>
                    {result.report?.overallRisk?.toUpperCase() || 'LOW'}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">Risk Level</div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Results */}
          <Tabs defaultValue="entities" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="entities">Entities</TabsTrigger>
              <TabsTrigger value="graph">Graph</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="report">Report</TabsTrigger>
            </TabsList>

            {/* Entities Tab */}
            <TabsContent value="entities">
              <Card>
                <CardHeader>
                  <CardTitle>Extracted Entities</CardTitle>
                  <CardDescription>
                    Intent: <Badge variant="outline">{result.parsedQuery.intent}</Badge>
                    <span className="ml-4">
                      Processing time: {result.metadata.processingTime}ms
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Entity Breakdown */}
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(result.extraction.entityBreakdown).map(([type, count]) => (
                        <Badge key={type} variant="secondary">
                          {type}: {count}
                        </Badge>
                      ))}
                    </div>

                    {/* Entity List */}
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-background">
                          <tr className="border-b">
                            <th className="text-left py-2">Type</th>
                            <th className="text-left py-2">Value</th>
                            <th className="text-left py-2">Priority</th>
                            <th className="text-left py-2">Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.parsedQuery.entities.map((entity, i) => (
                            <tr key={i} className="border-b hover:bg-muted/50">
                              <td className="py-2">
                                <Badge variant="outline">{entity.type}</Badge>
                              </td>
                              <td className="py-2 font-mono text-sm">{entity.value}</td>
                              <td className="py-2">
                                <Badge className={getPriorityColor(entity.priority)}>
                                  {entity.priority}
                                </Badge>
                              </td>
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  <Progress value={entity.confidence * 100} className="w-20 h-2" />
                                  <span className="text-xs">{(entity.confidence * 100).toFixed(0)}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Graph Tab */}
            <TabsContent value="graph">
              <Card>
                <CardHeader>
                  <CardTitle>Knowledge Graph</CardTitle>
                  <CardDescription>
                    Network analysis of entities and relationships
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{result.graph.nodeCount}</div>
                      <div className="text-sm text-muted-foreground">Nodes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{result.graph.edgeCount}</div>
                      <div className="text-sm text-muted-foreground">Edges</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{result.graph.clusters}</div>
                      <div className="text-sm text-muted-foreground">Clusters</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{result.graph.avgConnectivity.toFixed(2)}</div>
                      <div className="text-sm text-muted-foreground">Avg. Connectivity</div>
                    </div>
                  </div>

                  <div className="bg-muted rounded-lg p-8 text-center">
                    <p className="text-muted-foreground">
                      Interactive graph visualization would be rendered here.
                      <br />
                      <span className="text-sm">
                        (Integration with D3.js or React Flow recommended)
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Insights Tab */}
            <TabsContent value="insights">
              <div className="space-y-4">
                {/* Top Insights */}
                <Card>
                  <CardHeader>
                    <CardTitle>Key Insights</CardTitle>
                    <CardDescription>
                      AI-generated insights from correlation analysis
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {result.correlation.topInsights.map((insight, i) => (
                        <div key={i} className="border-l-4 border-blue-500 pl-4">
                          <div className="font-semibold">{insight.title}</div>
                          <p className="text-sm text-muted-foreground">{insight.description}</p>
                          <div className="mt-2">
                            <Progress value={insight.confidence * 100} className="w-32 h-2" />
                            <span className="text-xs text-muted-foreground ml-2">
                              {(insight.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Risk Indicators */}
                <Card>
                  <CardHeader>
                    <CardTitle>Risk Indicators</CardTitle>
                    <CardDescription>
                      Identified risk factors and their severity
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {result.correlation.topRisks.map((risk, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <Badge className={getSeverityColor(risk.severity)}>
                              {risk.severity.toUpperCase()}
                            </Badge>
                            <span className="ml-3">{risk.type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={risk.score * 100} className="w-20 h-2" />
                            <span className="text-sm font-mono">{risk.score.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                      {result.correlation.topRisks.length === 0 && (
                        <p className="text-muted-foreground text-center py-4">
                          No significant risk indicators detected
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline">
              <Card>
                <CardHeader>
                  <CardTitle>Event Timeline</CardTitle>
                  <CardDescription>
                    Chronological sequence of discovered events
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                    <div className="space-y-4">
                      {result.timeline.map((event, i) => (
                        <div key={i} className="relative pl-10">
                          <div className="absolute left-2 top-2 w-4 h-4 rounded-full bg-blue-500 border-2 border-background" />
                          <div className="border rounded-lg p-3">
                            <div className="flex justify-between items-start">
                              <Badge variant="outline">{event.type}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(event.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <p className="mt-2 text-sm">{event.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Report Tab */}
            <TabsContent value="report">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{result.report?.title}</CardTitle>
                      <CardDescription>
                        ID: {result.report?.id} | Classification: {result.report?.classification}
                      </CardDescription>
                    </div>
                    <Badge className={getRiskColor(result.report?.overallRisk || 'low')}>
                      Risk: {result.report?.riskScore.toFixed(2)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Executive Summary */}
                    <div>
                      <h3 className="font-semibold mb-2">Executive Summary</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {result.report?.executiveSummary}
                      </p>
                    </div>

                    {/* Recommendations */}
                    <div>
                      <h3 className="font-semibold mb-2">Recommendations</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {result.report?.recommendations.map((rec, i) => (
                          <li key={i} className="text-sm text-muted-foreground">{rec}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Suggested Actions */}
                    <div>
                      <h3 className="font-semibold mb-2">Suggested Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        {result.parsedQuery.suggestedActions.map((action, i) => (
                          <Badge key={i} variant="secondary">{action}</Badge>
                        ))}
                      </div>
                    </div>

                    {/* Export Options */}
                    <div className="flex gap-2 pt-4 border-t">
                      <Button variant="outline" size="sm">
                        Export PDF
                      </Button>
                      <Button variant="outline" size="sm">
                        Export JSON
                      </Button>
                      <Button variant="outline" size="sm">
                        Share Report
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Metadata */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Model: {result.metadata.modelUsed}</span>
                <span>Version: {result.metadata.version}</span>
                <span>Generated: {new Date(result.metadata.timestamp).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default InvestigationSearchViewV2;
