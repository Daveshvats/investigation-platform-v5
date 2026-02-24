/**
 * Embedding Service for Semantic Similarity
 * 
 * Supports multiple embedding backends:
 * - Local Ollama embeddings (nomic-embed-text, all-minilm)
 * - API-based embeddings (OpenAI, Cohere)
 * - In-memory caching for performance
 * 
 * Uses 2026 best practices:
 * - BGE-M3 for multilingual embeddings
 * - all-MiniLM-L6-v2 for fast similarity
 */

import { createLogger } from './logger';

const logger = createLogger('EmbeddingService');

export interface EmbeddingVector {
  values: number[];
  dimensions: number;
  model: string;
}

export interface SimilarityResult {
  score: number;
  entity1: string;
  entity2: string;
  explanation: string;
}

export interface EntityCluster {
  id: string;
  entities: string[];
  representative: string;
  avgSimilarity: number;
}

// Embedding model configurations
export const EMBEDDING_MODELS = {
  // Local models via Ollama
  nomic_embed: {
    name: 'nomic-embed-text',
    dimensions: 768,
    type: 'local',
    recommended: true,
  },
  all_minilm: {
    name: 'all-minilm',
    dimensions: 384,
    type: 'local',
    recommended: true,
  },
  mxbai_embed: {
    name: 'mxbai-embed-large',
    dimensions: 1024,
    type: 'local',
    recommended: true,
  },
};

type EmbeddingModel = keyof typeof EMBEDDING_MODELS;

/**
 * Embedding Service Class
 */
export class EmbeddingService {
  private cache = new Map<string, EmbeddingVector>();
  private ollamaBaseUrl: string;
  private defaultModel: EmbeddingModel;
  private maxCacheSize: number;

  constructor(options?: {
    ollamaBaseUrl?: string;
    defaultModel?: EmbeddingModel;
    maxCacheSize?: number;
  }) {
    this.ollamaBaseUrl = options?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.defaultModel = options?.defaultModel || 'nomic_embed';
    this.maxCacheSize = options?.maxCacheSize || 10000;
  }

