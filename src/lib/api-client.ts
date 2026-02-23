import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { useSettingsStore } from '@/store/settings';
import type {
  HealthStatus,
  TableMetadata,
  Schema,
  RecordsResponse,
  GlobalSearchResponse,
  CDCStatus,
  PipelineJob,
  TableStats,
} from '@/types/api';

class APIClient {
  private client: AxiosInstance | null = null;

  getClient(): AxiosInstance {
    const { baseUrl, bearerToken, allowSelfSigned } = useSettingsStore.getState();

    if (!this.client || this.client.defaults.baseURL !== baseUrl) {
      this.client = axios.create({
        baseURL: baseUrl,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (bearerToken) {
        this.client.defaults.headers.common['Authorization'] = `Bearer ${bearerToken}`;
      }

      if (allowSelfSigned) {
        // Note: This would need to be handled server-side in a real app
        // For client-side, we'll just log a warning
        console.warn('Self-signed certificates: This setting should be handled server-side');
      }
    }

    return this.client;
  }

  // Health & System
  async healthCheck(): Promise<AxiosResponse<HealthStatus>> {
    return this.getClient().get('/api/health');
  }

  // Tables & Schema
  async getTables(): Promise<AxiosResponse<{ tables: TableMetadata[] }>> {
    return this.getClient().get('/api/tables');
  }

  async getSchema(table: string): Promise<AxiosResponse<Schema>> {
    return this.getClient().get(`/api/tables/${table}/schema`);
  }

  async getStats(table: string): Promise<AxiosResponse<TableStats>> {
    return this.getClient().get(`/api/tables/${table}/stats`);
  }

  // Records
  async getRecords(table: string, params?: Record<string, unknown>): Promise<AxiosResponse<RecordsResponse>> {
    return this.getClient().get(`/api/tables/${table}/records`, { params });
  }

  async getRecordByPK(table: string, pk: string | number): Promise<AxiosResponse<Record<string, unknown>>> {
    return this.getClient().get(`/api/tables/${table}/records/${pk}`);
  }

  // Search
  async searchTable(table: string, params: { q: string; limit?: number; cursor?: string }): Promise<AxiosResponse<RecordsResponse>> {
    return this.getClient().get(`/api/tables/${table}/search`, { params });
  }

  async globalSearch(params: { q: string; limit?: number; cursor?: string; tables?: string[] }): Promise<AxiosResponse<GlobalSearchResponse>> {
    return this.getClient().get('/api/search', { params });
  }

  // CDC (Change Data Capture)
  async getCDCStatus(): Promise<AxiosResponse<CDCStatus>> {
    return this.getClient().get('/api/cdc/status');
  }

  // Pipeline API Endpoints
  async startPipelineJob(folderPath: string, recursive: boolean = false): Promise<AxiosResponse<{ job_id: string; message: string }>> {
    return this.getClient().post('/api/pipeline/start', {
      folder_path: folderPath,
      recursive: recursive,
    });
  }

  async getPipelineJob(jobId: string): Promise<AxiosResponse<PipelineJob>> {
    return this.getClient().get(`/api/pipeline/jobs/${jobId}`);
  }

  async getAllPipelineJobs(): Promise<AxiosResponse<{ count: number; jobs: Record<string, PipelineJob> }>> {
    return this.getClient().get('/api/pipeline/jobs');
  }

  async getPipelineJobLogs(jobId: string): Promise<AxiosResponse<string>> {
    return this.getClient().get(`/api/pipeline/jobs/${jobId}/logs`, {
      responseType: 'text',
    });
  }

  getPipelineJobStreamURL(jobId: string): string {
    const { baseUrl } = useSettingsStore.getState();
    return `${baseUrl}/api/pipeline/jobs/${jobId}/stream`;
  }

  createPipelineJobStream(jobId: string): EventSource {
    const streamURL = this.getPipelineJobStreamURL(jobId);
    return new EventSource(streamURL);
  }

  // Cancel pipeline job (if supported by backend)
  async cancelPipelineJob(jobId: string): Promise<AxiosResponse<{ message: string }>> {
    return this.getClient().post(`/api/pipeline/jobs/${jobId}/cancel`);
  }
}

export const apiClient = new APIClient();
