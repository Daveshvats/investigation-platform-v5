/**
 * Ollama Client for AI-Powered Report Generation
 * Designed for local AI model integration (Ollama, LM Studio, vLLM)
 * Entity extraction uses regex - AI is reserved for reports and insights
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  fallbackModels: string[];
  timeout: number;
  maxRetries: number;
}

export interface OllamaResponse {
  success: boolean;
  content: string;
  model: string;
  responseTime: number;
  tokensUsed?: number;
  error?: string;
}

export interface InvestigationReport {
  title: string;
  executiveSummary: string;
  methodology: string;
  findings: ReportFinding[];
  entityAnalysis: EntityAnalysisSection;
  relationshipAnalysis: RelationshipAnalysisSection;
  recommendations: string[];
  riskAssessment: RiskAssessment;
  conclusion: string;
  generatedAt: string;
  modelUsed: string;
}

export interface ReportFinding {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: string[];
  relatedEntities: string[];
}

export interface EntityAnalysisSection {
  summary: string;
  entityBreakdown: Array<{ type: string; count: number; significance: string }>;
  keyEntities: Array<{ value: string; type: string; analysis: string }>;
}

export interface RelationshipAnalysisSection {
  summary: string;
  connections: Array<{ entity1: string; entity2: string; relationship: string; strength: string }>;
  clusters: Array<{ name: string; entities: string[]; description: string }>;
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  mitigationSuggestions: string[];
  confidenceScore: number;
}

// ============================================================================
// OLLAMA CLIENT CLASS
// ============================================================================

export class OllamaClient {
  private config: OllamaConfig;
  private availableModels: string[] = [];

  constructor(config?: Partial<OllamaConfig>) {
    this.config = {
      baseUrl: config?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: config?.model || process.env.OLLAMA_MODEL || 'qwen3:4b',
      fallbackModels: config?.fallbackModels || ['ministral:8b', 'llama3.2-vision:11b', 'mistral:7b'],
      timeout: config?.timeout || 60000,
      maxRetries: config?.maxRetries || 3,
    };

    // Normalize base URL
    this.config.baseUrl = this.config.baseUrl.replace(/\/+$/, '');
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      this.availableModels = data.models?.map((m: any) => m.name) || [];
      return this.availableModels;
    } catch (error) {
      console.error('Failed to get available models:', error);
      return [];
    }
  }

  /**
   * Get model fallback chain - tries models in order of preference
   */
  async getModelFallbackChain(): Promise<string[]> {
    const models = await this.getAvailableModels();
    const chain: string[] = [];

    // Add primary model if available
    if (models.includes(this.config.model)) {
      chain.push(this.config.model);
    }

    // Add fallback models if available
    for (const model of this.config.fallbackModels) {
      if (models.includes(model) && !chain.includes(model)) {
        chain.push(model);
      }
    }

    // If no preferred models, use first available
    if (chain.length === 0 && models.length > 0) {
      chain.push(models[0]);
    }

    return chain;
  }

  /**
   * Generate text using Ollama
   */
  async generate(
    prompt: string,
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<OllamaResponse> {
    const modelChain = await this.getModelFallbackChain();

    if (modelChain.length === 0) {
      return {
        success: false,
        content: '',
        model: '',
        responseTime: 0,
        error: 'No AI models available',
      };
    }

    // Try each model in the fallback chain
    for (let attempt = 0; attempt < modelChain.length; attempt++) {
      const model = modelChain[attempt];
      const startTime = Date.now();

      try {
        // Try /api/chat first (preferred)
        const response = await this.callChatAPI(model, prompt, systemPrompt, options);

        if (response.success) {
          return response;
        }

        // Fallback to /api/generate if chat fails
        const generateResponse = await this.callGenerateAPI(model, prompt, systemPrompt, options);

        if (generateResponse.success) {
          return generateResponse;
        }
      } catch (error: any) {
        console.error(`Model ${model} failed:`, error.message);
        continue;
      }
    }

    return {
      success: false,
      content: '',
      model: '',
      responseTime: 0,
      error: 'All models failed to generate response',
    };
  }

  /**
   * Call /api/chat endpoint
   */
  private async callChatAPI(
    model: string,
    prompt: string,
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<OllamaResponse> {
    const startTime = Date.now();

    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature || 0.7,
          num_predict: options?.maxTokens || 4096,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Chat API failed: ${response.status}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    // Handle different response formats
    let content = '';

    // Qwen3 format with thinking
    if (data.message?.thinking) {
      content = data.message.thinking;
    }
    // Standard format
    else if (data.message?.content) {
      content = data.message.content;
    }
    // Alternative format
    else if (data.response) {
      content = data.response;
    }

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        content: '',
        model,
        responseTime,
        error: 'Empty response from model',
      };
    }

    return {
      success: true,
      content: content.trim(),
      model,
      responseTime,
      tokensUsed: data.eval_count || data.prompt_eval_count,
    };
  }

  /**
   * Call /api/generate endpoint (fallback)
   */
  private async callGenerateAPI(
    model: string,
    prompt: string,
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<OllamaResponse> {
    const startTime = Date.now();

    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`
      : prompt;

    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: options?.temperature || 0.7,
          num_predict: options?.maxTokens || 4096,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Generate API failed: ${response.status}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    const content = data.response || '';

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        content: '',
        model,
        responseTime,
        error: 'Empty response from model',
      };
    }

    return {
      success: true,
      content: content.trim(),
      model,
      responseTime,
      tokensUsed: data.eval_count || data.prompt_eval_count,
    };
  }

  /**
   * Generate investigation report
   */
  async generateInvestigationReport(
    query: string,
    results: any[],
    insights: any,
    graphData: any
  ): Promise<InvestigationReport> {
    const systemPrompt = this.getReportSystemPrompt();
    const prompt = this.buildReportPrompt(query, results, insights, graphData);

    const response = await this.generate(prompt, systemPrompt, {
      temperature: 0.5,
      maxTokens: 8192,
    });

    if (!response.success) {
      return this.generateFallbackReport(query, results, insights, response.error);
    }

    // Parse the AI response into structured report
    const report = this.parseReportResponse(response.content, query, response.model);
    return report;
  }

  /**
   * Get system prompt for report generation
   */
  private getReportSystemPrompt(): string {
    return `You are an expert investigation analyst AI assistant. Your task is to generate comprehensive, professional investigation reports based on search results and entity analysis.

Your reports should:
1. Be factual and evidence-based
2. Identify patterns and connections between entities
3. Highlight suspicious activities or anomalies
4. Provide actionable recommendations
5. Assess risk levels appropriately

Format your response as a structured JSON object with the following fields:
{
  "title": "Report title",
  "executiveSummary": "Brief 2-3 paragraph summary",
  "methodology": "How the analysis was conducted",
  "findings": [
    {
      "category": "Category name",
      "description": "Detailed description",
      "severity": "low|medium|high|critical",
      "evidence": ["Evidence item 1", "Evidence item 2"],
      "relatedEntities": ["Entity 1", "Entity 2"]
    }
  ],
  "entityAnalysis": {
    "summary": "Overview of entities found",
    "entityBreakdown": [
      {"type": "Entity type", "count": 0, "significance": "Why this matters"}
    ],
    "keyEntities": [
      {"value": "Entity value", "type": "Type", "analysis": "Significance"}
    ]
  },
  "relationshipAnalysis": {
    "summary": "Overview of relationships",
    "connections": [
      {"entity1": "Name", "entity2": "Name", "relationship": "Type", "strength": "Strong|Moderate|Weak"}
    ],
    "clusters": [
      {"name": "Cluster name", "entities": ["E1", "E2"], "description": "What this cluster indicates"}
    ]
  },
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "riskAssessment": {
    "overallRisk": "low|medium|high|critical",
    "riskFactors": ["Factor 1", "Factor 2"],
    "mitigationSuggestions": ["Suggestion 1", "Suggestion 2"],
    "confidenceScore": 0.0-1.0
  },
  "conclusion": "Final summary and next steps"
}

Ensure your analysis is thorough but concise. Focus on actionable insights.`;
  }

  /**
   * Build prompt for report generation
   */
  private buildReportPrompt(
    query: string,
    results: any[],
    insights: any,
    graphData: any
  ): string {
    // Prepare summary data to avoid token limits
    const summaryData = {
      query,
      totalResults: results.length,
      topResults: results.slice(0, 10).map(r => ({
        table: r.tableName,
        matchedFields: r.matchedFields,
        score: r.score?.toFixed(2),
      })),
      insights: {
        highValueMatches: insights.highValueMatches,
        entityBreakdown: insights.entityBreakdown,
        topEntities: insights.topEntities?.slice(0, 10),
        redFlags: insights.redFlags,
        patterns: insights.patterns,
      },
      graphSummary: graphData ? {
        nodeCount: graphData.nodes?.length || 0,
        edgeCount: graphData.edges?.length || 0,
        topConnectedNodes: graphData.nodes
          ?.sort((a: any, b: any) => b.connections?.length - a.connections?.length)
          .slice(0, 5)
          .map((n: any) => ({ label: n.label, type: n.entityType, connections: n.connections?.length })),
      } : null,
    };

    return `Generate a comprehensive investigation report for the following search:

ORIGINAL QUERY: "${query}"

SEARCH RESULTS SUMMARY:
${JSON.stringify(summaryData, null, 2)}

Based on this data, generate a professional investigation report in JSON format.`;
  }

  /**
   * Parse AI response into structured report
   */
  private parseReportResponse(
    content: string,
    query: string,
    model: string
  ): InvestigationReport {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...parsed,
          generatedAt: new Date().toISOString(),
          modelUsed: model,
        };
      }
    } catch (error) {
      console.error('Failed to parse report JSON:', error);
    }

    // Fallback: create report from text
    return {
      title: `Investigation Report: ${query}`,
      executiveSummary: content.substring(0, 500),
      methodology: 'AI-powered analysis with regex-based entity extraction',
      findings: [],
      entityAnalysis: {
        summary: 'See full analysis in report content',
        entityBreakdown: [],
        keyEntities: [],
      },
      relationshipAnalysis: {
        summary: 'See full analysis in report content',
        connections: [],
        clusters: [],
      },
      recommendations: ['Review full AI response for recommendations'],
      riskAssessment: {
        overallRisk: 'medium',
        riskFactors: [],
        mitigationSuggestions: [],
        confidenceScore: 0.5,
      },
      conclusion: content,
      generatedAt: new Date().toISOString(),
      modelUsed: model,
    };
  }

  /**
   * Generate fallback report when AI fails
   */
  private generateFallbackReport(
    query: string,
    results: any[],
    insights: any,
    error?: string
  ): InvestigationReport {
    const entityBreakdown = Object.entries(insights.entityBreakdown || {}).map(
      ([type, count]) => ({
        type,
        count: count as number,
        significance: `${type} entities found in search results`,
      })
    );

    const keyEntities = (insights.topEntities || []).slice(0, 5).map((e: any) => ({
      value: e.value,
      type: e.type,
      analysis: `High occurrence entity (${e.occurrences} occurrences)`,
    }));

    const riskLevel = this.assessRiskLevel(results.length, insights.redFlags?.length || 0);

    return {
      title: `Investigation Report: ${query}`,
      executiveSummary: `This report presents the findings from an automated investigation search. The search query "${query}" returned ${results.length} results. ${insights.highValueMatches} high-value entity matches were identified during the analysis.`,
      methodology: 'Automated regex-based entity extraction with iterative search and correlation analysis. AI analysis was unavailable.',
      findings: (insights.redFlags || []).map((flag: string) => ({
        category: 'Anomaly Detection',
        description: flag,
        severity: 'medium' as const,
        evidence: [],
        relatedEntities: [],
      })),
      entityAnalysis: {
        summary: `Found ${results.length} records matching search criteria across multiple data sources.`,
        entityBreakdown,
        keyEntities,
      },
      relationshipAnalysis: {
        summary: 'Relationship analysis performed through entity co-occurrence detection.',
        connections: [],
        clusters: [],
      },
      recommendations: insights.recommendations || ['Review search results manually', 'Expand search criteria if needed'],
      riskAssessment: {
        overallRisk: riskLevel,
        riskFactors: insights.redFlags || [],
        mitigationSuggestions: ['Conduct detailed manual review', 'Verify findings with additional data sources'],
        confidenceScore: 0.6,
      },
      conclusion: `Investigation completed with ${results.length} results. ${error ? `AI analysis unavailable: ${error}` : 'AI analysis was not performed.'}`,
      generatedAt: new Date().toISOString(),
      modelUsed: 'fallback',
    };
  }

  /**
   * Assess risk level based on results and red flags
   */
  private assessRiskLevel(resultCount: number, redFlagCount: number): 'low' | 'medium' | 'high' | 'critical' {
    if (redFlagCount >= 5 || resultCount > 100) return 'high';
    if (redFlagCount >= 3 || resultCount > 50) return 'medium';
    return 'low';
  }

  /**
   * Generate insights summary (for quick analysis)
   */
  async generateInsightsSummary(
    query: string,
    results: any[],
    insights: any
  ): Promise<string> {
    const systemPrompt = `You are an investigation analyst. Generate a concise summary (2-3 paragraphs) of the search findings.`;

    const prompt = `
Query: "${query}"
Results: ${results.length} records found
Top Entities: ${JSON.stringify(insights.topEntities?.slice(0, 5) || [])}
Red Flags: ${JSON.stringify(insights.redFlags || [])}
Patterns: ${JSON.stringify(insights.patterns || [])}

Provide a brief analysis summary.`;

    const response = await this.generate(prompt, systemPrompt, {
      temperature: 0.5,
      maxTokens: 500,
    });

    return response.success ? response.content : 'AI analysis unavailable. Please review results manually.';
  }

  /**
   * Generate recommendations based on findings
   */
  async generateRecommendations(
    query: string,
    findings: any[],
    riskLevel: string
  ): Promise<string[]> {
    const prompt = `
Based on the following investigation findings, generate 3-5 actionable recommendations:

Query: "${query}"
Risk Level: ${riskLevel}
Findings: ${JSON.stringify(findings.slice(0, 5))}

List specific, actionable recommendations.`;

    const response = await this.generate(prompt, undefined, {
      temperature: 0.6,
      maxTokens: 500,
    });

    if (!response.success) {
      return ['Conduct detailed manual review', 'Verify findings with additional sources'];
    }

    // Extract bullet points from response
    const recommendations = response.content
      .split('\n')
      .filter(line => line.match(/^[\d\-\*•\.]+\s*.+/))
      .map(line => line.replace(/^[\d\-\*•\.]+\s*/, '').trim())
      .filter(line => line.length > 10);

    return recommendations.length > 0 ? recommendations : [response.content];
  }
}

// Export singleton instance
export const ollamaClient = new OllamaClient();
