'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePipelineJobs } from '@/hooks/useApi';
import { useAppStore } from '@/store/settings';
import { GitBranch, ArrowRight, Clock } from 'lucide-react';
import type { PipelineJob } from '@/types/api';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

export function RecentJobsCard() {
  const { data, isLoading } = usePipelineJobs();
  const { setCurrentView } = useAppStore();

  const jobs: PipelineJob[] = data?.jobs
    ? Object.values(data.jobs).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    : [];

  const recentJobs = jobs.slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Recent Pipeline Jobs
        </CardTitle>
        {jobs.length > 5 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setCurrentView('pipeline')}
          >
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No pipeline jobs found
          </div>
        ) : (
          <div className="space-y-3">
            {recentJobs.map((job) => (
              <div
                key={job.job_id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-mono text-xs">
                    {job.job_id.slice(0, 8)}...
                  </span>
                  {job.progress !== undefined && job.status === 'running' && (
                    <span className="text-xs text-muted-foreground">
                      ({job.progress}%)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(job.created_at).toLocaleDateString()}
                  </div>
                  <Badge variant={statusColors[job.status] || 'secondary'}>
                    {job.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
