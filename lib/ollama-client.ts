/**
 * Ollama Local AI Client
 * 
 * Integration with Ollama for running local LLMs like:
 * - Qwen 2.5 3B (recommended for multilingual reasoning)
 * - Llama 3.2 3B (general reasoning)
 * - Gemma 3 4B (complex analysis)
 * - Mistral 7B (high-quality generation)
 * 
 * Benefits:
 * - No API costs
 * - Complete privacy
 * - Works offline
 * - Customizable models
 */

import { createLogger } from './logger';

const logger = createLogger('OllamaClient');

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeout: number;
  retries: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: ChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface EntityAnalysisResult {
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
    context: string;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    evidence: string;
  }>;
  summary: string;
  searchRecommendations: string[];
}

// Default configuration
const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  timeout: 60000, // 60 seconds
  retries: 3,
};

// Recommended models for investigation tasks
export const RECOMMENDED_MODELS = {
  // Best for multilingual entity extraction and reasoning
  qwen_3b: {
    name: 'qwen2.5:3b',
    ram: '4GB',
    strengths: ['multilingual', 'reasoning', 'extraction'],
    recommended: true,
  },
  // Best for general reasoning
  llama_3b: {
    name: 'llama3.2:3b',
    ram: '4GB',
    strengths: ['reasoning', 'analysis', 'context'],
    recommended: true,
  },
  // Best for complex analysis
  gemma_4b: {
    name: 'gemma3:4b',
    ram: '6GB',
    strengths: ['analysis', 'multilingual', 'reasoning'],
    recommended: true,
  },
  // Best for high-quality generation
  mistral_7b: {
    name: 'mistral:7b',
    ram: '8GB',
    strengths: ['generation', 'reasoning', 'quality'],
    recommended: false, // Requires more RAM
  },
  // Fast lightweight model
  gemma_1b: {
    name: 'gemma3:1b',
    ram: '2GB',
    strengths: ['speed', 'extraction'],
    recommended: true,
  },
};

/**
 * Ollama Client Class
 */
