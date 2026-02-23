'use client';

import React, { useState, useCallback } from 'react';
import { CorrelationGraphView } from './correlation-graph-view';
import type { RobustSearchResponse } from '@/lib/robust-agent-search';

interface RobustSearchViewProps {
  apiBaseUrl?: string;
  bearerToken?: string;
}

export function RobustSearchView({ apiBaseUrl, bearerToken }: RobustSearchViewProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{
    stage: string;
    message: string;
    progress: number;
  } | null>(null);
  const [result, setResult] = useState<RobustSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'results' | 'graph' | 'all'>('results');
  const [selectedTable, setSelectedTable] = useState<string>('all');

  // Execute search
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress({ stage: 'starting', message: 'Initializing search...', progress: 0 });

    try {
      const response = await fetch('/api/robust-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          apiBaseUrl,
          bearerToken,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }

      setResult(data);
      setProgress(null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, [query, apiBaseUrl, bearerToken]);

  // Export to CSV
  const handleExportCSV = useCallback(async () => {
    if (!result) return;

    try {
      const response = await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: result.filteredResults,
          query: result.query.originalQuery,
        }),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `search_results_${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [result]);

  // Get unique tables
  const tables = React.useMemo(() => {
    if (!result) return [];
    const tableSet = new Set<string>();
    result.filteredResults.forEach(r => tableSet.add(r.table));
    return Array.from(tableSet);
  }, [result]);

  // Filter results by table
  const displayResults = React.useMemo(() => {
    if (!result) return [];
    if (selectedTable === 'all') return result.filteredResults;
    return result.filteredResults.filter(r => r.table === selectedTable);
  }, [result, selectedTable]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Search Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            🔍 Robust Agent Search
          </h1>
          
          {/* Search Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g., rahul sharma from delhi having no. 9876543210"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Progress Bar */}
          {progress && (
            <div className="mt-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>{progress.message}</span>
                <span>{Math.round(progress.progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Results Area */}
      {result && (
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Stats Bar */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <span className="text-gray-500 text-sm">Search Term:</span>
                    <span className="ml-2 font-mono font-medium text-blue-600">
                      {result.metadata.primarySearchTerm}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm">Fetched:</span>
                    <span className="ml-2 font-medium">{result.totalFetched}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm">Filtered:</span>
                    <span className="ml-2 font-medium text-green-600">{result.totalFiltered}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm">API Calls:</span>
                    <span className="ml-2 font-medium">{result.metadata.apiCalls}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm">Duration:</span>
                    <span className="ml-2 font-medium">
                      {(result.metadata.duration / 1000).toFixed(2)}s
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                >
                  📥 Export CSV
                </button>
              </div>

              {/* Filters Applied */}
              {result.metadata.filtersApplied.length > 0 && (
                <div className="mt-3">
                  <span className="text-gray-500 text-sm">Filters Applied: </span>
                  {result.metadata.filtersApplied.map((filter, i) => (
                    <span
                      key={i}
                      className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full mr-1"
                    >
                      {filter}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-200 px-4">
              <div className="max-w-7xl mx-auto flex gap-1">
                <button
                  onClick={() => setActiveTab('results')}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                    activeTab === 'results'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📋 Results ({result.totalFiltered})
                </button>
                <button
                  onClick={() => setActiveTab('graph')}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                    activeTab === 'graph'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🔗 Correlation Graph ({result.correlationGraph.nodes.length})
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                    activeTab === 'all'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📊 All Data ({result.totalFetched})
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-7xl mx-auto">
                {/* Results Tab */}
                {activeTab === 'results' && (
                  <div className="space-y-4">
                    {/* Table Filter */}
                    {tables.length > 1 && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedTable('all')}
                          className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            selectedTable === 'all'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          All Tables
                        </button>
                        {tables.map(table => (
                          <button
                            key={table}
                            onClick={() => setSelectedTable(table)}
                            className={`px-3 py-1 rounded-lg text-sm font-medium ${
                              selectedTable === table
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {table}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Results List */}
                    {displayResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        No results match the filter criteria
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {displayResults.map((item, index) => (
                          <div
                            key={item.id}
                            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs text-gray-500">#{index + 1}</span>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                                    {item.table}
                                  </span>
                                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                                    Score: {Math.round(item.matchScore * 100)}%
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
                                  {Object.entries(item.record)
                                    .slice(0, 8)
                                    .map(([key, value]) => {
                                      const isHighlighted = key in item.highlights;
                                      return (
                                        <div key={key}>
                                          <span className="text-gray-500 text-xs">{key}:</span>
                                          <div
                                            className={`font-medium truncate ${
                                              isHighlighted ? 'text-blue-600' : 'text-gray-900'
                                            }`}
                                            title={String(value)}
                                            dangerouslySetInnerHTML={{
                                              __html: isHighlighted
                                                ? item.highlights[key].replace(/\*\*/g, '<mark class="bg-yellow-200">').replace(/\*\*/g, '</mark>')
                                                : String(value),
                                            }}
                                          />
                                        </div>
                                      );
                                    })}
                                </div>
                                {item.matchedFilters.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {item.matchedFilters.map((filter, i) => (
                                      <span
                                        key={i}
                                        className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded"
                                      >
                                        ✓ {filter}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Graph Tab */}
                {activeTab === 'graph' && (
                  <CorrelationGraphView
                    graph={result.correlationGraph}
                    results={result.filteredResults}
                  />
                )}

                {/* All Data Tab */}
                {activeTab === 'all' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-medium text-blue-900 mb-2">
                        📊 All Fetched Data ({result.totalFetched} records)
                      </h3>
                      <p className="text-sm text-blue-700 mb-3">
                        This shows all data fetched from the API across {result.metadata.apiCalls} pages.
                        {result.metadata.cursorsUsed.length > 0 && (
                          <> Pagination used {result.metadata.cursorsUsed.length} cursors.</>
                        )}
                      </p>
                      <div className="text-sm text-blue-700">
                        <strong>Insights:</strong> {result.insights.summary}
                      </div>
                    </div>

                    {/* Patterns */}
                    {result.insights.patterns.length > 0 && (
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="font-medium text-gray-900 mb-2">🔍 Detected Patterns</h4>
                        <ul className="space-y-1">
                          {result.insights.patterns.map((pattern, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start">
                              <span className="text-blue-500 mr-2">•</span>
                              {pattern}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Entity Connections */}
                    {result.insights.entityConnections.length > 0 && (
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="font-medium text-gray-900 mb-2">🔗 Top Entity Connections</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left p-2">Entity</th>
                                <th className="text-left p-2">Type</th>
                                <th className="text-right p-2">Appearances</th>
                                <th className="text-left p-2">Tables</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.insights.entityConnections.slice(0, 20).map((conn, i) => (
                                <tr key={i} className="border-b border-gray-100">
                                  <td className="p-2 font-medium">{conn.entity}</td>
                                  <td className="p-2">
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                      {conn.type}
                                    </span>
                                  </td>
                                  <td className="p-2 text-right">{conn.appearances}</td>
                                  <td className="p-2 text-gray-500 text-xs">
                                    {conn.tables.join(', ')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {result.insights.recommendations.length > 0 && (
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="font-medium text-gray-900 mb-2">💡 Recommendations</h4>
                        <ul className="space-y-1">
                          {result.insights.recommendations.map((rec, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start">
                              <span className="text-green-500 mr-2">→</span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-xl font-medium text-gray-900 mb-2">
              Robust Agent Search
            </h2>
            <p className="text-gray-600 mb-4">
              Enter a search query to find all matching records. The agent will:
            </p>
            <ul className="text-left text-sm text-gray-600 space-y-2">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">1.</span>
                Extract search criteria (phone, email, ID, name, location)
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">2.</span>
                Search the primary term with full pagination (all results)
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">3.</span>
                Filter results by secondary criteria
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">4.</span>
                Build correlation graphs and generate insights
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default RobustSearchView;
