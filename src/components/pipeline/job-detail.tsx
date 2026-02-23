'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePipelineJob, usePipelineLogs, useCancelPipelineJob } from '@/hooks/useApi';
import { apiClient } from '@/lib/api-client';
import {
  GitBranch,
  Clock,
  FolderOpen,
  CheckCircle2,
  XCircle,
  Loader2,
  Square,
  RefreshCw,
  Terminal,
  FileText,
} from 'lucide-react';
import type { PipelineJob } from '@/types/api';

const statusConfig = {
  pending: { icon: Loader2, color: 'text-yellow-500', animate: false },
  running: { icon: Loader2, color: 'text-blue-500', animate: true },
  completed: { icon: CheckCircle2, color: 'text-green-500', animate: false },
  failed: { icon: XCircle, color: 'text-red-500', animate: false },
  cancelled: { icon: Square, color: 'text-gray-500', animate: false },
};

interface JobDetailProps {
  jobId: string | null;
  onClose?: () => void;
}

export function JobDetail({ jobId, onClose }: JobDetailProps) {
  const { data: job, isLoading } = usePipelineJob(jobId);
  const { data: logs, isLoading: logsLoading } = usePipelineLogs(jobId);
  const cancelJob = useCancelPipelineJob();
  const [sseConnected, setSseConnected] = useState(false);

  // SSE connection for real-time updates
  useEffect(() => {
    if (!jobId || job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled') {
      return;
    }

    const eventSource = apiClient.createPipelineJobStream(jobId);
    
    // Set connected state after EventSource is ready
    const handleOpen = () => setSseConnected(true);

    eventSource.onopen = handleOpen;
    
    eventSource.onmessage = (event) => {
      console.log('SSE update:', event.data);
      // The job will be refetched by react-query due to refetchInterval
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      setSseConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  }, [jobId, job?.status]);

  if (!jobId) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center">
          <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No Job Selected</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Select a job from the list to view details
          </p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          Job not found
        </div>
      </Card>
    );
  }

  const config = statusConfig[job.status];
  const StatusIcon = config.icon;

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Job Details
            {sseConnected && (
              <div className="flex items-center gap-1 text-xs text-green-500">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </div>
            )}
          </CardTitle>
          <Badge
            variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}
          >
            <StatusIcon
              className={`h-3 w-3 mr-1 ${config.color} ${
                config.animate ? 'animate-spin' : ''
              }`}
            />
            {job.status}
          </Badge>
        </div>
        <p className="font-mono text-sm text-muted-foreground">{job.job_id}</p>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto space-y-6">
        {/* Progress */}
        {(job.status === 'running' || job.status === 'completed') && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{job.progress || 0}%</span>
            </div>
            <Progress value={job.progress || 0} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{job.processed_files || 0} / {job.total_files || 0} files processed</span>
              {job.failed_files && job.failed_files > 0 && (
                <span className="text-destructive">{job.failed_files} failed</span>
              )}
            </div>
          </div>
        )}

        {/* Job Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen className="h-4 w-4" />
              Folder Path
            </div>
            <p className="text-sm font-mono break-all">{job.folder_path}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Created
            </div>
            <p className="text-sm">{new Date(job.created_at).toLocaleString()}</p>
          </div>
          {job.started_at && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Started
              </div>
              <p className="text-sm">{new Date(job.started_at).toLocaleString()}</p>
            </div>
          )}
          {job.completed_at && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </div>
              <p className="text-sm">{new Date(job.completed_at).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* File Status */}
        {job.files && Object.keys(job.files).length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              File Status ({Object.keys(job.files).length} files)
            </h4>
            <ScrollArea className="h-40 rounded-lg border">
              <div className="p-2 space-y-1">
                {Object.entries(job.files).map(([fileName, status]) => (
                  <div
                    key={fileName}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted"
                  >
                    <span className="text-sm truncate max-w-[200px]">{fileName}</span>
                    <Badge
                      variant={
                        status.status === 'completed'
                          ? 'default'
                          : status.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="text-xs"
                    >
                      {status.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Error Message */}
        {job.error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
            <h4 className="font-medium text-destructive mb-2">Error</h4>
            <p className="text-sm text-destructive">{job.error}</p>
          </div>
        )}

        {/* Logs */}
        <div className="space-y-2">
          <h4 className="font-medium flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Logs
          </h4>
          <ScrollArea className="h-48 rounded-lg border bg-muted">
            {logsLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : logs ? (
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap">{logs}</pre>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">No logs available</div>
            )}
          </ScrollArea>
        </div>

        {/* Actions */}
        {job.status === 'running' && (
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => cancelJob.mutate(job.job_id)}
            disabled={cancelJob.isPending}
          >
            <Square className="h-4 w-4 mr-2" />
            Cancel Job
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
