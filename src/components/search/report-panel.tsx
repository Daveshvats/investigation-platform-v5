'use client';

/**
 * Report Panel Component
 * Preview and generate investigation reports
 */

import React, { useState } from 'react';
import { SearchInsights, SearchResult } from '@/store/investigation-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, FileText, Loader2, Settings } from 'lucide-react';

interface Props {
  query: string;
  results: SearchResult[];
  insights: SearchInsights | null;
}

export function ReportPanel({ query, results, insights }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Report options
  const [options, setOptions] = useState({
    classification: 'CONFIDENTIAL',
    organization: 'Investigation Unit',
    caseNumber: '',
    investigatorName: '',
    includeGraph: true,
    includeRawData: false,
  });

  // Generate and download report
  const handleGenerateReport = async () => {
    setIsGenerating(true);

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          results,
          insights,
          correlationGraph: null, // Will be passed from parent
          options,
        }),
      });

      if (!response.ok) {
        throw new Error('Report generation failed');
      }

      // Download PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investigation-report-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Report generation error:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Report Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Investigation Report Preview
          </CardTitle>
          <CardDescription>
            AI-powered curated report with findings, analysis, and recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Report Structure Preview */}
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-lg">
              <h4 className="font-medium mb-1">Report Title</h4>
              <p className="text-sm text-muted-foreground">
                Investigation Report: {query || 'Your Search Query'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-1">Executive Summary</h4>
                <p className="text-xs text-muted-foreground">
                  AI-generated overview of findings
                </p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-1">Methodology</h4>
                <p className="text-xs text-muted-foreground">
                  Regex extraction + AI analysis
                </p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-1">Findings</h4>
                <p className="text-xs text-muted-foreground">
                  {insights?.redFlags?.length || 0} findings identified
                </p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-1">Risk Assessment</h4>
                <p className="text-xs text-muted-foreground">
                  Overall risk evaluation
                </p>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <h4 className="font-medium text-sm mb-2">Report Contents</h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>✓ Executive Summary</span>
                <span>✓ Methodology</span>
                <span>✓ Entity Analysis</span>
                <span>✓ Relationship Analysis</span>
                <span>✓ Correlation Graph</span>
                <span>✓ Risk Assessment</span>
                <span>✓ Recommendations</span>
                <span>✓ Conclusion</span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {results.length} Records
              </Badge>
              <Badge variant="secondary">
                {insights?.entityBreakdown ? Object.keys(insights.entityBreakdown).length : 0} Entity Types
              </Badge>
              <Badge variant="secondary">
                {insights?.redFlags?.length || 0} Red Flags
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Report Settings
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              {showSettings ? 'Hide' : 'Show'}
            </Button>
          </div>
        </CardHeader>
        {showSettings && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="classification">Classification</Label>
                <Select
                  value={options.classification}
                  onValueChange={(v) => setOptions({ ...options, classification: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNCLASSIFIED">UNCLASSIFIED</SelectItem>
                    <SelectItem value="CONFIDENTIAL">CONFIDENTIAL</SelectItem>
                    <SelectItem value="SECRET">SECRET</SelectItem>
                    <SelectItem value="TOP SECRET">TOP SECRET</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <Input
                  id="organization"
                  value={options.organization}
                  onChange={(e) => setOptions({ ...options, organization: e.target.value })}
                  placeholder="Organization name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="caseNumber">Case Number</Label>
                <Input
                  id="caseNumber"
                  value={options.caseNumber}
                  onChange={(e) => setOptions({ ...options, caseNumber: e.target.value })}
                  placeholder="Case reference number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="investigator">Investigator Name</Label>
                <Input
                  id="investigator"
                  value={options.investigatorName}
                  onChange={(e) => setOptions({ ...options, investigatorName: e.target.value })}
                  placeholder="Investigator name"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Include Correlation Graph</Label>
                <Button
                  variant={options.includeGraph ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOptions({ ...options, includeGraph: !options.includeGraph })}
                >
                  {options.includeGraph ? 'Yes' : 'No'}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <Label>Include Raw Data</Label>
                <Button
                  variant={options.includeRawData ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOptions({ ...options, includeRawData: !options.includeRawData })}
                >
                  {options.includeRawData ? 'Yes' : 'No'}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Generate Button */}
      <Button
        onClick={handleGenerateReport}
        disabled={isGenerating || results.length === 0}
        className="w-full"
        size="lg"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating Report...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Generate & Download PDF Report
          </>
        )}
      </Button>

      {results.length === 0 && (
        <p className="text-sm text-center text-muted-foreground">
          Perform a search first to generate a report
        </p>
      )}
    </div>
  );
}
