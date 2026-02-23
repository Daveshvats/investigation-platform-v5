// API Types for the Dashboard

// Table record type (alias to avoid conflict with TypeScript's Record utility type)
export type TableRow = Record<string, unknown>;

export interface TableMetadata {
  name: string;
  columns: number;
  searchable: string[];
  sortable: string[];
  filterable?: string[];
}

export interface Schema {
  table: string;
  columns: ColumnSchema[];
  primary_key: string | null;
  searchable: string[];
  sortable: string[];
  filterable?: string[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
}

export interface RecordsResponse {
  records: Record<string, unknown>[];
  total?: number;
  page?: number;
  total_pages?: number;
  next_cursor?: string;
  has_more?: boolean;
  cached?: boolean;
}

export interface SearchResult {
  table: string;
  record: Record<string, unknown>;
  matches?: string[];
}

export interface GlobalSearchResponse {
  results: Record<string, Record<string, unknown>[]>;
  has_more: boolean;
  next_cursor: string;
  search_time: number;
  query: string;
  limit: number;
  search_engine: string;
}

export interface CDCStatus {
  enabled: boolean;
  lag?: number;
  last_update?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
}

export interface PipelineJob {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  folder_path: string;
  recursive: boolean;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  total_files?: number;
  processed_files?: number;
  failed_files?: number;
  progress?: number;
  files?: Record<string, FileStatus>;
  error?: string;
}

export interface FileStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  processed_at?: string;
}

export interface TableStats {
  table_name: string;
  row_count: number;
  size_bytes?: number;
  last_modified?: string;
}

// App State Types
export type ViewType = 'dashboard' | 'tables' | 'search' | 'ai-search' | 'robust-search' | 'investigation' | 'pipeline' | 'settings';

export interface ConnectionStatus {
  connected: boolean;
  lastChecked: string | null;
  error: string | null;
}

// Settings Store Types
export interface SettingsState {
  baseUrl: string;
  bearerToken: string;
  allowSelfSigned: boolean;
  theme: 'light' | 'dark' | 'system';
  setBaseUrl: (url: string) => void;
  setBearerToken: (token: string) => void;
  setAllowSelfSigned: (allow: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

// App Store Types
export interface AppState {
  currentView: ViewType;
  selectedTable: string | null;
  selectedRecords: Record<string, unknown>[];
  sidebarOpen: boolean;
  settingsOpen: boolean;
  setCurrentView: (view: ViewType) => void;
  setSelectedTable: (table: string | null) => void;
  setSelectedRecords: (records: Record<string, unknown>[]) => void;
  toggleSidebar: () => void;
  toggleSettings: () => void;
}
