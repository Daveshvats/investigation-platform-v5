import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { useSettingsStore } from '@/store/settings';
import type {
  HealthStatus,
  TableMetadata,
  Schema,
  RecordsResponse,
  TableStats,
  LoginRequest,
  LoginResponse,
  UserInfo,
} from '@/types/api';

// Backend response for global search
interface GlobalSearchResponse {
  results: Record<string, Record<string, unknown>[]>;
  total_results: number;
  has_more: boolean;
  next_cursor: string | null;
  search_time: number;
  query: string;
  limit: number;
  search_engine: string;
}

// CDC Status
interface CDCStatus {
  is_running: boolean;
  available: boolean;
  total_tables: number;
  table_statuses: Record<string, {
    last_sync: string | null;
    records_synced: number;
    status: string;
  }>;
}

// Pipeline Job
interface PipelineJob {
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

class APIClient {
  private client: AxiosInstance | null = null;
  private cachedAuthKey: string = '__INIT__'; // Force first-time recreation

  // Force reset the client (call when settings change)
  resetClient(): void {
    this.client = null;
    this.cachedAuthKey = '__INIT__';
  }

  getClient(): AxiosInstance {
    const { baseUrl, authType, authToken, bearerToken, allowSelfSigned } = useSettingsStore.getState();

    // Use authToken if available, otherwise fall back to bearerToken for backward compatibility
    const token = authToken || bearerToken || '';
    
    // Create a key to track when we need to recreate the client
    const authKey = `${baseUrl}:${authType}:${token ? 'has-token' : 'no-token'}:${allowSelfSigned}`;

    // Recreate client if settings changed
    if (!this.client || this.cachedAuthKey !== authKey) {
      // Create fresh axios instance
      this.client = axios.create({
        baseURL: baseUrl,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      this.cachedAuthKey = authKey;

      // Only add auth headers if there's an actual non-empty token
      const hasValidToken = token && typeof token === 'string' && token.trim().length > 0;
      
      if (hasValidToken) {
        const trimmedToken = token.trim();
        if (authType === 'api-key') {
          // Use X-API-Key header for API key authentication
          this.client.defaults.headers.common['X-API-Key'] = trimmedToken;
        } else {
          // Use Authorization: Bearer header for JWT authentication
          this.client.defaults.headers.common['Authorization'] = `Bearer ${trimmedToken}`;
        }
      }
      // No token = no auth headers at all (clean requests)

      if (allowSelfSigned) {
        console.warn('Self-signed certificates: This setting should be handled server-side');
      }
    }

    return this.client;
  }

  // Health & System - No auth required
  async healthCheck(): Promise<AxiosResponse<HealthStatus>> {
    return this.getClient().get('/api/health');
  }

  // Tables & Schema
  async getTables(): Promise<AxiosResponse<{ tables: TableMetadata[]; count: number }>> {
    return this.getClient().get('/api/tables');
  }

  async getSchema(table: string): Promise<AxiosResponse<Schema>> {
    return this.getClient().get(`/api/tables/${table}/schema`);
  }

  async getStats(table: string): Promise<AxiosResponse<TableStats>> {
    return this.getClient().get(`/api/tables/${table}/stats`);
  }

  // Records - Backend returns "data" array, not "records"
  async getRecords(table: string, params?: { 
    limit?: number; 
    cursor?: string; 
    sort_by?: string; 
    sort_dir?: 'asc' | 'desc';
    [key: string]: unknown;
  }): Promise<AxiosResponse<RecordsResponse>> {
    return this.getClient().get(`/api/tables/${table}/records`, { params });
  }

  async getRecordByPK(table: string, pk: string | number): Promise<AxiosResponse<Record<string, unknown>>> {
    return this.getClient().get(`/api/tables/${table}/records/${pk}`);
  }

  // Search - Single table search
  async searchTable(table: string, params: { 
    q: string; 
    limit?: number; 
    cursor?: string;
    columns?: string;
    engine?: 'clickhouse' | 'postgresql';
  }): Promise<AxiosResponse<RecordsResponse>> {
    return this.getClient().get(`/api/tables/${table}/search`, { params });
  }

  // Global Search - Note: Backend uses /api/search/ with trailing slash
  async globalSearch(params: { 
    q: string; 
    limit?: number; 
    cursor?: string; 
    tables?: string[] 
  }): Promise<AxiosResponse<GlobalSearchResponse>> {
    return this.getClient().get('/api/search/', { params });
  }

  // CDC Status
  async getCDCStatus(): Promise<AxiosResponse<CDCStatus>> {
    return this.getClient().get('/api/cdc/status');
  }

  // Pipeline API Endpoints
  async startPipelineJob(folderPath: string, recursive?: boolean): Promise<AxiosResponse<{ job_id: string; status: string; message: string }>> {
    // Backend expects: { "folder_path": "...", "recursive": true/false }
    return this.getClient().post('/api/pipeline/start', {
      folder_path: folderPath,
      recursive: recursive || false,
    });
  }

  async getPipelineJob(jobId: string): Promise<AxiosResponse<PipelineJob>> {
    return this.getClient().get(`/api/pipeline/jobs/${jobId}`);
  }

  async getAllPipelineJobs(): Promise<AxiosResponse<{ jobs: PipelineJob[] }>> {
    return this.getClient().get('/api/pipeline/jobs');
  }

  async getPipelineJobLogs(jobId: string): Promise<AxiosResponse<{ logs: Array<{ time: string; level: string; message: string }> }>> {
    return this.getClient().get(`/api/pipeline/jobs/${jobId}/logs`);
  }

  getPipelineJobStreamURL(jobId: string): string {
    const { baseUrl } = useSettingsStore.getState();
    return `${baseUrl}/api/pipeline/jobs/${jobId}/stream`;
  }

  createPipelineJobStream(jobId: string): EventSource {
    const streamURL = this.getPipelineJobStreamURL(jobId);
    return new EventSource(streamURL);
  }

  async cancelPipelineJob(jobId: string): Promise<AxiosResponse<{ message: string }>> {
    return this.getClient().post(`/api/pipeline/jobs/${jobId}/cancel`);
  }

  // Authentication API Endpoints
  async login(data: LoginRequest): Promise<AxiosResponse<LoginResponse>> {
    return this.getClient().post('/api/auth/login', data);
  }

  async register(data: LoginRequest & { name?: string }): Promise<AxiosResponse<LoginResponse>> {
    return this.getClient().post('/api/auth/register', data);
  }

  async logout(): Promise<AxiosResponse<{ message: string }>> {
    return this.getClient().post('/api/auth/logout');
  }

  async getCurrentUser(): Promise<AxiosResponse<UserInfo>> {
    return this.getClient().get('/api/auth/me');
  }
}

export const apiClient = new APIClient();

// Re-export types
export type { GlobalSearchResponse, CDCStatus, PipelineJob };