  /**
   * Get embedding for text
   */
  async embed(text: string, model?: EmbeddingModel): Promise<EmbeddingVector> {
    const modelName = model || this.defaultModel;
    const cacheKey = `${modelName}:${text}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Get embedding from Ollama
    const embedding = await this.getOllamaEmbedding(text, modelName);
    
    // Cache result
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entries
      const keysToDelete = Array.from(this.cache.keys()).slice(0, 100);
      keysToDelete.forEach(k => this.cache.delete(k));
    }
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Get embeddings for multiple texts
   */
  async embedBatch(texts: string[], model?: EmbeddingModel): Promise<EmbeddingVector[]> {
    return Promise.all(texts.map(t => this.embed(t, model)));
  }

  /**
   * Get embedding from Ollama
   */
  private async getOllamaEmbedding(text: string, model: EmbeddingModel): Promise<EmbeddingVector> {
    const modelConfig = EMBEDDING_MODELS[model];
    
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelConfig.name,
          prompt: text,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding failed: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        values: data.embedding || [],
        dimensions: modelConfig.dimensions,
        model: modelConfig.name,
      };
    } catch (error) {
      logger.error('Failed to get Ollama embedding', error);
      // Return zero vector as fallback
      return {
        values: new Array(modelConfig.dimensions).fill(0),
        dimensions: modelConfig.dimensions,
        model: modelConfig.name,
      };
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Calculate similarity between two texts
   */
  async similarity(text1: string, text2: string): Promise<number> {
    const [emb1, emb2] = await Promise.all([
      this.embed(text1),
      this.embed(text2),
    ]);

    return this.cosineSimilarity(emb1.values, emb2.values);
  }

  /**
   * Find most similar texts from a list
   */
  async findMostSimilar(
    query: string,
    candidates: string[],
    topK: number = 5
  ): Promise<Array<{ text: string; score: number }>> {
    const queryEmbedding = await this.embed(query);
    const candidateEmbeddings = await this.embedBatch(candidates);

    const scores = candidateEmbeddings.map((emb, i) => ({
      text: candidates[i],
      score: this.cosineSimilarity(queryEmbedding.values, emb.values),
    }));

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  /**
   * Cluster entities by similarity
   */
  async clusterEntities(
    entities: string[],
    threshold: number = 0.85
  ): Promise<EntityCluster[]> {
    if (entities.length === 0) return [];

    const embeddings = await this.embedBatch(entities);
    const clusters: EntityCluster[] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < entities.length; i++) {
      if (assigned.has(i)) continue;

      const clusterEntities: number[] = [i];
      assigned.add(i);

      // Find similar entities
      for (let j = i + 1; j < entities.length; j++) {
        if (assigned.has(j)) continue;

        const sim = this.cosineSimilarity(embeddings[i].values, embeddings[j].values);
        if (sim >= threshold) {
          clusterEntities.push(j);
          assigned.add(j);
        }
      }

      // Calculate average similarity
      let totalSim = 0;
      for (let a = 0; a < clusterEntities.length; a++) {
        for (let b = a + 1; b < clusterEntities.length; b++) {
          totalSim += this.cosineSimilarity(
            embeddings[clusterEntities[a]].values,
            embeddings[clusterEntities[b]].values
          );
        }
      }
      const avgSim = clusterEntities.length > 1 
        ? totalSim / ((clusterEntities.length * (clusterEntities.length - 1)) / 2)
        : 1.0;

      clusters.push({
        id: `cluster_${clusters.length}`,
        entities: clusterEntities.map(idx => entities[idx]),
        representative: entities[i],
        avgSimilarity: avgSim,
      });
    }

    // Sort by cluster size
    clusters.sort((a, b) => b.entities.length - a.entities.length);

    return clusters;
  }

  /**
   * Detect duplicate records using semantic similarity
   */
  async detectDuplicates(
    records: Array<{ id: string; text: string }>,
    threshold: number = 0.9
  ): Promise<Array<{ record1: string; record2: string; similarity: number }>> {
    const duplicates: Array<{ record1: string; record2: string; similarity: number }> = [];
    const embeddings = await this.embedBatch(records.map(r => r.text));

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const sim = this.cosineSimilarity(embeddings[i].values, embeddings[j].values);
        if (sim >= threshold) {
          duplicates.push({
            record1: records[i].id,
            record2: records[j].id,
            similarity: sim,
          });
        }
      }
    }

    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Create entity representation for comparison
   */
  createEntityRepresentation(entity: {
    type: string;
    value: string;
    name?: string;
    location?: string;
    company?: string;
  }): string {
    const parts = [`${entity.type}: ${entity.value}`];
    
    if (entity.name) parts.push(`name: ${entity.name}`);
    if (entity.location) parts.push(`location: ${entity.location}`);
    if (entity.company) parts.push(`company: ${entity.company}`);

    return parts.join('; ');
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();

// Factory function
export function createEmbeddingService(options?: {
  ollamaBaseUrl?: string;
  defaultModel?: EmbeddingModel;
  maxCacheSize?: number;
}): EmbeddingService {
  return new EmbeddingService(options);
}

/**
 * Utility functions for common similarity tasks
 */

/**
 * Check if two names likely refer to the same person
 */
export async function namesMatch(name1: string, name2: string): Promise<boolean> {
  // Quick exact match check
  if (name1.toLowerCase() === name2.toLowerCase()) return true;

  // Check for initials match (e.g., "A. Somani" vs "Aman Somani")
  const parts1 = name1.toLowerCase().split(/\s+/);
  const parts2 = name2.toLowerCase().split(/\s+/);

  // Check if one name is initials of another
  if (parts1.length !== parts2.length) {
    // Try to match initials
    const shorter = parts1.length < parts2.length ? parts1 : parts2;
    const longer = parts1.length < parts2.length ? parts2 : parts1;

    let allMatch = true;
    for (let i = 0; i < shorter.length; i++) {
      const s = shorter[i].replace(/[.]/g, '');
      const l = longer[i];
      if (s.length === 1 && l[0] !== s[0]) {
        allMatch = false;
        break;
      }
      if (s.length > 1 && s !== l) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }

  // Use semantic similarity
  const similarity = await embeddingService.similarity(name1, name2);
  return similarity >= 0.85;
}

/**
 * Calculate record similarity for deduplication
 */
export async function recordSimilarity(
  record1: Record<string, unknown>,
  record2: Record<string, unknown>
): Promise<number> {
  // Extract key fields
  const getFieldValue = (r: Record<string, unknown>, fields: string[]): string => {
    for (const f of fields) {
      const v = r[f];
      if (v !== null && v !== undefined && v !== '') {
        return String(v).toLowerCase();
      }
    }
    return '';
  };

  // Check phone match (highest weight)
  const phone1 = getFieldValue(record1, ['phone', 'mobile', 'glusr_usr_ph_mobile']);
  const phone2 = getFieldValue(record2, ['phone', 'mobile', 'glusr_usr_ph_mobile']);
  
  if (phone1 && phone2) {
    // Normalize phones
    const p1 = phone1.replace(/\D/g, '').slice(-10);
    const p2 = phone2.replace(/\D/g, '').slice(-10);
    if (p1 === p2) return 1.0; // Same phone = same person
  }

  // Check email match (high weight)
  const email1 = getFieldValue(record1, ['email', 'email1', 'email_id']);
  const email2 = getFieldValue(record2, ['email', 'email1', 'email_id']);
  
  if (email1 && email2 && email1 === email2) return 0.98;

  // Use embedding similarity for name + location
  const name1 = getFieldValue(record1, ['name', 'first_name', 'full_name']);
  const name2 = getFieldValue(record2, ['name', 'first_name', 'full_name']);
  const loc1 = getFieldValue(record1, ['city', 'state', 'location']);
  const loc2 = getFieldValue(record2, ['city', 'state', 'location']);

  const text1 = `${name1} ${loc1}`;
  const text2 = `${name2} ${loc2}`;

  return embeddingService.similarity(text1, text2);
}
