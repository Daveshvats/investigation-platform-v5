'use client';

/**
 * Investigation Search View
 * Main search component with V2 enhancements
 * Features: Results, Graph, Insights, Report tabs
 */

import React, { useState, useCallback } from 'react';
import { useInvestigationStore } from '@/store/investigation-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Search, 
  Download, 
  Network, 
  AlertTriangle, 
  FileText, 
  Lightbulb,
  Loader2,
  Table,
  RefreshCcw,
  Sparkles,
  Shield
} from 'lucide-react';
import { CorrelationGraphView } from './correlation-graph-view';
import { SearchResultsTable } from './search-results-table';
import { InsightsPanel } from './insights-panel';
import { ReportPanel } from './report-panel';

export function InvestigationSearchView() {
  const {
    query,
    setQuery,
    isSearching,
    setIsSearching,
    searchProgress,
    setSearchProgress,
    extraction,
    setExtraction,
    results,
    setResults,
    correlationGraph,
    setCorrelationGraph,
    insights,
    setInsights,
    v2Insights,
    setV2Insights,
    report,
    setReport,
    metadata,
    setMetadata,
    error,
    setError,
    activeTab,
    setActiveTab,
    v2Enabled,
    setV2Enabled,
    reset,
  } = useInvestigationStore();

  // Execute search
  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setIsSearching(true);
    setError(null);
    reset();
    setQuery(query);

    try {
      setSearchProgress({ phase: 'extracting', message: 'Extracting entities...', progress: 10 });

      const response = await fetch('/api/search/robust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          options: {
            maxIterations: 5,
            maxResultsPerEntity: 100,
            includeGraph: true,
            generateReport: false,
            enableV2: v2Enabled,
            analyzeCorrelations: v2Enabled,
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }

      setSearchProgress({ phase: 'complete', message: 'Search complete!', progress: 100 });

      setExtraction(data.extraction);
      setResults(data.results);
      setCorrelationGraph(data.correlationGraph);
      setInsights(data.insights);
      setV2Insights(data.v2Insights || null);
      setMetadata(data.metadata);

      // Switch to results tab
      setActiveTab('results');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [query, v2Enabled, reset, setActiveTab, setError, setExtraction, setInsights, setCorrelationGraph, setIsSearching, setMetadata, setResults, setSearchProgress, setV2Insights]);

  // Generate report
  const handleGenerateReport = useCallback(async () => {
    if (!results.length) {
      setError('No results to generate report from');
      return;
    }

    setIsSearching(true);
    setSearchProgress({ phase: 'reporting', message: 'Generating AI-powered report...', progress: 50 });

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          results,
          insights,
          correlationGraph,
          options: {
            includeGraph: true,
            includeRawData: false,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Report generation failed');
      }

      // Get PDF blob
      const blob = await response.blob();
      
      // Download PDF
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investigation-report-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSearchProgress({ phase: 'complete', message: 'Report downloaded!', progress: 100 });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setIsSearching(false);
    }
  }, [query, results, insights, correlationGraph, setError, setIsSearching, setSearchProgress]);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      handleSearch();
    }
  };

  // Example queries
  const exampleQueries = [
    'find subodh from delhi having phone 9748247177',
    'rahul sharma connected to aman verma',
    'phone 9876543210 in mumbai',
    'PAN ABCDE1234F transactions',
  ];

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Search Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Search className="h-5 w-5" />
                Investigation Search
                {v2Enabled && (
                  <Badge variant="default" className="ml-2 bg-gradient-to-r from-blue-600 to-purple-600">
                    <Sparkles className="h-3 w-3 mr-1" />
                    V2 Enhanced
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {v2Enabled 
                  ? '2026-standard: Hybrid NER, Knowledge Graph, Pattern Detection, Risk Analysis'
                  : 'Regex-based entity extraction finds phones, emails, PAN, Aadhaar, names, and more.'
                }
              </CardDescription>
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
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="e.g., find subodh from delhi having phone 9748247177"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              disabled={isSearching}
            />
            <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
            {results.length > 0 && (
              <Button variant="outline" onClick={reset}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reset
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
                onClick={() => setQuery(q)}
              >
                {q}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Progress Bar */}
      {isSearching && searchProgress.progress > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">{searchProgress.message}</p>
                <Progress value={searchProgress.progress} className="h-1 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Extracted Entities Summary */}
      {extraction && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-green-900">Extracted Entities:</span>
              {extraction.highValue.length > 0 && (
                <div className="flex items-center gap-1">
                  <Badge variant="default" className="bg-red-500">
                    HIGH: {extraction.highValue.length}
                  </Badge>
                  <span className="text-xs text-green-800">
                    ({extraction.highValue.map(e => e.value).join(', ')})
                  </span>
                </div>
              )}
              {extraction.mediumValue.length > 0 && (
                <Badge variant="secondary">
                  MEDIUM: {extraction.mediumValue.length}
                </Badge>
              )}
              {extraction.lowValue.length > 0 && (
                <Badge variant="outline">
                  LOW: {extraction.lowValue.length}
                </Badge>
              )}
              {extraction.relationships.length > 0 && (
                <Badge variant="outline" className="border-purple-300 text-purple-700">
                  Relationships: {extraction.relationships.length}
                </Badge>
              )}
              
              {/* V2 Insights Badge */}
              {v2Insights && v2Enabled && (
                <div className="flex items-center gap-2 ml-auto">
                  <Badge variant="outline" className="border-blue-400 text-blue-700">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {v2Insights.patterns} patterns
                  </Badge>
                  {v2Insights.anomalies > 0 && (
                    <Badge variant="outline" className="border-orange-400 text-orange-700">
                      {v2Insights.anomalies} anomalies
                    </Badge>
                  )}
                  {v2Insights.riskIndicators > 0 && (
                    <Badge variant="outline" className="border-red-400 text-red-700">
                      {v2Insights.riskIndicators} risks
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="flex-1 min-h-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="results" className="flex items-center gap-1">
                  <Table className="h-4 w-4" />
                  Results ({results.length})
                </TabsTrigger>
                <TabsTrigger value="graph" className="flex items-center gap-1">
                  <Network className="h-4 w-4" />
                  Graph ({correlationGraph?.nodes?.length || 0} nodes)
                </TabsTrigger>
                <TabsTrigger value="insights" className="flex items-center gap-1">
                  <Lightbulb className="h-4 w-4" />
                  Insights
                  {v2Enabled && v2Insights && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      V2
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="report" className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  Report
                </TabsTrigger>
              </TabsList>

              <Button onClick={handleGenerateReport} disabled={isSearching}>
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>

            <div className="flex-1 mt-4 overflow-hidden">
              <TabsContent value="results" className="h-full m-0">
                <SearchResultsTable results={results} />
              </TabsContent>

              <TabsContent value="graph" className="h-full m-0">
                {correlationGraph && (
                  <CorrelationGraphView graph={correlationGraph} />
                )}
              </TabsContent>

              <TabsContent value="insights" className="h-full m-0 overflow-auto">
                {insights && <InsightsPanel insights={insights} />}
              </TabsContent>

              <TabsContent value="report" className="h-full m-0 overflow-auto">
                <ReportPanel query={query} results={results} insights={insights} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}

      {/* Metadata Footer */}
      {metadata && (
        <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
          <div className="flex gap-4">
            <span>Search time: {metadata.searchTime}ms</span>
            <span>Entities searched: {metadata.entitiesSearched}</span>
            <span>Iterations: {metadata.iterationsPerformed}</span>
            <span>Records: {metadata.totalRecordsSearched}</span>
          </div>
          {metadata.v2Enabled && (
            <Badge variant="outline" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              V2 Engine Enabled
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
