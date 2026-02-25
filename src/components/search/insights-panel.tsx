'use client';

/**
 * Insights Panel Component
 * Displays search insights, red flags, patterns, and recommendations
 */

import React from 'react';
import { SearchInsights } from '@/store/investigation-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Lightbulb,
  TrendingUp,
  Users,
} from 'lucide-react';

interface Props {
  insights: SearchInsights;
}

export function InsightsPanel({ insights }: Props) {
  if (!insights) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">No insights available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {/* Overview Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Analysis Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {insights.highValueMatches}
              </div>
              <div className="text-sm text-muted-foreground">High-Value Matches</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-blue-500">
                {insights.totalConnections}
              </div>
              <div className="text-sm text-muted-foreground">Connections Found</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-amber-500">
                {insights.redFlags.length}
              </div>
              <div className="text-sm text-muted-foreground">Red Flags</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-500">
                {insights.recommendations.length}
              </div>
              <div className="text-sm text-muted-foreground">Recommendations</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entity Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Entity Breakdown
          </CardTitle>
          <CardDescription>Types of entities extracted from the search</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(insights.entityBreakdown).map(([type, count]) => (
              <Badge key={type} variant="secondary" className="text-sm py-1 px-3">
                {type}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Entities */}
      {insights.topEntities && insights.topEntities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5" />
              Top Entities by Occurrence
            </CardTitle>
            <CardDescription>Entities appearing most frequently in results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.topEntities.slice(0, 10).map((entity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground w-6">
                      #{index + 1}
                    </span>
                    <div>
                      <span className="font-medium">{entity.value}</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {entity.type}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted-foreground/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${(entity.occurrences / insights.topEntities[0].occurrences) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {entity.occurrences}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Red Flags */}
      {insights.redFlags && insights.redFlags.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Red Flags
            </CardTitle>
            <CardDescription>Potential anomalies requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.redFlags.map((flag, index) => (
                <Alert key={index} variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{flag}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Patterns */}
      {insights.patterns && insights.patterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Detected Patterns
            </CardTitle>
            <CardDescription>Patterns identified during analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.patterns.map((pattern, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-lg"
                >
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{pattern}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {insights.recommendations && insights.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Recommendations
            </CardTitle>
            <CardDescription>Suggested next steps for investigation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950 rounded-lg"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{rec}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
