'use client';

import { useState } from 'react';
import { JobList } from './job-list';
import { JobDetail } from './job-detail';
import { StartJobForm } from './start-job-form';
import { GitBranch } from 'lucide-react';

export function PipelineView() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="h-6 w-6" />
          Pipeline Jobs
        </h2>
        <p className="text-muted-foreground">
          Manage data processing pipelines and monitor job progress.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Start Job Form */}
        <div className="lg:col-span-4">
          <StartJobForm />
        </div>

        {/* Job List */}
        <div className="lg:col-span-4">
          <JobList
            selectedJobId={selectedJobId}
            onSelectJob={setSelectedJobId}
          />
        </div>

        {/* Job Detail */}
        <div className="lg:col-span-4">
          <JobDetail jobId={selectedJobId} />
        </div>
      </div>
    </div>
  );
}
