'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCDCStatus } from '@/hooks/useApi';
import { GitBranch, Clock, CheckCircle2, XCircle } from 'lucide-react';

export function CDCCard() {
  const { data: cdc, isLoading, isError } = useCDCStatus();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          CDC Status
        </CardTitle>
        {cdc?.enabled !== undefined && (
          <Badge variant={cdc.enabled ? 'default' : 'secondary'}>
            {cdc.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
        ) : isError || !cdc ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <XCircle className="h-5 w-5" />
            <span className="text-sm">CDC status unavailable</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {cdc.enabled ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-sm">
                Change Data Capture is {cdc.enabled ? 'active' : 'not active'}
              </span>
            </div>

            {cdc.enabled && (
              <>
                {cdc.lag !== undefined && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Lag: {cdc.lag}ms</span>
                  </div>
                )}
                {cdc.last_update && (
                  <div className="text-xs text-muted-foreground">
                    Last update: {new Date(cdc.last_update).toLocaleString()}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