export class OllamaClient {
  private config: OllamaConfig;
  private available: boolean | null = null;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;

    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      this.available = response.ok;
      return this.available;
    } catch {
      logger.warn('Ollama not available, falling back to cloud AI');
      this.available = false;
      return false;
    }
  }

  /**
   * Get list of available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.models?.map((m: { name: string }) => m.name) || [];
    } catch {
      return [];
    }
  }

  /**
   * Pull a model if not available
   */
  async pullModel(model: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: false }),
      });
      return response.ok;
    } catch (error) {
      logger.error('Failed to pull model', error);
      return false;
    }
  }

  /**
   * Generate chat completion
   */
  async chat(
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
    }
  ): Promise<string> {
    const isReady = await this.isAvailable();
    if (!isReady) {
      throw new Error('Ollama is not available');
    }

    const requestBody = {
      model: this.config.model,
      messages,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.1,
        top_p: options?.top_p ?? 0.9,
        num_predict: options?.max_tokens ?? 2048,
      },
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const response = await fetch(`${this.config.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama returned ${response.status}`);
        }

        const data: OllamaResponse = await response.json();
        return data.message?.content || '';

      } catch (error) {
        lastError = error as Error;
        logger.warn(`Ollama attempt ${attempt} failed`, { error: lastError.message });
        
        if (attempt < this.config.retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('Ollama request failed');
  }

  /**
   * Generate completion with system prompt
   */
  async generate(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      max_tokens?: number;
    }
  ): Promise<string> {
    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], options);
  }

  /**
   * Extract entities from text using AI
   */
  async extractEntities(text: string): Promise<EntityAnalysisResult> {
    const systemPrompt = `You are an expert entity extraction system for investigation platforms.
Extract entities from the given text and classify them.

Entity Types:
- phone: 10-digit Indian mobile numbers (highest priority)
- email: Email addresses (high priority)
- id_number: PAN, Aadhaar, passport, voter ID (high priority)
- account: Bank account numbers (high priority)
- name: Person names (LOW priority - only for filtering)
- location: Cities, states, addresses (LOW priority - only for filtering)
- company: Company/organization names (LOW priority - only for filtering)

IMPORTANT: Only phone, email, id_number, and account are unique enough for searching.
Names and locations should only be used for filtering results, not searching.

Return JSON format:
{
  "entities": [{"type": "...", "value": "...", "confidence": 0.0-1.0, "context": "..."}],
  "relationships": [{"from": "...", "to": "...", "type": "...", "evidence": "..."}],
  "summary": "Brief summary of findings",
  "searchRecommendations": ["list of high-value terms to search"]
}`;

    const response = await this.generate(systemPrompt, text, { temperature: 0.1 });
    
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Failed to parse entity extraction response', error);
    }

    // Return empty result if parsing failed
    return {
      entities: [],
      relationships: [],
      summary: 'Entity extraction failed',
      searchRecommendations: [],
    };
  }

  /**
   * Generate insights from search results
   */
  async generateInsights(
    query: string,
    results: Array<{
      table: string;
      record: Record<string, unknown>;
      matchScore?: number;
    }>
  ): Promise<{
    summary: string;
    keyFindings: string[];
    entityConnections: string[];
    recommendations: string[];
    confidence: number;
  }> {
    const systemPrompt = `You are an expert investigation analyst.
Analyze the search results and provide actionable insights.

Focus on:
1. Summary of findings (2-3 sentences)
2. Key findings (most important discoveries)
3. Entity connections (relationships between entities)
4. Recommendations for further investigation

Return JSON format:
{
  "summary": "Brief summary of the investigation results",
  "keyFindings": ["finding 1", "finding 2"],
  "entityConnections": ["connection 1", "connection 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "confidence": 0.0-1.0
}`;

    // Prepare results summary
    const resultsSummary = results.slice(0, 10).map((r, i) => ({
      index: i + 1,
      table: r.table,
      score: r.matchScore,
      fields: Object.entries(r.record)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .slice(0, 8)
        .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {}),
    }));

    const userPrompt = `Query: "${query}"

Results (${results.length} total, showing top 10):
${JSON.stringify(resultsSummary, null, 2)}

Provide comprehensive analysis.`;

    const response = await this.generate(systemPrompt, userPrompt, { temperature: 0.3 });
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Failed to parse insights response', error);
    }

    return {
      summary: `Found ${results.length} results for "${query}".`,
      keyFindings: [],
      entityConnections: [],
      recommendations: ['Review the search results for more details.'],
      confidence: 0.5,
    };
  }

  /**
   * Disambiguate entity - determine if two entities are the same
   */
  async disambiguateEntity(
    entity1: { type: string; value: string; context?: string },
    entity2: { type: string; value: string; context?: string }
  ): Promise<{
    sameEntity: boolean;
    confidence: number;
    reasoning: string;
  }> {
    const systemPrompt = `You are an entity resolution expert.
Determine if two entity mentions refer to the same real-world entity.

Consider:
- Same phone = same person (high confidence)
- Same email = same person (high confidence)
- Same name + same location = likely same person (medium confidence)
- Same name + different location = possibly different (low confidence)

Return JSON:
{
  "sameEntity": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explanation"
}`;

    const userPrompt = `Entity 1: ${JSON.stringify(entity1)}
Entity 2: ${JSON.stringify(entity2)}

Are these the same entity?`;

    const response = await this.generate(systemPrompt, userPrompt, { temperature: 0.1 });
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Ignore parsing errors
    }

    return {
      sameEntity: false,
      confidence: 0,
      reasoning: 'Unable to determine',
    };
  }

  /**
   * Rank search terms by uniqueness
   */
  async rankSearchTerms(
    terms: string[],
    context?: string
  ): Promise<Array<{ term: string; priority: number; reason: string }>> {
    const systemPrompt = `You are a search optimization expert for investigation databases.
Rank search terms by their uniqueness and likelihood of returning relevant results.

Uniqueness Scale:
- 10: Phone number (unique to 1 person)
- 9: Email (unique to 1 person)
- 8: ID number like PAN/Aadhaar (unique to 1 person)
- 7: Account number (unique to 1 account)
- 3-4: Full name (thousands of matches)
- 1-2: Location (millions of matches)

Return JSON array:
[{"term": "...", "priority": 1-10, "reason": "..."}]`;

    const response = await this.generate(systemPrompt, JSON.stringify({ terms, context }), { temperature: 0.1 });
    
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Ignore parsing errors
    }

    // Fallback: return original terms with default priorities
    return terms.map(term => ({
      term,
      priority: 5,
      reason: 'Default priority',
    }));
  }
}

// Singleton instance
export const ollamaClient = new OllamaClient();

// Factory function for custom configurations
export function createOllamaClient(config: Partial<OllamaConfig>): OllamaClient {
  return new OllamaClient(config);
}
