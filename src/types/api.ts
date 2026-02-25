// API Types matching L.S.D Backend Documentation

// Table record type (alias to avoid conflict with TypeScript's Record utility type)
export type TableRow = Record<string, unknown>;

// Table metadata from /api/tables
export interface TableMetadata {
  name: string;
  schema: string;
  columns: number;
  primary_key: string[];
  sortable: string[];
  filterable: string[];
  searchable: string[];
  clickhouse_search: boolean;
}

// Column schema from /api/tables/{table}/schema
export interface ColumnSchema {
  name: string;
  dataType: string;  // Backend returns "dataType", not "type"
  nullable: boolean;
}

// Schema response from /api/tables/{table}/schema
export interface Schema {
  name: string;
  schema: string;
  columns: ColumnSchema[];
  primary_key: string[];
  indexes?: Array<{
    name: string;
    columns: string[];
    unique: boolean;
  }>;
  sortable: string[];
  filterable: string[];
  searchable: string[];
  clickhouse_search: boolean;
}

// Table stats from /api/tables/{table}/stats
export interface TableStats {
  table_name: string;
  estimated_rows: number;
  table_size: string;
  index_size: string;
  clickhouse_indexed: number;
  clickhouse_last_sync: string;
}

// Records response from /api/tables/{table}/records
// Backend returns "data" array, not "records" array!
export interface RecordsResponse {
  data: Record<string, unknown>[];  // Backend returns "data", not "records"
  next_cursor: string | null;
  has_more: boolean;
  count: number;
  table: string;
  cached: boolean;
}

// Health check response
export interface HealthStatus {
  status: 'UP' | 'DOWN';
  service: string;
  tables_count: number;
  clickhouse: boolean;
  redis: boolean;
}

// Global search response from /api/search/
export interface GlobalSearchResponse {
  results: Record<string, Record<string, unknown>[]>;
  total_results: number;
  has_more: boolean;
  next_cursor: string | null;
  search_time: number;  // in milliseconds
  query: string;
  limit: number;
  search_engine: string;
}

// CDC status response
export interface CDCStatus {
  is_running: boolean;
  available: boolean;
  total_tables: number;
  table_statuses: Record<string, {
    last_sync: string | null;
    records_synced: number;
    status: 'synced' | 'syncing' | 'pending' | 'error';
  }>;
}

// Pipeline job status
export interface PipelineJob {
  job_id: string;
  table_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total: number;
  processed: number;
  failed: number;
  error?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

// Pipeline log entry
export interface PipelineLogEntry {
  time: string;
  level: 'info' | 'error' | 'warning';
  message: string;
}

// Pipeline logs response
export interface PipelineLogsResponse {
  logs: PipelineLogEntry[];
}

// Error response format
export interface APIError {
  error: string;
}

// App State Types
export type ViewType = 'dashboard' | 'tables' | 'search' | 'ai-search' | 'robust-search' | 'investigation' | 'pipeline' | 'settings';

export interface ConnectionStatus {
  connected: boolean;
  lastChecked: string | null;
  error: string | null;
}

// Authentication type
export type AuthType = 'api-key' | 'bearer';

// Login request
export interface LoginRequest {
  identifier: string;
  password: string;
  rememberMe?: boolean;
}

// Login response
export interface LoginResponse {
  success: boolean;
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    name: string;
    role: string;
  };
}

// User info from /api/auth/me
export interface UserInfo {
  id: string;
  email: string;
  username: string;
  name: string;
  role: string;
}

// Settings Store Types
export interface SettingsState {
  baseUrl: string;
  authType: AuthType;
  authToken: string;
  bearerToken: string; // Kept for backward compatibility
  allowSelfSigned: boolean;
  theme: 'light' | 'dark' | 'system';
  // User session info (when logged in)
  user: UserInfo | null;
  setBaseUrl: (url: string) => void;
  setAuthType: (type: AuthType) => void;
  setAuthToken: (token: string) => void;
  setBearerToken: (token: string) => void;
  setAllowSelfSigned: (allow: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setUser: (user: UserInfo | null) => void;
  logout: () => void;
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
