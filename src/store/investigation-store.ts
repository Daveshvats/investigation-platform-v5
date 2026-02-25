/**
 * Investigation Platform State Store
 * Uses Zustand for state management
 * Supports V2 enhanced features
 */

import { create } from 'zustand';

// ============================================================================
// TYPES
// ============================================================================

export interface Entity {
  type: string;
  value: string;
  originalText: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
}

export interface SearchResult {
  id: string;
  tableName: string;
  data: Record<string, unknown>;
  matchedFields: string[];
  matchedEntities: Entity[];
  score: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  entityType: string;
  value: string;
  connections: string[];
  occurrences: number;
  sources: string[];
  riskScore?: number;
  cluster?: string;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  weight: number;
  sources: string[];
  strength?: string;
  confidence?: number;
}

export interface CorrelationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SearchInsights {
  highValueMatches: number;
  totalConnections: number;
  entityBreakdown: Record<string, number>;
  topEntities: Array<{ value: string; type: string; occurrences: number }>;
  redFlags: string[];
  patterns: string[];
  recommendations: string[];
}

export interface V2Insights {
  patterns: number;
  anomalies: number;
  riskIndicators: number;
}

export interface InvestigationReport {
  title: string;
  executiveSummary: string;
  methodology: string;
  findings: any[];
  entityAnalysis: any;
  relationshipAnalysis: any;
  recommendations: string[];
  riskAssessment: any;
  conclusion: string;
  generatedAt: string;
  modelUsed: string;
}

export interface SearchState {
  // Query state
  query: string;
  setQuery: (query: string) => void;

  // Loading state
  isSearching: boolean;
  setIsSearching: (isSearching: boolean) => void;
  searchProgress: {
    phase: string;
    message: string;
    progress: number;
  };
  setSearchProgress: (progress: { phase: string; message: string; progress: number }) => void;

  // Results state
  extraction: {
    entities: Entity[];
    highValue: Entity[];
    mediumValue: Entity[];
    lowValue: Entity[];
    relationships: any[];
  } | null;
  setExtraction: (extraction: any) => void;

  results: SearchResult[];
  setResults: (results: SearchResult[]) => void;

  correlationGraph: CorrelationGraph | null;
  setCorrelationGraph: (graph: CorrelationGraph | null) => void;

  insights: SearchInsights | null;
  setInsights: (insights: SearchInsights | null) => void;

  // V2 Enhanced Insights
  v2Insights: V2Insights | null;
  setV2Insights: (insights: V2Insights | null) => void;

  report: InvestigationReport | null;
  setReport: (report: InvestigationReport | null) => void;

  // Metadata
  metadata: {
    searchTime: number;
    entitiesSearched: number;
    iterationsPerformed: number;
    totalRecordsSearched: number;
    v2Enabled?: boolean;
  } | null;
  setMetadata: (metadata: any) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // UI state
  activeTab: 'results' | 'graph' | 'insights' | 'report';
  setActiveTab: (tab: 'results' | 'graph' | 'insights' | 'report') => void;

  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;

  // V2 Feature toggles
  v2Enabled: boolean;
  setV2Enabled: (enabled: boolean) => void;

  // Actions
  reset: () => void;

  // Report options
  reportOptions: {
    includeGraph: boolean;
    includeRawData: boolean;
    classification: string;
    organization: string;
    caseNumber: string;
    investigatorName: string;
  };
  setReportOptions: (options: Partial<SearchState['reportOptions']>) => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useInvestigationStore = create<SearchState>((set) => ({
  // Query
  query: '',
  setQuery: (query) => set({ query }),

  // Loading
  isSearching: false,
  setIsSearching: (isSearching) => set({ isSearching }),
  searchProgress: { phase: '', message: '', progress: 0 },
  setSearchProgress: (searchProgress) => set({ searchProgress }),

  // Results
  extraction: null,
  setExtraction: (extraction) => set({ extraction }),

  results: [],
  setResults: (results) => set({ results }),

  correlationGraph: null,
  setCorrelationGraph: (correlationGraph) => set({ correlationGraph }),

  insights: null,
  setInsights: (insights) => set({ insights }),

  // V2 Insights
  v2Insights: null,
  setV2Insights: (v2Insights) => set({ v2Insights }),

  report: null,
  setReport: (report) => set({ report }),

  // Metadata
  metadata: null,
  setMetadata: (metadata) => set({ metadata }),

  // Error
  error: null,
  setError: (error) => set({ error }),

  // UI
  activeTab: 'results',
  setActiveTab: (activeTab) => set({ activeTab }),

  selectedNode: null,
  setSelectedNode: (selectedNode) => set({ selectedNode }),

  // V2 Toggle
  v2Enabled: true,
  setV2Enabled: (v2Enabled) => set({ v2Enabled }),

  // Report options
  reportOptions: {
    includeGraph: true,
    includeRawData: false,
    classification: 'CONFIDENTIAL',
    organization: 'Investigation Unit',
    caseNumber: '',
    investigatorName: '',
  },
  setReportOptions: (options) => set((state) => ({
    reportOptions: { ...state.reportOptions, ...options },
  })),

  // Reset
  reset: () => set({
    query: '',
    isSearching: false,
    searchProgress: { phase: '', message: '', progress: 0 },
    extraction: null,
    results: [],
    correlationGraph: null,
    insights: null,
    v2Insights: null,
    report: null,
    metadata: null,
    error: null,
    activeTab: 'results',
    selectedNode: null,
  }),
}));
