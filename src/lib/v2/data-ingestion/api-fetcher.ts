/**
 * API Fetcher V2
 * Multi-source data ingestion with caching and rate limiting
 * Implements 2026 research on data pipeline architecture
 */

import { v4 as uuidv4 } from 'uuid';
import { Entity, Relationship } from './types';
import { HybridEntityExtractor } from './hybrid-entity-extractor';
import { RelationshipInferrer } from './knowledge-graph';

// ============================================================================
// TYPES
// ============================================================================

export interface APIConfig {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  rateLimit?: {
    requestsPerMinute: number;
    concurrent: number;
  };
  cache?: {
    enabled: boolean;
    ttlSeconds: number;
  };
}

export interface FetchResult {
  id: string;
  source: string;
  endpoint: string;
  status: 'success' | 'error' | 'cached';
  data: Record<string, unknown> | Record<string, unknown>[];
  entities: Entity[];
  relationships: Relationship[];
  metadata: {
    fetchTime: number;
    cached: boolean;
    recordCount: number;
    entityCount: number;
    relationshipCount: number;
  };
  timestamp: Date;
  error?: string;
}

export interface FetchOptions {
  extractEntities?: boolean;
  inferRelationships?: boolean;
  cacheKey?: string;
  transform?: (data: unknown) => Record<string, unknown>[];
}

// ============================================================================
// CACHE IMPLEMENTATION
// ============================================================================

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

class DataCache {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTTL: number;

  constructor(defaultTTLSeconds: number = 3600) {
    this.defaultTTL = defaultTTLSeconds * 1000;
  }

  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: unknown, ttlSeconds?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: (ttlSeconds || this.defaultTTL / 1000) * 1000,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;
  private maxConcurrent: number;
  private currentConcurrent: number = 0;

  constructor(requestsPerMinute: number = 60, maxConcurrent: number = 5) {
    this.maxRequests = requestsPerMinute;
    this.windowMs = 60000;
    this.maxConcurrent = maxConcurrent;
  }

  async acquire(): Promise<void> {
    // Wait for concurrent slot
    while (this.currentConcurrent >= this.maxConcurrent) {
      await this.sleep(100);
    }

    // Clean old requests
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    // Wait if rate limit reached
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100;
      await this.sleep(waitTime);
    }

