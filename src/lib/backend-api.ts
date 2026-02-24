/**
 * L.S.D Backend API Client
 * Handles all communication with the Large Search of Data backend
 */

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:5000';

export interface TableInfo {
  name: string;
  schema: string;
  columns: number;
  primary_key: string[];
  sortable: string[];
  filterable: string[];
  searchable: string[];
  clickhouse_search: boolean;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
}

export interface TableSchema {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  primary_key: string[];
  indexes: string[];
  sortable: string[];
  filterable: string[];
  searchable: string[];
  clickhouse_search: boolean;
}

export interface Record {
  id: string | number;
  [key: string]: string | number | boolean | null | Date;
}

export interface PaginatedResponse<T = Record> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
  count: number;
  table?: string;
  cached?: boolean;
}

export interface GlobalSearchResult {
  results: Record<string, Record[]>;
  total_results: number;
  has_more: boolean;
  next_cursor: string | null;
  tables_queried: number;
  tables_in_results: number;
  search_time: number;
  query: string;
  limit: number;
  cursor: string;
  exact_match: boolean;
  date_from: string | null;
  search_engine: 'clickhouse_parallel' | 'postgresql';
  clickhouse_available: boolean;
}

export interface SearchResults {
  data: Record[];
  next_cursor: string | null;
  has_more: boolean;
  count: number;
  table: string;
  search_columns: string[];
  search_engine: 'clickhouse' | 'postgresql';
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  service: string;
  tables_count: number;
  clickhouse: boolean;
  redis: boolean;
  optimized: boolean;
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BACKEND_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Backend API Client
 */
export const backendAPI = {
  // System
  async health(): Promise<HealthStatus> {
    return fetchAPI<HealthStatus>('/api/health');
  },

  // Tables
  async listTables(): Promise<{ tables: TableInfo[]; count: number }> {
    return fetchAPI('/api/tables');
  },

  async getTableSchema(table: string): Promise<TableSchema> {
    return fetchAPI(`/api/tables/${table}/schema`);
  },

  async getTableStats(table: string): Promise<{
    table_name: string;
    row_count: number;
    estimated: boolean;
    clickhouse_indexed: number;
    clickhouse_last_sync: string;
  }> {
    return fetchAPI(`/api/tables/${table}/stats`);
  },

  // Records
  async getRecords(
    table: string,
    params: {
      cursor?: string;
      limit?: number;
      sort_by?: string;
      sort_dir?: 'asc' | 'desc';
      filters?: Record<string, string>;
    } = {}
  ): Promise<PaginatedResponse> {
    const searchParams = new URLSearchParams();
    
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.sort_by) searchParams.set('sort_by', params.sort_by);
    if (params.sort_dir) searchParams.set('sort_dir', params.sort_dir);
    
    if (params.filters) {
      Object.entries(params.filters).forEach(([key, value]) => {
        if (value) searchParams.set(key, value);
      });
    }

    const queryString = searchParams.toString();
    const endpoint = `/api/tables/${table}/records${queryString ? `?${queryString}` : ''}`;
    
    return fetchAPI(endpoint);
  },

  async getRecord(table: string, pk: string | number): Promise<Record> {
    return fetchAPI(`/api/tables/${table}/records/${pk}`);
  },

  // Search
  async searchTable(
    table: string,
    query: string,
    params: {
      columns?: string;
      limit?: number;
      cursor?: string;
      engine?: 'clickhouse' | 'postgresql';
    } = {}
  ): Promise<SearchResults> {
    const searchParams = new URLSearchParams();
    searchParams.set('q', query);
    
    if (params.columns) searchParams.set('columns', params.columns);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.engine) searchParams.set('engine', params.engine);

    return fetchAPI(`/api/tables/${table}/search?${searchParams.toString()}`);
  },

  async globalSearch(
    query: string,
    params: {
      limit?: number;
      cursor?: string;
      exact?: boolean;
      date_from?: string;
    } = {}
  ): Promise<GlobalSearchResult> {
    const searchParams = new URLSearchParams();
    searchParams.set('q', query);
    
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.exact) searchParams.set('exact', 'true');
    if (params.date_from) searchParams.set('date_from', params.date_from);

    return fetchAPI(`/api/search?${searchParams.toString()}`);
  },

  async parallelSearch(
    query: string,
    params: {
      limit?: number;
      cursor?: string;
      exact?: boolean;
      date_from?: string;
    } = {}
  ): Promise<GlobalSearchResult> {
    const searchParams = new URLSearchParams();
    searchParams.set('q', query);
    
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.exact) searchParams.set('exact', 'true');
    if (params.date_from) searchParams.set('date_from', params.date_from);

    return fetchAPI(`/api/search/parallel?${searchParams.toString()}`);
  },

  // CDC
  async getCDCStatus(): Promise<{
    is_running: boolean;
    available: boolean;
    total_tables: number;
    table_statuses: Record<string, {
      table_name: string;
      is_syncing: boolean;
      last_synced_id: string;
      last_sync_time: string;
      records_synced: number;
      sync_lag_seconds: number;
    }>;
  }> {
    return fetchAPI('/api/cdc/status');
  },
};

/**
 * Fetch ALL records with cursor pagination
 */
export async function fetchAllRecords(
  table: string,
  params: {
    limit?: number;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
    filters?: Record<string, string>;
    maxRecords?: number;
  } = {},
  onProgress?: (count: number, hasMore: boolean) => void
): Promise<Record[]> {
  const allRecords: Record[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  const limit = params.limit || 50;
  const maxRecords = params.maxRecords || 10000;

  while (hasMore && allRecords.length < maxRecords) {
    const response = await backendAPI.getRecords(table, {
      ...params,
      cursor,
      limit,
    });

    allRecords.push(...response.data);
    hasMore = response.has_more;
    cursor = response.next_cursor || undefined;

    if (onProgress) {
      onProgress(allRecords.length, hasMore);
    }

    // Safety check
    if (!cursor && hasMore) {
      console.warn('No cursor but has_more is true, stopping');
      break;
    }
  }

  return allRecords;
}

/**
 * Fetch ALL search results with cursor pagination
 */
export async function fetchAllSearchResults(
  table: string,
  query: string,
  params: {
    columns?: string;
    limit?: number;
    engine?: 'clickhouse' | 'postgresql';
    maxRecords?: number;
  } = {},
  onProgress?: (count: number, hasMore: boolean) => void
): Promise<Record[]> {
  const allRecords: Record[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  const limit = params.limit || 50;
  const maxRecords = params.maxRecords || 10000;

  while (hasMore && allRecords.length < maxRecords) {
    const response = await backendAPI.searchTable(table, query, {
      ...params,
      cursor,
      limit,
    });

    allRecords.push(...response.data);
    hasMore = response.has_more;
    cursor = response.next_cursor || undefined;

    if (onProgress) {
      onProgress(allRecords.length, hasMore);
    }

    if (!cursor && hasMore) {
      console.warn('No cursor but has_more is true, stopping');
      break;
    }
  }

  return allRecords;
}
