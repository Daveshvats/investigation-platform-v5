'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { usePipelineJobs, useStartPipelineJob, useCancelPipelineJob } from '@/hooks/useApi';
import { useSettingsStore } from '@/store/settings';
import {
  GitBranch,
  Play,
  XCircle,
  RefreshCw,
  FolderOpen,
  Clock,
  CheckCircle2,
  XCircle as XCircleIcon,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PipelineJob } from '@/types/api';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4" />,
  running: <Loader2 className="h-4 w-4 animate-spin" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircleIcon className="h-4 w-4 text-red-500" />,
  cancelled: <XCircleIcon className="h-4 w-4" />,
};

export function PipelineView() {
  const [folderPath, setFolderPath] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = usePipelineJobs();
  const startJob = useStartPipelineJob();
  const cancelJob = useCancelPipelineJob();

  const jobs: PipelineJob[] = data?.jobs
    ? Object.values(data.jobs).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    : [];

  const handleStartJob = async () => {
    if (!folderPath.trim()) {
      toast.error('Please enter a folder path');
      return;
    }

    try {
      await startJob.mutateAsync({ folderPath, recursive });
      toast.success('Pipeline job started');
      setFolderPath('');
    } catch (error) {
      toast.error('Failed to start job');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await cancelJob.mutateAsync(jobId);
      toast.success('Job cancelled');
    } catch (error) {
      toast.error('Failed to cancel job');
    }
  };

  const toggleJob = (jobId: string) => {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobs(newExpanded);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="h-6 w-6" />
          Pipeline Jobs
        </h2>
        <p className="text-muted-foreground">
          Start and manage data processing pipeline jobs.
        </p>
      </div>

      {/* Start Job Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Start New Job</CardTitle>
          <CardDescription>
            Start a new pipeline job to process files from a folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="folder-path">Folder Path</Label>
              <div className="relative">
                <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="folder-path"
                  placeholder="/path/to/data"
                  className="pl-10"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="recursive"
                  checked={recursive}
                  onCheckedChange={setRecursive}
                />
                <Label htmlFor="recursive">Recursive</Label>
              </div>
              <Button onClick={handleStartJob} disabled={startJob.isPending}>
                {startJob.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start Job
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Active Jobs</CardTitle>
              <CardDescription>
                {jobs.length} job{jobs.length !== 1 ? 's' : ''} total
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pipeline jobs found
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-450px)]">
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.job_id} className="border rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted"
                      onClick={() => toggleJob(job.job_id)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedJobs.has(job.job_id) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {statusIcons[job.status]}
                        <span className="font-mono text-sm">{job.job_id.slice(0, 8)}...</span>
                        <Badge variant={statusColors[job.status] || 'secondary'}>
                          {job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {job.progress !== undefined && (
                          <div className="flex items-center gap-2">
                            <Progress value={job.progress} className="w-24 h-2" />
                            <span>{job.progress}%</span>
                          </div>
                        )}
                        <span>{new Date(job.created_at).toLocaleString()}</span>
                      </div>
                    </div>

                    {expandedJobs.has(job.job_id) && (
                      <div className="p-4 border-t space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Folder:</span>
                            <span className="ml-2 font-mono">{job.folder_path}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Recursive:</span>
                            <span className="ml-2">{job.recursive ? 'Yes' : 'No'}</span>
                          </div>
                          {job.total_files !== undefined && (
                            <div>
                              <span className="text-muted-foreground">Files:</span>
                              <span className="ml-2">
                                {job.processed_files || 0} / {job.total_files}
                              </span>
                            </div>
                          )}
                          {job.failed_files !== undefined && job.failed_files > 0 && (
                            <div>
                              <span className="text-muted-foreground">Failed:</span>
                              <span className="ml-2 text-red-500">{job.failed_files}</span>
                            </div>
                          )}
                        </div>

                        {job.error && (
                          <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
                            Error: {job.error}
                          </div>
                        )}

                        {(job.status === 'running' || job.status === 'pending') && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancelJob(job.job_id)}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel Job
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
