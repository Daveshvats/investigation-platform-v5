'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useHealthCheck } from '@/hooks/useApi';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

export function HealthCard() {
  const { data: health, isLoading, isError, refetch } = useHealthCheck();

  const getStatusData = () => {
    if (isError || !health) {
      return {
        icon: <XCircle className="h-8 w-8 text-destructive" />,
        label: 'Disconnected',
        color: 'destructive',
        description: 'Unable to connect to the API server',
      };
    }
    // Backend returns "UP" or "DOWN"
    const status = health.status?.toUpperCase();
    switch (status) {
      case 'UP':
      case 'HEALTHY':
        return {
          icon: <CheckCircle2 className="h-8 w-8 text-green-500" />,
          label: 'UP',
          color: 'default',
          description: 'All systems operational',
        };
      case 'DEGRADED':
        return {
          icon: <AlertTriangle className="h-8 w-8 text-yellow-500" />,
          label: 'Degraded',
          color: 'secondary',
          description: 'Some features may be slow or unavailable',
        };
      case 'DOWN':
        return {
          icon: <XCircle className="h-8 w-8 text-destructive" />,
          label: 'Down',
          color: 'destructive',
          description: 'Service is currently unavailable',
        };
      default:
        return {
          icon: <AlertTriangle className="h-8 w-8 text-muted-foreground" />,
          label: 'Unknown',
          color: 'secondary',
          description: 'Status unknown',
        };
    }
  };

  const statusData = getStatusData();

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Health Status
        </CardTitle>
        <Badge
          variant={statusData.color as 'default' | 'secondary' | 'destructive'}
        >
          {statusData.label}
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">{statusData.icon}</div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{statusData.label}</p>
              <p className="text-xs text-muted-foreground">
                {statusData.description}
              </p>
              {health?.tables_count !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {health.tables_count} tables available
                </p>
              )}
              {health?.clickhouse !== undefined && (
                <p className="text-xs text-muted-foreground">
                  ClickHouse: {health.clickhouse ? '✓ Connected' : '✗ Disconnected'}
                </p>
              )}
              {health?.redis !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Redis: {health.redis ? '✓ Connected' : '✗ Disconnected'}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
      {/* Animated pulse for UP status */}
      {(health?.status?.toUpperCase() === 'UP' || health?.status?.toLowerCase() === 'healthy') && (
        <div className="absolute right-4 top-4">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500"></span>
          </span>
        </div>
      )}
    </Card>
  );
}
