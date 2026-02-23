'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePipelineJobs, useCancelPipelineJob } from '@/hooks/useApi';
import {
  GitBranch,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  Eye,
  Square,
} from 'lucide-react';
import type { PipelineJob } from '@/types/api';

const statusConfig = {
  pending: {
    icon: Circle,
    color: 'secondary',
    badge: 'secondary',
  },
  running: {
    icon: Loader2,
    color: 'default',
    badge: 'default',
  },
  completed: {
    icon: CheckCircle2,
    color: 'default',
    badge: 'default',
  },
  failed: {
    icon: XCircle,
    color: 'destructive',
    badge: 'destructive',
  },
  cancelled: {
    icon: Square,
    color: 'muted',
    badge: 'outline',
  },
};

interface JobListProps {
  onSelectJob: (jobId: string) => void;
  selectedJobId?: string | null;
}

export function JobList({ onSelectJob, selectedJobId }: JobListProps) {
  const { data, isLoading } = usePipelineJobs();
  const cancelJob = useCancelPipelineJob();

  const jobs: PipelineJob[] = data?.jobs
    ? Object.values(data.jobs).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    : [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pipeline Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Pipeline Jobs
          <Badge variant="secondary" className="ml-auto">
            {jobs.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-340px)]">
          <div className="space-y-2 p-4 pt-0">
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pipeline jobs found
              </div>
            ) : (
              jobs.map((job) => {
                const config = statusConfig[job.status];
                const StatusIcon = config.icon;
                const isSelected = selectedJobId === job.job_id;

                return (
                  <div
                    key={job.job_id}
                    className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-muted border-primary' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => onSelectJob(job.job_id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">
                          {job.job_id.slice(0, 8)}...
                        </span>
                        <Badge variant={config.badge as 'default' | 'secondary' | 'destructive' | 'outline'}>
                          <StatusIcon
                            className={`h-3 w-3 mr-1 ${
                              job.status === 'running' ? 'animate-spin' : ''
                            }`}
                          />
                          {job.status}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectJob(job.job_id);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="text-sm text-muted-foreground mb-2 truncate">
                      {job.folder_path}
                    </div>

                    {/* Progress Bar */}
                    {(job.status === 'running' || job.status === 'completed') && (
                      <div className="space-y-1">
                        <Progress
                          value={job.progress || 0}
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {job.processed_files || 0} / {job.total_files || 0} files
                          </span>
                          <span>{job.progress || 0}%</span>
                        </div>
                      </div>
                    )}

                    {/* Meta Info */}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.created_at).toLocaleString()}
                      </div>
                      {job.recursive && (
                        <Badge variant="outline" className="text-xs">
                          recursive
                        </Badge>
                      )}
                    </div>

                    {/* Cancel Button for Running Jobs */}
                    {job.status === 'running' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelJob.mutate(job.job_id);
                        }}
                        disabled={cancelJob.isPending}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        Cancel Job
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
