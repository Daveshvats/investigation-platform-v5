'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useStartPipelineJob } from '@/hooks/useApi';
import { Loader2, Play, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

export function StartJobForm() {
  const [folderPath, setFolderPath] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const startJob = useStartPipelineJob();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!folderPath.trim()) {
      toast.error('Please enter a folder path');
      return;
    }

    setIsValidating(true);

    try {
      const result = await startJob.mutateAsync({
        folderPath,
        recursive,
      });
      toast.success(`Job started: ${result.job_id}`);
      setFolderPath('');
      setRecursive(false);
    } catch (error) {
      toast.error('Failed to start job. Please check the path and try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Play className="h-5 w-5" />
          Start New Job
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="folderPath">Folder Path</Label>
            <div className="relative">
              <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="folderPath"
                placeholder="/path/to/data/folder"
                className="pl-10"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the absolute path to the folder containing data files
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="recursive">Recursive</Label>
              <p className="text-xs text-muted-foreground">
                Process files in subdirectories
              </p>
            </div>
            <Switch
              id="recursive"
              checked={recursive}
              onCheckedChange={setRecursive}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isValidating || startJob.isPending}
          >
            {isValidating || startJob.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Pipeline Job
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
