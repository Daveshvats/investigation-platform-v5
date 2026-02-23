import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PipelineJob } from '@/types/api';

// Query Keys
export const queryKeys = {
  health: ['health'] as const,
  tables: ['tables'] as const,
  schema: (table: string) => ['schema', table] as const,
  stats: (table: string) => ['stats', table] as const,
  records: (table: string, params?: Record<string, unknown>) => ['records', table, params] as const,
  search: (params: Record<string, unknown>) => ['search', params] as const,
  cdcStatus: ['cdcStatus'] as const,
  pipelineJobs: ['pipelineJobs'] as const,
  pipelineJob: (jobId: string) => ['pipelineJob', jobId] as const,
  pipelineLogs: (jobId: string) => ['pipelineLogs', jobId] as const,
};

// Health Check
export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: async () => {
      const response = await apiClient.healthCheck();
      return response.data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 1,
  });
}

// Tables
export function useTables() {
  return useQuery({
    queryKey: queryKeys.tables,
    queryFn: async () => {
      const response = await apiClient.getTables();
      return response.data;
    },
  });
}

// Schema
export function useSchema(table: string | null) {
  return useQuery({
    queryKey: queryKeys.schema(table || ''),
    queryFn: async () => {
      if (!table) return null;
      const response = await apiClient.getSchema(table);
      return response.data;
    },
    enabled: !!table,
  });
}

// Table Stats
export function useStats(table: string | null) {
  return useQuery({
    queryKey: queryKeys.stats(table || ''),
    queryFn: async () => {
      if (!table) return null;
      const response = await apiClient.getStats(table);
      return response.data;
    },
    enabled: !!table,
  });
}

// Records
export function useRecords(table: string | null, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.records(table || '', params),
    queryFn: async () => {
      if (!table) return null;
      const response = await apiClient.getRecords(table, params);
      return response.data;
    },
    enabled: !!table,
  });
}

// Global Search
export function useGlobalSearch(query: string, options?: { limit?: number; tables?: string[] }) {
  return useQuery({
    queryKey: queryKeys.search({ query, ...options }),
    queryFn: async () => {
      if (!query.trim()) return null;
      const response = await apiClient.globalSearch({
        q: query,
        limit: options?.limit || 50,
        tables: options?.tables,
      });
      return response.data;
    },
    enabled: query.trim().length > 0,
  });
}

// Table Search
export function useTableSearch(table: string | null, query: string, limit?: number) {
  return useQuery({
    queryKey: queryKeys.search({ table, query, limit }),
    queryFn: async () => {
      if (!table || !query.trim()) return null;
      const response = await apiClient.searchTable(table, { q: query, limit: limit || 50 });
      return response.data;
    },
    enabled: !!table && query.trim().length > 0,
  });
}

// CDC Status
export function useCDCStatus() {
  return useQuery({
    queryKey: queryKeys.cdcStatus,
    queryFn: async () => {
      const response = await apiClient.getCDCStatus();
      return response.data;
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

// Pipeline Jobs
export function usePipelineJobs() {
  return useQuery({
    queryKey: queryKeys.pipelineJobs,
    queryFn: async () => {
      const response = await apiClient.getAllPipelineJobs();
      return response.data;
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

// Single Pipeline Job
export function usePipelineJob(jobId: string | null) {
  return useQuery({
    queryKey: queryKeys.pipelineJob(jobId || ''),
    queryFn: async () => {
      if (!jobId) return null;
      const response = await apiClient.getPipelineJob(jobId);
      return response.data;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Only refetch if job is still running
      const data = query.state.data as PipelineJob | null | undefined;
      if (data?.status === 'running' || data?.status === 'pending') {
        return 2000;
      }
      return false;
    },
  });
}

// Pipeline Job Logs
export function usePipelineLogs(jobId: string | null) {
  return useQuery({
    queryKey: queryKeys.pipelineLogs(jobId || ''),
    queryFn: async () => {
      if (!jobId) return null;
      const response = await apiClient.getPipelineJobLogs(jobId);
      return response.data;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Only refetch if job is running
      const jobData = query?.state?.data;
      if (typeof jobData === 'string') return false;
      const job = jobData as PipelineJob | null;
      if (job?.status === 'running' || job?.status === 'pending') {
        return 3000;
      }
      return false;
    },
  });
}

// Start Pipeline Job Mutation
export function useStartPipelineJob() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ folderPath, recursive }: { folderPath: string; recursive?: boolean }) => {
      const response = await apiClient.startPipelineJob(folderPath, recursive);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelineJobs });
    },
  });
}

// Cancel Pipeline Job Mutation
export function useCancelPipelineJob() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiClient.cancelPipelineJob(jobId);
      return response.data;
    },
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelineJob(jobId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelineJobs });
    },
  });
}
