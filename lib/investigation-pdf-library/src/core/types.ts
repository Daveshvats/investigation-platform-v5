/**
 * Core Type Definitions for Investigation PDF Library
 * Comprehensive types for investigation reports, data correlation, and pattern detection
 */

// ============================================================================
// BASE TYPES
// ============================================================================

export interface BaseEntity {
  id: string;
  type: EntityType;
  name: string;
  aliases?: string[];
  attributes: Record<string, unknown>;
  confidence?: number;
  sources?: string[];
}

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

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  strength: number; // 0-1 confidence score
  attributes?: Record<string, unknown>;
  evidence?: Evidence[];
  firstObserved?: Date;
  lastObserved?: Date;
}

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

export interface Evidence {
  type: 'document' | 'database' | 'testimony' | 'digital' | 'financial';
  reference: string;
  confidence: number;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// DATA CORRELATION TYPES
// ============================================================================

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

export interface EntityCluster {
  id: string;
  name: string;
  entities: string[]; // entity IDs
  clusterType: 'person_network' | 'company_network' | 'address_group' | 'mixed';
  strength: number;
  summary: string;
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

// ============================================================================
// TIMELINE TYPES
// ============================================================================

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
// PDF REPORT TYPES
// ============================================================================

export interface PDFReportConfig {
  title: string;
  subtitle?: string;
  caseNumber?: string;
  classification?: ClassificationLevel;
  preparedBy?: UserInfo;
  reviewedBy?: UserInfo[];
  date: Date;
  organization?: OrganizationInfo;
  logo?: LogoConfig;
  watermark?: WatermarkConfig;
  footer?: FooterConfig;
  header?: HeaderConfig;
  pageNumbers?: PageNumberConfig;
  tableOfContents?: boolean;
  appendices?: AppendixConfig[];
  references?: Reference[];
}

export type ClassificationLevel =
  | 'UNCLASSIFIED'
  | 'CONFIDENTIAL'
  | 'SECRET'
  | 'TOP_SECRET'
  | 'RESTRICTED'
  | 'INTERNAL'
  | 'PUBLIC';

export interface UserInfo {
  name: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  signature?: string; // Base64 encoded signature image
}

export interface OrganizationInfo {
  name: string;
  shortName?: string;
  address?: string;
  logo?: string;
  website?: string;
}

export interface LogoConfig {
  source: string | Buffer;
  width: number;
  height: number;
  position: 'left' | 'center' | 'right';
}

export interface WatermarkConfig {
  text?: string;
  image?: string | Buffer;
  opacity: number;
  rotation: number;
  fontSize?: number;
  color?: string;
}

export interface FooterConfig {
  text?: string;
  includeClassification?: boolean;
  includeDate?: boolean;
  includePageNumber?: boolean;
  customElements?: FooterElement[];
}

export interface HeaderConfig {
  text?: string;
  includeLogo?: boolean;
  includeTitle?: boolean;
  includeClassification?: boolean;
  includeCaseNumber?: boolean;
  customElements?: HeaderElement[];
}

export interface PageNumberConfig {
  format: 'page' | 'pageOf' | 'custom';
  position: 'left' | 'center' | 'right';
  startFrom: number;
}

export interface AppendixConfig {
  title: string;
  content: AppendixContent;
  pageNumber?: number;
}

export type AppendixContent =
  | { type: 'table'; data: unknown[][]; headers: string[] }
  | { type: 'image'; source: string | Buffer; caption?: string }
  | { type: 'text'; content: string }
  | { type: 'chart'; config: ChartConfig }
  | { type: 'network_graph'; config: NetworkGraphConfig };

export interface Reference {
  id: string;
  type: 'document' | 'database' | 'website' | 'testimony' | 'other';
  title: string;
  author?: string;
  date?: Date;
  url?: string;
  pageNumbers?: string;
}

// ============================================================================
// CHART TYPES
// ============================================================================

export interface ChartConfig {
  type: ChartType;
  title: string;
  data: ChartData;
  options?: ChartOptions;
}

export type ChartType = 
  | 'bar'
  | 'line'
  | 'pie'
  | 'scatter'
  | 'network'
  | 'timeline'
  | 'heatmap'
  | 'treemap';

export interface ChartData {
  labels?: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  fill?: boolean;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  colors?: string[];
  xAxisLabel?: string;
  yAxisLabel?: string;
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
// EXPORT OPTIONS
// ============================================================================

export interface ExportOptions {
  format: 'pdf' | 'json' | 'csv' | 'xlsx';
  includeRawData?: boolean;
  includeAnalysis?: boolean;
  includeVisualizations?: boolean;
  includeAppendices?: boolean;
  compression?: boolean;
  password?: string;
  language?: string;
  timezone?: string;
}

export interface PDFExportOptions extends ExportOptions {
  format: 'pdf';
  reportConfig: PDFReportConfig;
  sections: ReportSection[];
  paperSize: 'A4' | 'Letter' | 'Legal' | 'A3';
  orientation: 'portrait' | 'landscape';
  margins: Margins;
  fontSize: number;
  fontFamily: string;
}

export interface ReportSection {
  id: string;
  title: string;
  type: SectionType;
  content: SectionContent;
  pageBreak?: 'before' | 'after' | 'both' | 'none';
  includeInTOC: boolean;
}

export type SectionType =
  | 'executive_summary'
  | 'methodology'
  | 'findings'
  | 'entity_analysis'
  | 'relationship_analysis'
  | 'pattern_analysis'
  | 'timeline'
  | 'network_graph'
  | 'statistics'
  | 'data_quality'
  | 'recommendations'
  | 'appendix'
  | 'references'
  | 'custom';

export type SectionContent =
  | { type: 'text'; content: string }
  | { type: 'table'; data: unknown[][]; headers: string[]; title?: string }
  | { type: 'chart'; config: ChartConfig }
  | { type: 'network_graph'; config: NetworkGraphConfig }
  | { type: 'timeline'; events: TimelineEvent[] }
  | { type: 'entities'; entities: BaseEntity[] }
  | { type: 'relationships'; relationships: Relationship[]; entities: BaseEntity[] }
  | { type: 'patterns'; patterns: DetectedPattern[] }
  | { type: 'quality_report'; report: DataQualityReport }
  | { type: 'statistics'; stats: CorrelationStatistics };

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HeaderElement {
  type: 'text' | 'image' | 'line';
  content: string;
  position: { x: number; y: number };
  style?: StyleConfig;
}

export interface FooterElement {
  type: 'text' | 'image' | 'line';
  content: string;
  position: { x: number; y: number };
  style?: StyleConfig;
}

export interface StyleConfig {
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

// ============================================================================
// ANALYSIS CONFIGURATION
// ============================================================================

export interface AnalysisConfig {
  correlation: CorrelationConfig;
  patternDetection: PatternDetectionConfig;
  timeline: TimelineConfig;
  quality: QualityConfig;
}

export interface PatternDetectionConfig {
  enabledPatterns: PatternType[];
  sensitivity: 'low' | 'medium' | 'high';
  customRules?: PatternRule[];
}

export interface PatternRule {
  name: string;
  conditions: PatternCondition[];
  action: 'flag' | 'alert' | 'ignore';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface PatternCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'matches' | 'exists';
  value: unknown;
}

export interface TimelineConfig {
  startDate?: Date;
  endDate?: Date;
  granularity: 'day' | 'week' | 'month' | 'year';
  highlightAnomalies: boolean;
  groupRelatedEvents: boolean;
}

export interface QualityConfig {
  requiredFields: string[];
  validationRules: ValidationRule[];
  scoringWeights: Record<string, number>;
}

export interface ValidationRule {
  field: string;
  type: 'format' | 'range' | 'enum' | 'custom';
  parameters: Record<string, unknown>;
  errorMessage: string;
}
