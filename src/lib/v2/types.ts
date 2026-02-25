/**
 * Investigation Platform V2 - Shared Types
 * 2026-standard architecture with comprehensive type definitions
 */

// ============================================================================
// ENTITY TYPES
// ============================================================================

export type EntityPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'CONTEXTUAL';

export type EntityType =
  | 'phone'
  | 'email'
  | 'pan_number'
  | 'aadhaar_number'
  | 'aadhaar_vid'
  | 'upi_id'
  | 'account_number'
  | 'ifsc_code'
  | 'vehicle_number'
  | 'ip_address'
  | 'url'
  | 'address'
  | 'name'
  | 'organization'
  | 'location'
  | 'date'
  | 'amount'
  | 'id_number'
  | 'pincode'
  | 'crypto_address'
  | 'social_handle'
  | 'unknown';

export interface Entity {
  id: string;
  type: EntityType;
  value: string;
  normalizedValue: string;
  originalText: string;
  priority: EntityPriority;
  confidence: number;
  source: 'regex' | 'ner' | 'fuzzy' | 'context';
  position?: { start: number; end: number };
  metadata?: EntityMetadata;
  embeddings?: number[];
  aliases?: string[];
}

export interface EntityMetadata {
  format?: string;
  validated?: boolean;
  linkedEntities?: string[];
  context?: string;
  tags?: string[];
  [key: string]: unknown;
}

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================

export type RelationshipType =
  | 'family'
  | 'associate'
  | 'financial'
  | 'communication'
  | 'location'
  | 'employment'
  | 'ownership'
  | 'transaction'
  | 'co_occurrence'
  | 'inferred';

export type RelationshipStrength = 'strong' | 'moderate' | 'weak' | 'inferred';

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  strength: RelationshipStrength;
  confidence: number;
  evidence: RelationshipEvidence[];
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;
  metadata?: Record<string, unknown>;
}

export interface RelationshipEvidence {
  source: string;
  context: string;
  timestamp?: Date;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

export type QueryIntent =
  | 'find_entity'
  | 'find_connections'
  | 'find_transactions'
  | 'analyze_patterns'
  | 'generate_report'
  | 'timeline_analysis'
  | 'risk_assessment'
  | 'unknown';

export interface ParsedQuery {
  original: string;
  intent: QueryIntent;
  entities: Entity[];
  filters: QueryFilter[];
  timeRange?: TimeRange;
  location?: string;
  constraints: QueryConstraint[];
  suggestedActions: string[];
}

export interface QueryFilter {
  field: string;
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'between' | 'regex';
  value: string | number | Date;
  entity?: Entity;
}

export interface QueryConstraint {
  type: 'limit' | 'offset' | 'orderBy' | 'groupBy';
  value: number | string;
}

export interface TimeRange {
  start?: Date;
  end?: Date;
  relative?: 'last_24h' | 'last_7d' | 'last_30d' | 'last_90d' | 'last_1y';
}

// ============================================================================
// KNOWLEDGE GRAPH TYPES
// ============================================================================

export interface GraphNode {
  id: string;
  type: EntityType;
  label: string;
  value: string;
  aliases: string[];
  properties: Record<string, unknown>;
  embeddings?: number[];
  incomingEdges: string[];
  outgoingEdges: string[];
  cluster?: string;
  riskScore?: number;
  sources: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  strength: RelationshipStrength;
  weight: number;
  properties: Record<string, unknown>;
  evidence: RelationshipEvidence[];
  confidence: number;
  sources: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphCluster {
  id: string;
  label: string;
  nodes: string[];
  centralNode?: string;
  type: 'suspect_network' | 'financial_ring' | 'location_cluster' | 'communication_ring' | 'auto_detected';
  riskScore: number;
  description?: string;
}

export interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  clusters: Map<string, GraphCluster>;
  metadata: GraphMetadata;
}

export interface GraphMetadata {
  totalNodes: number;
  totalEdges: number;
  nodeTypes: Record<EntityType, number>;
  edgeTypes: Record<RelationshipType, number>;
  avgConnectivity: number;
  lastUpdated: Date;
}

// ============================================================================
// CORRELATION TYPES
// ============================================================================

export interface CorrelationResult {
  patterns: DetectedPattern[];
  anomalies: Anomaly[];
  insights: Insight[];
  riskIndicators: RiskIndicator[];
  timeline: TimelineEvent[];
}

export interface DetectedPattern {
  id: string;
  type: PatternType;
  description: string;
  entities: string[];
  frequency: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  significance: number;
  evidence: string[];
}

export type PatternType =
  | 'frequency_pattern'
  | 'temporal_pattern'
  | 'spatial_pattern'
  | 'financial_pattern'
  | 'communication_pattern'
  | 'behavioral_pattern';

export interface Anomaly {
  id: string;
  type: 'statistical' | 'behavioral' | 'temporal' | 'relational';
  description: string;
  entities: string[];
  score: number;
  threshold: number;
  detected: Date;
  context: string;
}

export interface Insight {
  id: string;
  category: 'connection' | 'risk' | 'pattern' | 'recommendation';
  title: string;
  description: string;
  entities: string[];
  confidence: number;
  actionable: boolean;
  suggestedActions: string[];
}

export interface RiskIndicator {
  id: string;
  type: 'high_value_transactions' | 'frequent_transfers' | 'cross_border' | 'multiple_accounts' | 'unusual_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  entities: string[];
  score: number;
  mitigatingFactors?: string[];
}

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: string;
  description: string;
  entities: string[];
  amount?: number;
  location?: string;
  source: string;
  significance: number;
}

