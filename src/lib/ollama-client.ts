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
    context?: string;
    searchPriority?: string;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    evidence: string;
  }>;
  summary: string;
  searchRecommendations: string[];
  searchStrategy?: {
    primarySearchTerms: string[];
    filterTerms: string[];
    intent: string;
  };
}

// Default configuration
const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434')
    .replace(/\/v1\/?$/, '')  // Remove /v1 suffix if present
    .replace(/\/+$/, ''),     // Remove trailing slashes
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
    this.config = { 
      ...DEFAULT_CONFIG, 
      ...config,
      // Ensure baseUrl has no trailing slashes
      baseUrl: (config.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ''),
    };
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;

    const url = `${this.config.baseUrl}/api/tags`;
    logger.info(`Checking Ollama availability at: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      this.available = response.ok;
      
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: { name: string }) => m.name) || [];
        logger.info(`Ollama available! Models: ${models.join(', ')}`);
        
        // Check if our model is available
        if (!models.some((m: string) => m.includes(this.config.model.split(':')[0]))) {
          logger.warn(`Model ${this.config.model} not found. Available models: ${models.join(', ')}`);
          logger.info(`Run: ollama pull ${this.config.model}`);
        }
      } else {
        logger.warn(`Ollama returned status ${response.status}`);
      }
      
      return this.available;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Ollama not available: ${errorMsg}`);
      logger.error(`Make sure Ollama is running at ${this.config.baseUrl}`);
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

    // Try /api/generate first (more reliable), then /api/chat
    const endpoints = ['/api/generate', '/api/chat'];
    
    for (const endpoint of endpoints) {
      const url = `${this.config.baseUrl}${endpoint}`;
      
      // Prepare request body based on endpoint
      let requestBody: Record<string, unknown>;
      
      if (endpoint === '/api/chat') {
        requestBody = {
          model: this.config.model,
          messages,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.1,
            top_p: options?.top_p ?? 0.9,
            num_predict: options?.max_tokens ?? 2048,
          },
        };
      } else {
        // /api/generate uses different format
        const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        requestBody = {
          model: this.config.model,
          prompt: lastUserMessage,
          system: systemMessage,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.1,
            top_p: options?.top_p ?? 0.9,
            num_predict: options?.max_tokens ?? 2048,
          },
        };
      }

      for (let attempt = 1; attempt <= this.config.retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(),
            this.config.timeout
          );

          logger.info(`Trying Ollama endpoint: ${url} (attempt ${attempt})`);

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            logger.warn(`Ollama ${endpoint} returned ${response.status}: ${errorText.slice(0, 200)}`);
            
            if (response.status === 405) {
              // Method not allowed - try next endpoint
              break;
            }
            throw new Error(`Ollama returned ${response.status}`);
          }

          const data = await response.json();
          
          logger.info(`Ollama ${endpoint} raw response keys: ${Object.keys(data).join(', ')}`);
          
          // Handle different response formats
          let content = '';
          if (endpoint === '/api/chat') {
            content = data.message?.content || '';
            // Qwen3 puts content in 'thinking' field sometimes
            if (!content && data.message?.thinking) {
              content = data.message.thinking;
              logger.info('Using thinking field from chat response');
            }
          } else {
            // /api/generate returns { response: "...", thinking: "..." }
            content = data.response || '';
            // Qwen3 sometimes puts the actual content in 'thinking' field
            if (!content && data.thinking) {
              content = data.thinking;
              logger.info('Using thinking field from generate response');
            }
          }
          
          // If we got content, return it
          if (content && content.trim()) {
            logger.info(`Ollama ${endpoint} succeeded, response length: ${content.length}`);
            return content;
          }
          
          // Empty response - try next endpoint or retry
          logger.warn(`Ollama ${endpoint} returned empty content`);
          break; // Try next endpoint

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Ollama ${endpoint} attempt ${attempt} failed: ${errorMsg}`);
          
          if (attempt < this.config.retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
    }

    throw new Error('All Ollama endpoints failed');
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
   * For Qwen3 models, we use /no_think to disable thinking mode and get pure JSON
   */
  async extractEntities(text: string): Promise<EntityAnalysisResult> {
    // Check if this is a Qwen3 model - needs special handling
    const isQwen3 = this.config.model.toLowerCase().includes('qwen3');
    
    const systemPrompt = `You are an entity extraction system. Extract entities and relationships from the query.

