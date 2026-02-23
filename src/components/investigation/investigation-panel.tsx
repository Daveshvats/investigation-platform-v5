'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  Brain,
  MessageSquare,
  Search,
  Sparkles,
  FileText,
  Users,
  MapPin,
  Link2,
  RefreshCw,
  ChevronRight,
  Lightbulb,
  Shield,
} from 'lucide-react';
import type { TableRow } from '@/types/api';

interface InvestigationPanelProps {
  tables: Array<{ name: string; records: TableRow[] }>;
  onTableSelect?: (tableName: string) => void;
}

interface TableProfile {
  name: string;
  recordCount: number;
  purpose: string;
  keyFields: string[];
  fieldTypes: Record<string, { type: string; confidence: number; fillRate: string }>;
}

interface Insight {
  type: string;
  title: string;
  description: string;
  confidence: number;
  severity: string;
  entities: Array<{ field: string; value: string; table: string }>;
  followUpQuestions: string[];
}

interface QueryResult {
  answer: string;
  relevantRecords: Array<{ table: string; record: Record<string, unknown> }>;
  suggestedQueries: string[];
}

export function InvestigationPanel({ tables, onTableSelect }: InvestigationPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [profiles, setProfiles] = useState<TableProfile[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [redFlags, setRedFlags] = useState<Insight[]>([]);
  const [narrative, setNarrative] = useState<any>(null);
  const [crossAnalysis, setCrossAnalysis] = useState<any>(null);
  const [suggestedQueries, setSuggestedQueries] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runFullAnalysis = useCallback(async () => {
    if (tables.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables, analysisType: 'full' }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      setProfiles(data.tableSummaries || []);
      setInsights(data.insights || []);
      setRedFlags(data.redFlags || []);
      setNarrative(data.narrative);
      setCrossAnalysis(data.crossAnalysis);
      setSuggestedQueries(data.suggestedQueries || []);
      setRelationships(data.relationships || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsLoading(false);
    }
  }, [tables]);

  const runQuery = useCallback(async () => {
    if (!query.trim() || tables.length === 0) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables, analysisType: 'query', query }),
      });

      const data = await response.json();

      if (data.success) {
        setQueryResult(data.queryResult);
      }
    } catch (err) {
      console.error('Query error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [query, tables]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'connection': return <Link2 className="h-4 w-4" />;
      case 'pattern': return <Sparkles className="h-4 w-4" />;
      case 'anomaly': return <AlertTriangle className="h-4 w-4" />;
      case 'lead': return <Lightbulb className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            AI Investigation Assistant
          </h2>
          <p className="text-sm text-muted-foreground">
            Smart analysis for {tables.length} table{tables.length !== 1 ? 's' : ''} • 
            {tables.reduce((sum, t) => sum + t.records.length, 0)} total records
          </p>
        </div>
        <Button onClick={runFullAnalysis} disabled={isLoading || tables.length === 0}>
          {isLoading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Brain className="mr-2 h-4 w-4" />
              Analyze All Data
            </>
          )}
        </Button>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1 p-4">
        {error && (
          <Card className="mb-4 border-destructive">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            </CardContent>
          </Card>
        )}

        {!profiles.length && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Brain className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Ready for Analysis</h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                Click "Analyze All Data" to start AI-powered investigation analysis. 
                The system will automatically detect field types, find patterns, and generate insights.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge variant="outline">Auto Field Detection</Badge>
                <Badge variant="outline">Pattern Recognition</Badge>
                <Badge variant="outline">Cross-Case Analysis</Badge>
                <Badge variant="outline">Natural Language Query</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {profiles.length > 0 && (
          <Tabs defaultValue="query" className="space-y-4">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="query">
                <MessageSquare className="h-4 w-4 mr-1" />
                Query
              </TabsTrigger>
              <TabsTrigger value="insights">
                <Sparkles className="h-4 w-4 mr-1" />
                Insights
              </TabsTrigger>
              <TabsTrigger value="data">
                <FileText className="h-4 w-4 mr-1" />
                Data Profile
              </TabsTrigger>
              <TabsTrigger value="connections">
                <Link2 className="h-4 w-4 mr-1" />
                Connections
              </TabsTrigger>
              <TabsTrigger value="narrative">
                <FileText className="h-4 w-4 mr-1" />
                Narrative
              </TabsTrigger>
            </TabsList>

            {/* Query Tab */}
            <TabsContent value="query" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Ask Questions About Your Data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., Who has appeared in multiple cases? What are the common locations?"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runQuery()}
                      className="flex-1"
                    />
                    <Button onClick={runQuery} disabled={isLoading || !query.trim()}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Suggested Queries */}
                  {suggestedQueries.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Suggested queries:</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestedQueries.slice(0, 6).map((sq, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setQuery(sq);
                              setTimeout(runQuery, 100);
                            }}
                          >
                            {sq}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Query Result */}
                  {queryResult && (
                    <div className="mt-4 space-y-3">
                      <Card className="bg-primary/5">
                        <CardContent className="pt-4">
                          <p className="text-sm font-medium mb-2">Answer:</p>
                          <p className="text-sm">{queryResult.answer}</p>
                        </CardContent>
                      </Card>

                      {queryResult.relevantRecords.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Relevant Records:</p>
                          {queryResult.relevantRecords.slice(0, 5).map((rec, i) => (
                            <Card key={i}>
                              <CardContent className="py-2">
                                <Badge variant="outline" className="mb-1">{rec.table}</Badge>
                                <div className="text-xs space-y-1">
                                  {Object.entries(rec.record).slice(0, 4).map(([k, v]) => (
                                    <div key={k} className="flex justify-between">
                                      <span className="text-muted-foreground">{k}:</span>
                                      <span className="truncate ml-2 max-w-[200px]">{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}

                      {queryResult.suggestedQueries.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {queryResult.suggestedQueries.map((sq, i) => (
                            <Button key={i} variant="ghost" size="sm" onClick={() => setQuery(sq)}>
                              <ChevronRight className="h-3 w-3 mr-1" />
                              {sq}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Insights Tab */}
            <TabsContent value="insights" className="space-y-4">
              {/* Red Flags */}
              {redFlags.length > 0 && (
                <Card className="border-orange-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-600">
                      <AlertTriangle className="h-5 w-5" />
                      Red Flags Detected ({redFlags.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {redFlags.map((flag, i) => (
                      <div key={i} className="p-3 rounded-lg border bg-orange-50 dark:bg-orange-950/20">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{flag.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{flag.description}</p>
                          </div>
                          <Badge className={`${getSeverityColor(flag.severity)} text-white`}>
                            {flag.severity}
                          </Badge>
                        </div>
                        {flag.entities.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {flag.entities.slice(0, 4).map((e, j) => (
                              <Badge key={j} variant="outline" className="text-xs">
                                {e.value}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* All Insights */}
              {insights.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      AI-Generated Insights ({insights.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {insights.map((insight, i) => (
                      <div key={i} className="p-3 rounded-lg border">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{getTypeIcon(insight.type)}</div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm">{insight.title}</p>
                              <Badge variant="outline" className="text-xs">
                                {Math.round(insight.confidence * 100)}% confidence
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                            {insight.followUpQuestions.length > 0 && (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs font-medium">Follow-up:</p>
                                <ul className="text-xs text-muted-foreground list-disc list-inside">
                                  {insight.followUpQuestions.slice(0, 2).map((q, j) => (
                                    <li key={j}>{q}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Data Profile Tab */}
            <TabsContent value="data" className="space-y-4">
              {profiles.map((profile, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{profile.name}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="outline">{profile.purpose}</Badge>
                        <Badge>{profile.recordCount} records</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(profile.fieldTypes).map(([field, info]) => (
                        <div key={field} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                          <span className="font-medium">{field}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{info.type}</Badge>
                            <span className="text-xs text-muted-foreground">{info.fillRate}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Connections Tab */}
            <TabsContent value="connections" className="space-y-4">
              {crossAnalysis && (
                <>
                  {/* Common Suspects */}
                  {crossAnalysis.commonSuspects?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Common Persons Across Cases
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {crossAnalysis.commonSuspects.map((s: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-2 rounded bg-muted">
                              <span className="font-medium">{s.name}</span>
                              <div className="flex items-center gap-2">
                                <Badge>{s.appearances} appearances</Badge>
                                <div className="text-xs text-muted-foreground">
                                  in {s.cases?.slice(0, 2).join(', ')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Common Locations */}
                  {crossAnalysis.commonLocations?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Common Locations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {crossAnalysis.commonLocations.map((l: any, i: number) => (
                            <Badge key={i} variant="outline" className="py-1 px-2">
                              {l.location} ({l.cases?.length || 0} cases)
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Modus Operandi */}
                  {crossAnalysis.modusOperandi?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Identified Patterns (Modus Operandi)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="list-disc list-inside space-y-1">
                          {crossAnalysis.modusOperandi.map((mo: string, i: number) => (
                            <li key={i} className="text-sm">{mo}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* Recommended Actions */}
                  {crossAnalysis.recommendedActions?.length > 0 && (
                    <Card className="border-primary/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-yellow-500" />
                          Recommended Actions
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {crossAnalysis.recommendedActions.map((action: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <ChevronRight className="h-4 w-4 mt-0.5 text-primary" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {/* Table Relationships */}
              {relationships.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Detected Table Relationships</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {relationships.slice(0, 10).map((rel, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm p-2 rounded bg-muted">
                          <span className="font-medium">{rel.sourceTable}.{rel.sourceField}</span>
                          <Link2 className="h-3 w-3" />
                          <span className="font-medium">{rel.targetTable}.{rel.targetField}</span>
                          <Badge variant="outline" className="ml-auto">
                            {Math.round(rel.confidence * 100)}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Narrative Tab */}
            <TabsContent value="narrative">
              {narrative ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Case Narrative</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm">{narrative.summary}</p>
                      </div>

                      {narrative.timeline?.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Timeline</h4>
                          <div className="space-y-2">
                            {narrative.timeline.map((t: any, i: number) => (
                              <div key={i} className="flex gap-3 text-sm">
                                <span className="text-muted-foreground w-24 shrink-0">{t.date}</span>
                                <span>{t.event}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {narrative.keyEntities?.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Key Entities</h4>
                          <div className="flex flex-wrap gap-2">
                            {narrative.keyEntities.map((e: any, i: number) => (
                              <Badge key={i} variant="secondary">
                                {e.name} ({e.role})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {narrative.potentialLeads?.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Potential Leads</h4>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {narrative.potentialLeads.map((lead: string, i: number) => (
                              <li key={i}>{lead}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {narrative.riskAssessment && (
                        <div className="p-3 rounded bg-muted">
                          <h4 className="font-semibold text-sm mb-1">Risk Assessment</h4>
                          <p className="text-sm text-muted-foreground">{narrative.riskAssessment}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Run analysis to generate case narrative
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ScrollArea>
    </div>
  );
}

export default InvestigationPanel;