// ============================================================================
// DATA SOURCE TYPES
// ============================================================================

export type DataSourceType = 'database' | 'api' | 'document' | 'web' | 'manual';

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  config: DataSourceConfig;
  status: 'active' | 'inactive' | 'error';
  lastSync?: Date;
  recordCount?: number;
}

export interface DataSourceConfig {
  connectionString?: string;
  apiUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  tableName?: string;
  fieldMapping?: Record<string, string>;
  refreshInterval?: number;
}

export interface DataRecord {
  id: string;
  source: string;
  tableName?: string;
  data: Record<string, unknown>;
  extractedEntities: Entity[];
  extractedRelationships: Relationship[];
  processedAt: Date;
  hash: string;
}

// ============================================================================
// REPORT TYPES
// ============================================================================

export interface InvestigationReport {
  id: string;
  title: string;
  caseNumber?: string;
  classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
  status: 'draft' | 'review' | 'final';
  executiveSummary: string;
  methodology: string;
  findings: Finding[];
  entityAnalysis: EntityAnalysisSection;
  relationshipAnalysis: RelationshipAnalysisSection;
  riskAssessment: RiskAssessment;
  recommendations: string[];
  timeline: TimelineEvent[];
  appendix?: AppendixSection[];
  metadata: ReportMetadata;
}

export interface Finding {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: Evidence[];
  relatedEntities: string[];
  relatedFindings: string[];
}

export interface Evidence {
  type: 'document' | 'transaction' | 'communication' | 'location' | 'relationship';
  description: string;
  source: string;
  reference?: string;
  confidence: number;
}

export interface EntityAnalysisSection {
  summary: string;
  entityBreakdown: Array<{ type: EntityType; count: number; significance: string }>;
  keyEntities: Array<{ entity: Entity; analysis: string }>;
  entityNetwork?: string[];
}

export interface RelationshipAnalysisSection {
  summary: string;
  connections: Array<{ source: string; target: string; relationship: RelationshipType; strength: string }>;
  clusters: GraphCluster[];
  networkMetrics: NetworkMetrics;
}

export interface NetworkMetrics {
  density: number;
  avgDegree: number;
  maxDegree: number;
  connectedComponents: number;
  diameter: number;
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  riskFactors: string[];
  mitigatingFactors: string[];
  confidence: number;
  breakdown: Record<string, number>;
}

export interface AppendixSection {
  title: string;
  type: 'raw_data' | 'methodology' | 'glossary' | 'references';
  content: unknown;
}

export interface ReportMetadata {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  modelUsed?: string;
  generationTime: number;
  dataSources: string[];
}

// ============================================================================
// CONFIG TYPES
// ============================================================================

export interface PlatformConfig {
  entityExtraction: {
    enableRegex: boolean;
    enableNER: boolean;
    enableFuzzy: boolean;
    nerModel: string;
    fuzzyThreshold: number;
  };
  knowledgeGraph: {
    maxNodes: number;
    maxEdges: number;
    enableEmbeddings: boolean;
    embeddingModel: string;
    enableClustering: boolean;
  };
  correlation: {
    anomalyThreshold: number;
    patternMinSupport: number;
    riskWeights: Record<string, number>;
  };
  llm: {
    provider: 'ollama' | 'openai' | 'anthropic';
    model: string;
    fallbackModels: string[];
    temperature: number;
    maxTokens: number;
  };
  api: {
    timeout: number;
    retries: number;
    cacheTTL: number;
  };
}

export const DEFAULT_CONFIG: PlatformConfig = {
  entityExtraction: {
    enableRegex: true,
    enableNER: true,
    enableFuzzy: true,
    nerModel: 'en_core_web_lg',
    fuzzyThreshold: 0.85,
  },
  knowledgeGraph: {
    maxNodes: 100000,
    maxEdges: 500000,
    enableEmbeddings: true,
    embeddingModel: 'all-MiniLM-L6-v2',
    enableClustering: true,
  },
  correlation: {
    anomalyThreshold: 2.5,
    patternMinSupport: 0.1,
    riskWeights: {
      high_value_transactions: 0.3,
      frequent_transfers: 0.2,
      cross_border: 0.25,
      multiple_accounts: 0.15,
      unusual_pattern: 0.1,
    },
  },
  llm: {
    provider: 'ollama',
    model: 'qwen3:4b',
    fallbackModels: ['ministral:8b', 'llama3.2-vision:11b'],
    temperature: 0.5,
    maxTokens: 4096,
  },
  api: {
    timeout: 30000,
    retries: 3,
    cacheTTL: 3600,
  },
};
