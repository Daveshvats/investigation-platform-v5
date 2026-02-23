// Investigation Analysis Types
// Extends the existing API types with investigation-specific functionality

// ============================================================================
// ENTITY TYPES
// ============================================================================

export type EntityType = 
  | 'person'
  | 'company'
  | 'address'
  | 'phone'
  | 'email'
  | 'bank_account'
  | 'document'
  | 'vehicle'
  | 'property'
  | 'transaction'
  | 'website'
  | 'ip_address'
  | 'custom';

export interface BaseEntity {
  id: string;
  type: EntityType;
  name: string;
  aliases?: string[];
  attributes: Record<string, unknown>;
  confidence?: number;
  sources?: string[];
}

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================

export type RelationshipType =
  | 'owns'
  | 'employed_by'
  | 'related_to'
  | 'associated_with'
  | 'located_at'
  | 'contact_via'
  | 'transacted_with'
  | 'shared_address'
  | 'shared_contact'
  | 'director_of'
  | 'shareholder_of'
  | 'authorized_signatory'
  | 'beneficiary'
  | 'suspected_link'
  | 'temporal_proximity'
  | 'financial_link'
  | 'custom';

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  strength: number;
  attributes?: Record<string, unknown>;
  evidence?: Evidence[];
  firstObserved?: Date;
  lastObserved?: Date;
}

export interface Evidence {
  type: 'document' | 'database' | 'testimony' | 'digital' | 'financial';
  reference: string;
  confidence: number;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PATTERN TYPES
// ============================================================================

export type PatternType =
  | 'duplicate_identity'
  | 'address_sharing'
  | 'contact_sharing'
  | 'suspicious_timeline'
  | 'financial_anomaly'
  | 'network_anomaly'
  | 'document_inconsistency'
  | 'rapid_ownership_change'
  | 'circular_transaction'
  | 'hidden_relationship'
  | 'shell_company_indicator'
  | 'unusual_activity_pattern';

export interface PatternIndicator {
  name: string;
  value: unknown;
  threshold: unknown;
  weight: number;
  description: string;
}

export interface DetectedPattern {
  id: string;
  type: PatternType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  entities: string[];
  description: string;
  indicators: PatternIndicator[];
  recommendations: string[];
}

// ============================================================================
// CLUSTER TYPES
// ============================================================================

export interface EntityCluster {
  id: string;
  name: string;
  entities: string[];
  clusterType: 'person_network' | 'company_network' | 'address_group' | 'mixed';
  strength: number;
  summary: string;
}

// ============================================================================
// TIMELINE TYPES
// ============================================================================

export type TimelineEventType =
  | 'registration'
  | 'transaction'
  | 'address_change'
  | 'ownership_change'
  | 'document_filed'
  | 'contact_established'
  | 'account_opened'
  | 'account_closed'
  | 'legal_action'
  | 'investigation_event'
  | 'alert'
  | 'observation'
  | 'custom';

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  endTimestamp?: Date;
  type: TimelineEventType;
  title: string;
  description: string;
  entities: string[];
  importance: 'low' | 'medium' | 'high' | 'critical';
  sources: string[];
  location?: GeoLocation;
  metadata?: Record<string, unknown>;
}

export interface GeoLocation {
  latitude?: number;
  longitude?: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

// ============================================================================
// DATA QUALITY TYPES
// ============================================================================

export interface DataQualityReport {
  overallScore: number;
  dimensions: QualityDimension[];
  issues: DataQualityIssue[];
  recommendations: string[];
  fieldAnalysis: FieldQualityAnalysis[];
}

export interface QualityDimension {
  name: 'completeness' | 'accuracy' | 'consistency' | 'timeliness' | 'validity' | 'uniqueness';
  score: number;
  weight: number;
  details: string;
}

export interface DataQualityIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'missing' | 'invalid' | 'inconsistent' | 'duplicate' | 'outdated' | 'format_error';
  field: string;
  recordId?: string;
  description: string;
  suggestedFix?: string;
  impact: string;
}

export interface FieldQualityAnalysis {
  fieldName: string;
  completeness: number;
  validity: number;
  uniqueness: number;
  commonValues: { value: string; count: number }[];
  issues: string[];
}