    this.requests.push(now);
    this.currentConcurrent++;
  }

  release(): void {
    this.currentConcurrent = Math.max(0, this.currentConcurrent - 1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// API FETCHER CLASS
// ============================================================================

export class APIFetcher {
  private config: APIConfig;
  private cache: DataCache;
  private rateLimiter: RateLimiter;
  private entityExtractor: HybridEntityExtractor;
  private relationshipInferrer: RelationshipInferrer;

  constructor(config: APIConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      rateLimit: { requestsPerMinute: 60, concurrent: 5 },
      cache: { enabled: true, ttlSeconds: 3600 },
      ...config,
    };

    this.cache = new DataCache(this.config.cache?.ttlSeconds);
    this.rateLimiter = new RateLimiter(
      this.config.rateLimit?.requestsPerMinute,
      this.config.rateLimit?.concurrent
    );
    this.entityExtractor = new HybridEntityExtractor();
    this.relationshipInferrer = new RelationshipInferrer();
  }

  /**
   * Fetch data from API endpoint
   */
  async fetch(
    endpoint: string,
    options: FetchOptions = {}
  ): Promise<FetchResult> {
    const startTime = Date.now();
    const cacheKey = options.cacheKey || this.generateCacheKey(endpoint, options);

    // Check cache
    if (this.config.cache?.enabled && this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey) as Record<string, unknown>[];
      return this.processResult(
        endpoint,
        cachedData,
        { ...options, cached: true },
        startTime
      );
    }

    // Rate limit
    await this.rateLimiter.acquire();

    try {
      // Build URL
      const url = this.buildUrl(endpoint);

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.config.headers,
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      // Fetch with retries
      const data = await this.fetchWithRetries(url, headers);

      // Cache result
      if (this.config.cache?.enabled) {
        this.cache.set(cacheKey, data);
      }

      // Process result
      return this.processResult(endpoint, data, options, startTime);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        id: uuidv4(),
        source: this.config.baseUrl,
        endpoint,
        status: 'error',
        data: {},
        entities: [],
        relationships: [],
        metadata: {
          fetchTime: Date.now() - startTime,
          cached: false,
          recordCount: 0,
          entityCount: 0,
          relationshipCount: 0,
        },
        timestamp: new Date(),
        error: errorMessage,
      };
    } finally {
      this.rateLimiter.release();
    }
  }

  /**
   * Fetch multiple endpoints in parallel
   */
  async fetchAll(
    endpoints: string[],
    options: FetchOptions = {}
  ): Promise<FetchResult[]> {
    return Promise.all(endpoints.map(endpoint => this.fetch(endpoint, options)));
  }

  /**
   * Fetch with pagination
   */
  async *fetchPaginated(
    endpoint: string,
    options: FetchOptions & {
      pageSize?: number;
      maxPages?: number;
      pageParam?: string;
      dataPath?: string;
    } = {}
  ): AsyncGenerator<FetchResult> {
    const { pageSize = 100, maxPages = 10, pageParam = 'page', dataPath = 'data' } = options;
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      const paginatedEndpoint = `${endpoint}?${pageParam}=${page}&limit=${pageSize}`;
      const result = await this.fetch(paginatedEndpoint, options);

      yield result;

      // Check if more pages
      const data = result.data as Record<string, unknown>;
      const items = this.getNestedValue(data, dataPath) as unknown[];
      hasMore = items && items.length === pageSize;
      page++;
    }
  }

  /**
   * Process fetch result - extract entities and relationships
   */
  private async processResult(
    endpoint: string,
    data: Record<string, unknown> | Record<string, unknown>[],
    options: FetchOptions & { cached?: boolean },
    startTime: number
  ): Promise<FetchResult> {
    const records = Array.isArray(data) ? data : [data];
    let entities: Entity[] = [];
    let relationships: Relationship[] = [];

    // Apply transform if provided
    const transformedRecords = options.transform ? records.flatMap(r => options.transform!(r)) : records;

    // Extract entities
    if (options.extractEntities !== false) {
      for (const record of transformedRecords) {
        const text = JSON.stringify(record);
        const recordEntities = await this.entityExtractor.extract(text);
        entities.push(...recordEntities);

        // Infer relationships
        if (options.inferRelationships !== false) {
          const recordRelationships = this.relationshipInferrer.inferFromText(text, recordEntities);
          relationships.push(...recordRelationships);
        }
      }
    }

    return {
      id: uuidv4(),
      source: this.config.baseUrl,
      endpoint,
      status: options.cached ? 'cached' : 'success',
      data: transformedRecords,
      entities,
      relationships,
      metadata: {
        fetchTime: Date.now() - startTime,
        cached: options.cached || false,
        recordCount: transformedRecords.length,
        entityCount: entities.length,
        relationshipCount: relationships.length,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Fetch with retries
   */
  private async fetchWithRetries(
    url: string,
    headers: Record<string, string>,
    retryCount: number = 0
  ): Promise<Record<string, unknown>[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [data];
    } catch (error: unknown) {
      if (retryCount < (this.config.retries || 3)) {
        // Exponential backoff
        await this.sleep(Math.pow(2, retryCount) * 1000);
        return this.fetchWithRetries(url, headers, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Build full URL
   */
  private buildUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const cleanEndpoint = endpoint.replace(/^\//, '');
    return `${baseUrl}/${cleanEndpoint}`;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(endpoint: string, options: FetchOptions): string {
    const key = `${this.config.baseUrl}:${endpoint}:${JSON.stringify(options)}`;
    return Buffer.from(key).toString('base64').substring(0, 32);
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.cache.size(),
      enabled: this.config.cache?.enabled || false,
    };
  }
}

// ============================================================================
// PRECONFIGURED FETCHERS
// ============================================================================

/**
 * Create fetcher for banking APIs
 */
export function createBankingAPIFetcher(apiKey: string): APIFetcher {
  return new APIFetcher({
    baseUrl: 'https://api.banking.example.com',
    apiKey,
    headers: {
      'X-API-Version': '2.0',
    },
    rateLimit: {
      requestsPerMinute: 30,
      concurrent: 3,
    },
    cache: {
      enabled: true,
      ttlSeconds: 300, // 5 minutes for banking data
    },
  });
}

/**
 * Create fetcher for telecom APIs
 */
export function createTelecomAPIFetcher(apiKey: string): APIFetcher {
  return new APIFetcher({
    baseUrl: 'https://api.telecom.example.com',
    apiKey,
    rateLimit: {
      requestsPerMinute: 60,
      concurrent: 5,
    },
    cache: {
      enabled: true,
      ttlSeconds: 3600, // 1 hour
    },
  });
}

/**
 * Create fetcher for government ID APIs
 */
export function createGovernmentAPIFetcher(apiKey: string): APIFetcher {
  return new APIFetcher({
    baseUrl: 'https://api.gov.example.com',
    apiKey,
    headers: {
      'X-Request-Source': 'investigation-platform',
    },
    rateLimit: {
      requestsPerMinute: 10, // Conservative for government APIs
      concurrent: 2,
    },
    cache: {
      enabled: true,
      ttlSeconds: 86400, // 24 hours
    },
  });
}

// ============================================================================
// WEB SCRAPER (for OSINT)
// ============================================================================

export class WebScraper {
  private cache: DataCache;
  private rateLimiter: RateLimiter;
  private entityExtractor: HybridEntityExtractor;

  constructor() {
    this.cache = new DataCache(3600);
    this.rateLimiter = new RateLimiter(30, 3);
    this.entityExtractor = new HybridEntityExtractor();
  }

  /**
   * Scrape a web page
   */
  async scrape(url: string, options: { extractEntities?: boolean } = {}): Promise<FetchResult> {
    const startTime = Date.now();

    // Check cache
    if (this.cache.has(url)) {
      const cached = this.cache.get(url) as FetchResult;
      return { ...cached, status: 'cached' };
    }

    await this.rateLimiter.acquire();

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; InvestigationBot/2.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const text = this.extractTextFromHtml(html);

      let entities: Entity[] = [];
      if (options.extractEntities !== false) {
        entities = await this.entityExtractor.extract(text);
      }

      const result: FetchResult = {
        id: uuidv4(),
        source: url,
        endpoint: '/',
        status: 'success',
        data: { text, html: html.substring(0, 10000) }, // Limit stored HTML
        entities,
        relationships: [],
        metadata: {
          fetchTime: Date.now() - startTime,
          cached: false,
          recordCount: 1,
          entityCount: entities.length,
          relationshipCount: 0,
        },
        timestamp: new Date(),
      };

      this.cache.set(url, result);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        id: uuidv4(),
        source: url,
        endpoint: '/',
        status: 'error',
        data: {},
        entities: [],
        relationships: [],
        metadata: {
          fetchTime: Date.now() - startTime,
          cached: false,
          recordCount: 0,
          entityCount: 0,
          relationshipCount: 0,
        },
        timestamp: new Date(),
        error: errorMessage,
      };
    } finally {
      this.rateLimiter.release();
    }
  }

  /**
   * Extract text content from HTML
   */
  private extractTextFromHtml(html: string): string {
    // Remove scripts, styles, and comments
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }
}

// Export instances
export const webScraper = new WebScraper();