CRITICAL: Return ONLY a valid JSON object with NO additional text, NO thinking, NO explanation.

Entity Types by Priority:
- HIGH: phone (10-digit), email, id_number (PAN/Aadhaar), account (bank accounts)
- MEDIUM: address (specific addresses with house/flat numbers)
- LOW: name, location, company

Example input: "find subodh from delhi connected to rahul sharma"
Example output:
{"entities":[{"type":"name","value":"subodh","confidence":0.8,"searchPriority":"LOW"},{"type":"location","value":"delhi","confidence":0.9,"searchPriority":"LOW"},{"type":"name","value":"rahul sharma","confidence":0.8,"searchPriority":"LOW"}],"relationships":[{"from":"subodh","to":"delhi","type":"location","evidence":"from delhi"},{"from":"subodh","to":"rahul sharma","type":"association","evidence":"connected to"}],"searchStrategy":{"primarySearchTerms":[],"filterTerms":["subodh","delhi","rahul sharma"],"intent":"Find person by name with location and association filters"},"summary":"User wants to find subodh from delhi who is connected to rahul sharma"}

Return ONLY the JSON object. No markdown. No code blocks. No explanation.${isQwen3 ? ' /no_think' : ''}`;

    const userPrompt = `Extract entities from: "${text}"`;

    logger.info('Calling AI for entity extraction...');
    
    try {
      const response = await this.generate(systemPrompt, userPrompt, { temperature: 0.1, max_tokens: 2048 });
      
      logger.info('AI response received', { 
        responseLength: response?.length || 0,
        responsePreview: response?.slice(0, 500) 
      });
      
      // Try to parse as JSON directly
      try {
        const parsed = JSON.parse(response.trim());
        if (parsed.entities && Array.isArray(parsed.entities)) {
          logger.info('Direct JSON parse successful', { entityCount: parsed.entities.length });
          return parsed;
        }
      } catch {
        // Not direct JSON, continue to extraction
      }
      
      // Try to extract JSON from response
      let jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.entities && Array.isArray(parsed.entities)) {
            logger.info('JSON extracted from response', { 
              entityCount: parsed.entities?.length || 0,
              hasStrategy: !!parsed.searchStrategy 
            });
            return parsed;
          }
        } catch {
          // JSON parse failed, fall through
        }
      }
      
      // If we get here, the AI returned reasoning text - parse it intelligently
      logger.info('Parsing AI reasoning text for entities...', { 
        responsePreview: response.slice(0, 300),
        isQwen3
      });
      return this.parseReasoningText(response, text, isQwen3);
      
    } catch (error) {
      logger.warn('AI extraction failed, using fallback', { 
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fallback: extract from raw text using regex
      return this.extractEntitiesFromText(text, text);
    }
  }

  /**
   * Parse reasoning/thinking text from AI to extract structured entities
   * Qwen3 often outputs reasoning in the thinking field with step-by-step analysis
   */
  private parseReasoningText(aiResponse: string, originalQuery: string, isQwen3: boolean = false): EntityAnalysisResult {
    const entities: Array<{type: string; value: string; confidence: number; searchPriority: string}> = [];
    const relationships: Array<{from: string; to: string; type: string; evidence: string}> = [];
    const seen = new Set<string>();
    
    // Words to NEVER extract as entity values (meta-terms, instruction words, etc.)
    const forbiddenWords = new Set([
      'entity', 'entities', 'type', 'types', 'value', 'values', 'name', 'names',
      'phone', 'email', 'address', 'location', 'account', 'id', 'number',
      'relationship', 'relationships', 'search', 'strategy', 'filter', 'filters',
      'step', 'steps', 'example', 'examples', 'query', 'result', 'results',
      'high', 'medium', 'low', 'priority', 'confidence', 'context', 'evidence',
      'extract', 'extracted', 'following', 'based', 'according', 'mentions',
      'valid', 'invalid', 'format', 'field', 'pattern', 'match', 'matched',
      'note', 'notes', 'first', 'second', 'third', 'also', 'however', 'therefore',
      'should', 'would', 'could', 'might', 'must', 'can', 'will', 'need',
      'information', 'data', 'record', 'records', 'person', 'user', 'input',
      'output', 'response', 'json', 'object', 'array', 'string', 'text'
    ]);
    
    // Common Indian first names for better name detection
    const commonIndianNames = new Set([
      'rahul', 'amit', 'priya', 'sunil', 'anil', 'rajesh', 'suresh', 'ravi', 'sanjay', 'vijay',
      'subodh', 'aman', 'rohit', 'mohit', 'neha', 'pooja', 'deepak', 'manish', 'rakesh', 'ajay',
      'vikram', 'sachin', 'varun', 'arun', 'kiran', 'meena', 'rekha', 'sunita', 'kavita', 'nisha',
      'sharma', 'verma', 'gupta', 'singh', 'kumar', 'joshi', 'patel', 'shah', 'agarwal', 'yadav',
      'kapoor', 'mehta', 'chopra', 'banerjee', 'mukherjee', 'nair', 'menon', 'pillai', 'reddy',
      'rao', 'iyer', 'iyyengar', 'desai', 'trivedi', 'bhat', 'kulkarni', 'jain', 'bhattacharya'
    ]);
    
    // Common Indian cities
    const commonCities = new Set([
      'delhi', 'mumbai', 'kolkata', 'chennai', 'bangalore', 'hyderabad', 'pune',
      'ahmedabad', 'jaipur', 'lucknow', 'kanpur', 'nagpur', 'indore', 'bhopal',
      'patna', 'ludhiana', 'agra', 'nashik', 'faridabad', 'meerut', 'rajkot'
    ]);
    
    // Extract HIGH value entities first (these are unambiguous)
    
    // Phone numbers (HIGH priority)
    const phoneMatch = originalQuery.match(/[6-9]\d{9}/g);
    if (phoneMatch) {
      [...new Set(phoneMatch)].forEach(phone => {
        if (!seen.has(`phone:${phone}`)) {
          seen.add(`phone:${phone}`);
          entities.push({ type: 'phone', value: phone, confidence: 0.99, searchPriority: 'HIGH' });
        }
      });
    }
    
    // Emails (HIGH priority)
    const emailMatch = originalQuery.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi);
    if (emailMatch) {
      [...new Set(emailMatch.map(e => e.toLowerCase()))].forEach(email => {
        if (!seen.has(`email:${email}`)) {
          seen.add(`email:${email}`);
          entities.push({ type: 'email', value: email, confidence: 0.99, searchPriority: 'HIGH' });
        }
      });
    }
    
    // ID numbers - PAN, Aadhaar (HIGH priority)
    const panMatch = originalQuery.match(/\b[A-Z]{5}\d{4}[A-Z]\b/gi);
    if (panMatch) {
      [...new Set(panMatch.map(p => p.toUpperCase()))].forEach(pan => {
        if (!seen.has(`id:${pan}`)) {
          seen.add(`id:${pan}`);
          entities.push({ type: 'id_number', value: pan, confidence: 0.99, searchPriority: 'HIGH' });
        }
      });
    }
    
    // Aadhaar (12 digits)
    const aadhaarMatch = originalQuery.match(/\b[2-9]\d{11}\b/g);
    if (aadhaarMatch) {
      [...new Set(aadhaarMatch)].forEach(aadhaar => {
        if (!seen.has(`id:${aadhaar}`)) {
          seen.add(`id:${aadhaar}`);
          entities.push({ type: 'id_number', value: aadhaar, confidence: 0.95, searchPriority: 'HIGH' });
        }
      });
    }
    
    // Now extract from AI reasoning (for names, locations, relationships)
    // Qwen3 format: "mentions \"subodh\" (a name)" or "- name: \"subodh\""
    
    if (isQwen3) {
      // Qwen3 specific patterns - it often quotes the values
      const qwen3Patterns = [
        // "subodh" (a name) pattern
        /"([a-zA-Z]+(?:\s+[a-zA-Z]+)?)"\s*\((?:a\s+)?name\)/gi,
        // "9748247177" is a phone pattern  
        /"(\d{10})"\s*(?:is|as)?\s*(?:a\s+)?(?:phone|mobile|number)/gi,
        // - name: "value" or name: "value"
        /(?:^|\n)\s*[-*]?\s*(?:name|person|individual)[:\s]+"?([a-zA-Z]+(?:\s+[a-zA-Z]+)?)"?/gim,
        // - location: "delhi" or location: delhi
        /(?:^|\n)\s*[-*]?\s*(?:location|city|place)[:\s]+"?([a-zA-Z]+)"?/gim,
        // Extract quoted strings that appear to be entity values
        /"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"(?:\s*->|\s*:|\s*,|\s*\.|\s*\(|\s*is)/g,
      ];
      
      for (const pattern of qwen3Patterns) {
        let match;
        while ((match = pattern.exec(aiResponse)) !== null) {
          const value = match[1].trim();
          const lowerValue = value.toLowerCase();
          
          // Skip if it's a forbidden word
          if (forbiddenWords.has(lowerValue)) continue;
          if (value.length < 3) continue;
          
          // Determine entity type based on context
          const contextStart = Math.max(0, match.index - 50);
          const contextEnd = Math.min(aiResponse.length, match.index + match[0].length + 50);
          const context = aiResponse.slice(contextStart, contextEnd).toLowerCase();
          
          let entityType = 'name';
          let searchPriority = 'LOW';
          
          if (context.includes('phone') || context.includes('mobile') || /^\d{10}$/.test(value)) {
            if (!seen.has(`phone:${value}`) && /^[6-9]\d{9}$/.test(value)) {
              seen.add(`phone:${value}`);
              entities.push({ type: 'phone', value, confidence: 0.99, searchPriority: 'HIGH' });
              continue;
            }
          } else if (context.includes('location') || context.includes('city') || context.includes('place') || commonCities.has(lowerValue)) {
            entityType = 'location';
            if (!seen.has(`location:${lowerValue}`)) {
              seen.add(`location:${lowerValue}`);
              entities.push({ type: 'location', value, confidence: 0.85, searchPriority: 'LOW' });
            }
            continue;
          } else if (commonIndianNames.has(lowerValue) || /\s/.test(value)) {
            // Likely a name (has space or is common Indian name)
            entityType = 'name';
            if (!seen.has(`name:${lowerValue}`)) {
              seen.add(`name:${lowerValue}`);
              entities.push({ type: 'name', value, confidence: 0.85, searchPriority: 'LOW' });
            }
            continue;
          }
        }
      }
    }
    
    // Extract names from original query with relationship context
    // Pattern: "X from Y" or "X lives in Y" or "X related to Y"
    const queryRelationshipPatterns = [
      // "subodh from delhi" - person + location
      { pattern: /\b([A-Z][a-z]+)\s+(?:from|of|in|at|lives?\s+in|resides?\s+in)\s+([A-Z][a-z]+)\b/gi, type: 'location' },
      // "subodh related to rahul" - person + person
      { pattern: /\b([A-Z][a-z]+)\s+(?:related|connected|associated|linked)\s+(?:to|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi, type: 'association' },
      // "relation to rahul sharma and aman verma" - multiple related persons
      { pattern: /(?:relation|connection|associated|connected)\s+(?:to|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)*)/gi, type: 'association_multi' },
    ];
    
    for (const { pattern, type } of queryRelationshipPatterns) {
      let match;
      while ((match = pattern.exec(originalQuery)) !== null) {
        if (type === 'association_multi') {
          // Handle "rahul sharma and aman verma"
          const people = match[1].split(/\s+and\s+/i);
          for (const person of people) {
            const lowerPerson = person.toLowerCase().trim();
            if (!forbiddenWords.has(lowerPerson) && !seen.has(`name:${lowerPerson}`) && lowerPerson.length > 2) {
              seen.add(`name:${lowerPerson}`);
              entities.push({ type: 'name', value: person.trim(), confidence: 0.8, searchPriority: 'LOW' });
            }
          }
        } else if (type === 'location') {
          // Person from location
          const person = match[1].toLowerCase();
          const location = match[2].toLowerCase();
          
          if (!forbiddenWords.has(person) && !seen.has(`name:${person}`)) {
            seen.add(`name:${person}`);
            entities.push({ type: 'name', value: match[1], confidence: 0.8, searchPriority: 'LOW' });
          }
          if (!forbiddenWords.has(location) && !seen.has(`location:${location}`)) {
            seen.add(`location:${location}`);
            entities.push({ type: 'location', value: match[2], confidence: 0.85, searchPriority: 'LOW' });
          }
          
          relationships.push({
            from: match[1],
            to: match[2],
            type: 'location',
            evidence: match[0]
          });
        } else if (type === 'association') {
          // Person related to person
          const person1 = match[1].toLowerCase();
          const person2 = match[2].toLowerCase();
          
          if (!forbiddenWords.has(person1) && !seen.has(`name:${person1}`)) {
            seen.add(`name:${person1}`);
            entities.push({ type: 'name', value: match[1], confidence: 0.8, searchPriority: 'LOW' });
          }
          if (!forbiddenWords.has(person2) && !seen.has(`name:${person2}`)) {
            seen.add(`name:${person2}`);
            entities.push({ type: 'name', value: match[2], confidence: 0.8, searchPriority: 'LOW' });
          }
          
          relationships.push({
            from: match[1],
            to: match[2],
            type: 'association',
            evidence: match[0]
          });
        }
      }
    }
    
    // Fallback: Extract capitalized names that weren't caught
    const capitalizedNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let capMatch;
    while ((capMatch = capitalizedNamePattern.exec(originalQuery)) !== null) {
      const name = capMatch[1].toLowerCase();
      const firstName = name.split(/\s+/)[0];
      
      if (!forbiddenWords.has(firstName) && 
          (commonIndianNames.has(firstName) || commonIndianNames.has(name)) && 
          !seen.has(`name:${name}`)) {
        seen.add(`name:${name}`);
        entities.push({ type: 'name', value: capMatch[1], confidence: 0.85, searchPriority: 'LOW' });
      }
    }
    
    // Extract single names that are common Indian names
    const simpleNamePattern = /\b([A-Z][a-z]+)\b/g;
    while ((capMatch = simpleNamePattern.exec(originalQuery)) !== null) {
      const name = capMatch[1].toLowerCase();
      if (commonIndianNames.has(name) && !seen.has(`name:${name}`) && !forbiddenWords.has(name)) {
        seen.add(`name:${name}`);
        entities.push({ type: 'name', value: capMatch[1], confidence: 0.9, searchPriority: 'LOW' });
      }
    }
    
    // Build search strategy
    const primarySearchTerms = entities
      .filter(e => e.searchPriority === 'HIGH')
      .map(e => e.value);
    const filterTerms = entities
      .filter(e => e.searchPriority === 'LOW')
      .map(e => e.value);
    
    let intent = 'General search';
    if (primarySearchTerms.length > 0) {
      const highTypes = [...new Set(entities.filter(e => e.searchPriority === 'HIGH').map(e => e.type))];
      intent = `Find by ${highTypes.join(', ')}${filterTerms.length > 0 ? ' with filters' : ''}`;
    } else if (relationships.length > 0) {
      const relTypes = [...new Set(relationships.map(r => r.type))];
      if (relTypes.includes('association')) {
        intent = 'Find person with relationship to others';
      } else if (relTypes.includes('location')) {
        intent = 'Find person by name and location';
      }
    } else if (filterTerms.length > 0) {
      intent = `Find person by ${filterTerms.slice(0, 2).join(' and ')}`;
    }
    
    logger.info('Parsed reasoning text', { 
      entityCount: entities.length, 
      relationshipCount: relationships.length,
      primaryTerms: primarySearchTerms,
      filterTerms,
      intent,
      isQwen3
    });
    
    return {
      entities,
      relationships,
      summary: `Extracted ${entities.length} entities and ${relationships.length} relationships`,
      searchRecommendations: primarySearchTerms.length > 0 ? primarySearchTerms : filterTerms.slice(0, 3),
      searchStrategy: {
        primarySearchTerms,
        filterTerms,
        intent
      }
    };
  }

  /**
   * Fallback: Extract entities from raw AI response text
   */
  private extractEntitiesFromText(aiResponse: string, originalQuery: string): EntityAnalysisResult {
    const entities: Array<{type: string; value: string; confidence: number; searchPriority: string}> = [];
    const combined = `${originalQuery} ${aiResponse}`;
    
    // Extract phone numbers
    const phoneMatch = combined.match(/[6-9]\d{9}/g);
    if (phoneMatch) {
      const uniquePhones = [...new Set(phoneMatch)];
      uniquePhones.forEach(phone => {
        entities.push({ type: 'phone', value: phone, confidence: 0.95, searchPriority: 'HIGH' });
      });
    }
    
    // Extract emails
    const emailMatch = combined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi);
    if (emailMatch) {
      const uniqueEmails = [...new Set(emailMatch.map(e => e.toLowerCase()))];
      uniqueEmails.forEach(email => {
        entities.push({ type: 'email', value: email, confidence: 0.95, searchPriority: 'HIGH' });
      });
    }
    
    // Extract potential names (capitalized words)
    const nameMatch = combined.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g);
    if (nameMatch) {
      const commonWords = new Set(['The', 'This', 'That', 'These', 'Those', 'What', 'When', 'Where', 'Which', 'User', 'Query', 'Found', 'Phone', 'Email']);
      const uniqueNames = [...new Set(nameMatch)].filter(n => !commonWords.has(n.split(' ')[0]));
      uniqueNames.slice(0, 3).forEach(name => {
        entities.push({ type: 'name', value: name, confidence: 0.6, searchPriority: 'LOW' });
      });
    }
    
    if (entities.length > 0) {
      logger.info('Extracted entities from raw text', { count: entities.length, types: entities.map(e => e.type) });
      
      const primarySearchTerms = entities.filter(e => e.searchPriority === 'HIGH').map(e => e.value);
      const filterTerms = entities.filter(e => e.searchPriority === 'LOW').map(e => e.value);
      
      return {
        entities,
        relationships: [],
        summary: `Found ${entities.length} entities`,
        searchRecommendations: primarySearchTerms.length > 0 ? primarySearchTerms : filterTerms.slice(0, 3),
        searchStrategy: {
          primarySearchTerms,
          filterTerms,
          intent: primarySearchTerms.length > 0 ? 'Find by unique identifier' : 'Find by name/location'
        }
      };
    }
    
    return {
      entities: [],
      relationships: [],
      summary: 'No entities found',
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