// ============================================================================
// CORRELATION RESULT TYPES
// ============================================================================

export interface CorrelationStatistics {
  totalEntities: number;
  totalRelationships: number;
  entitiesByType: Record<EntityType, number>;
  relationshipsByType: Record<RelationshipType, number>;
  averageConnectionsPerEntity: number;
  maxClusterSize: number;
  patternsBySeverity: Record<string, number>;
  dataQualityScore: number;
  coverageScore: number;
}

export interface CorrelationConfig {
  minimumConfidence: number;
  maxIterations: number;
  fuzzyMatchThreshold: number;
  dateToleranceDays: number;
  addressMatchThreshold: number;
  phoneMatchThreshold: number;
  emailMatchThreshold: number;
}

export interface CorrelationResult {
  entities: BaseEntity[];
  relationships: Relationship[];
  clusters: EntityCluster[];
  patterns: DetectedPattern[];
  timeline: TimelineEvent[];
  statistics: CorrelationStatistics;
}

// ============================================================================
// NETWORK GRAPH TYPES
// ============================================================================

export interface NetworkGraphConfig {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  layout: 'force' | 'circular' | 'hierarchical' | 'radial';
  nodeSize: 'fixed' | 'degree' | 'importance';
  showLabels: boolean;
  highlightCritical: boolean;
  groupByType: boolean;
  legend: GraphLegendItem[];
}

export interface NetworkNode {
  id: string;
  label: string;
  type: EntityType;
  size?: number;
  color?: string;
  importance?: number;
  cluster?: string;
  metadata?: Record<string, unknown>;
}

export interface NetworkEdge {
  source: string;
  target: string;
  type: RelationshipType;
  weight: number;
  color?: string;
  dashed?: boolean;
  label?: string;
}

export interface GraphLegendItem {
  type: EntityType | RelationshipType;
  label: string;
  color: string;
  shape?: 'circle' | 'square' | 'diamond' | 'triangle';
}

// ============================================================================
// INVESTIGATION REPORT TYPES
// ============================================================================

export type ClassificationLevel =
  | 'UNCLASSIFIED'
  | 'CONFIDENTIAL'
  | 'SECRET'
  | 'TOP_SECRET'
  | 'RESTRICTED'
  | 'INTERNAL'
  | 'PUBLIC';

export interface InvestigationReportConfig {
  title: string;
  subtitle?: string;
  caseNumber?: string;
  classification?: ClassificationLevel;
  preparedBy?: UserInfo;
  reviewedBy?: UserInfo[];
  date: Date;
  organization?: OrganizationInfo;
  includeQualityReport?: boolean;
  includePatterns?: boolean;
  includeTimeline?: boolean;
  includeStatistics?: boolean;
}

export interface UserInfo {
  name: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
}

export interface OrganizationInfo {
  name: string;
  shortName?: string;
  address?: string;
  logo?: string;
  website?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface AnalysisRequest {
  tables: Array<{
    name: string;
    records: Record<string, unknown>[];
  }>;
  config?: Partial<CorrelationConfig>;
}

export interface AnalysisResponse {
  success: boolean;
  result?: CorrelationResult;
  quality?: DataQualityReport;
  error?: string;
  processingTime?: number;
}

export interface InvestigationExportRequest {
  tables: Array<{
    name: string;
    records: Record<string, unknown>[];
  }>;
  reportConfig: InvestigationReportConfig;
}

// ============================================================================
// APP STATE EXTENSIONS
// ============================================================================

export type InvestigationViewType = 
  | 'overview'
  | 'entities'
  | 'relationships'
  | 'patterns'
  | 'timeline'
  | 'quality'
  | 'export';

export interface InvestigationState {
  currentView: InvestigationViewType;
  analysisResult: CorrelationResult | null;
  qualityReport: DataQualityReport | null;
  selectedEntity: string | null;
  selectedPattern: string | null;
  filterEntityType: EntityType | 'all';
  filterSeverity: 'all' | 'low' | 'medium' | 'high' | 'critical';
  isAnalyzing: boolean;
  lastAnalysisTime: Date | null;
}
