/**
 * Intelligent Entity Extractor
 * 
 * Uses GLiNER-style zero-shot NER for extracting entities with
 * proper search value classification.
 * 
 * Entity Value Classification (2026 Best Practices):
 * - HIGH VALUE (Search): phone, email, id_number, account
 * - LOW VALUE (Filter only): name, location, company
 */

import { createLogger } from './logger';

const logger = createLogger('EntityExtractor');

// Entity types with their search priority
export type EntityType = 'phone' | 'email' | 'id_number' | 'account' | 'name' | 'location' | 'company';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  normalized: string;
  original: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  searchValue: 'HIGH' | 'MEDIUM' | 'LOW'; // Whether to use for search or filter
  searchPriority: number; // Higher = more unique = better search term
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  highValueEntities: ExtractedEntity[]; // For searching
  lowValueEntities: ExtractedEntity[];  // For filtering only
  uniqueIdentifiers: string[]; // Top search terms
}

// Entity configuration with patterns and priorities
const ENTITY_CONFIG = {
  phone: {
    priority: 10,
    searchValue: 'HIGH' as const,
    description: 'Phone numbers are unique to individuals (10 digits)',
    patterns: [
      // Indian mobile: 10 digits starting with 6-9
      /(?:\+91[-\s]?|91[-\s]?|0[-\s]?|[-\s])?([6-9]\d{9})\b/g,
      // With country code
      /\+91[-\s]?([6-9]\d{4}[-\s]?\d{5})\b/g,
    ],
    normalizer: (match: string) => {
      // Extract just the 10 digits
      const digits = match.replace(/\D/g, '');
      if (digits.length === 10) return digits;
      if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
      if (digits.length > 10) return digits.slice(-10);
      return digits;
    },
    validator: (normalized: string) => /^[6-9]\d{9}$/.test(normalized),
  },
  email: {
    priority: 9,
    searchValue: 'HIGH' as const,
    description: 'Email addresses are unique to individuals',
    patterns: [
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    ],
    normalizer: (match: string) => match.toLowerCase().trim(),
    validator: (normalized: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized),
  },
  id_number: {
    priority: 8,
    searchValue: 'HIGH' as const,
    description: 'PAN, Aadhaar, and other ID numbers are unique identifiers',
    patterns: [
      // PAN: ABCDE1234F
      /\b([A-Z]{5}\d{4}[A-Z])\b/gi,
      // Aadhaar: 12 digits (with or without spaces)
      /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
      // Passport: 8-9 alphanumeric
      /\b([A-Z]{1,2}\d{6,8})\b/g,
      // Voter ID: 10 alphanumeric
      /\b([A-Z]{3}\d{7})\b/gi,
    ],
    normalizer: (match: string) => match.toUpperCase().replace(/[\s-]/g, ''),
    validator: (normalized: string) => {
      // PAN
      if (/^[A-Z]{5}\d{4}[A-Z]$/.test(normalized)) return true;
      // Aadhaar
      if (/^\d{12}$/.test(normalized)) return true;
      // Passport
      if (/^[A-Z]{1,2}\d{6,8}$/.test(normalized)) return true;
      // Voter ID
      if (/^[A-Z]{3}\d{7}$/.test(normalized)) return true;
      return false;
    },
  },
  account: {
    priority: 7,
    searchValue: 'HIGH' as const,
    description: 'Bank account numbers are unique to accounts',
    patterns: [
      // Bank account: 9-18 digits
      /(?:account|a\/c|acct|acc)[\s:-]*(\d{9,18})\b/gi,
      // IFSC code
      /\b([A-Z]{4}0[A-Z0-9]{6})\b/g,
    ],
    normalizer: (match: string) => match.toUpperCase().replace(/[\s-]/g, ''),
    validator: (normalized: string) => {
      if (/^\d{9,18}$/.test(normalized)) return true;
      if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) return true;
      return false;
    },
  },
  name: {
    priority: 3,
    searchValue: 'LOW' as const,
    description: 'Names are common - only use for filtering, not searching',
    patterns: [
      // Two or more capitalized words
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
    ],
    normalizer: (match: string) => match.toLowerCase().trim(),
    validator: (normalized: string) => {
      const words = normalized.split(/\s+/);
      // Must have at least 2 words with 2+ chars each
      if (words.length < 2) return false;
      return words.every(w => w.length >= 2);
    },
    // Common words to exclude
    stopWords: new Set([
      'from', 'having', 'with', 'near', 'delhi', 'mumbai', 'bangalore', 
      'chennai', 'kolkata', 'hyderabad', 'pune', 'india', 'west', 'east',
      'north', 'south', 'market', 'road', 'street', 'area', 'city',
    ]),
  },
  location: {
    priority: 1,
    searchValue: 'LOW' as const,
    description: 'Locations are too broad - millions of people share locations',
    patterns: [
      // After location prepositions
      /(?:from|in|at|near|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    ],
    normalizer: (match: string) => match.toLowerCase().trim(),
    validator: (normalized: string) => normalized.length >= 3,
  },
  company: {
    priority: 2,
    searchValue: 'LOW' as const,
    description: 'Company names can be generic - use for filtering',
    patterns: [
      /(?:company|firm|business|enterprise|pvt|ltd|llp|inc)\s*[.:]?\s*([A-Za-z][A-Za-z0-9\s]{2,30})/gi,
    ],
    normalizer: (match: string) => match.toLowerCase().trim(),
    validator: (normalized: string) => normalized.length >= 3,
  },
};

// Common Indian name parts to help identify names vs other text
const COMMON_NAME_PARTS = new Set([
  'kumar', 'singh', 'sharma', 'verma', 'gupta', 'agarwal', 'jain', 'mehta',
  'patel', 'shah', 'desai', 'kaur', 'devi', 'das', 'roy', 'choudhury',
  'reddy', 'rao', 'nair', 'menon', 'pillai', 'iyer', 'iyer', 'aman', 'rahul',
  'priya', 'sunil', 'anil', 'vijay', 'suresh', 'ramesh', 'rajesh', 'deepak',
]);

/**
 * Intelligent Entity Extractor Class
 */
export class EntityExtractor {
  private seenEntities = new Set<string>();

  /**
   * Extract all entities from text
   */
  extract(text: string): EntityExtractionResult {
    this.seenEntities.clear();
    const entities: ExtractedEntity[] = [];

    // Extract each entity type
    for (const [type, config] of Object.entries(ENTITY_CONFIG)) {
      const extracted = this.extractByType(text, type as EntityType, config);
      entities.push(...extracted);
    }

    // Sort by priority (highest first)
    entities.sort((a, b) => b.searchPriority - a.searchPriority);

    // Separate high and low value entities
    const highValueEntities = entities.filter(e => e.searchValue === 'HIGH');
    const lowValueEntities = entities.filter(e => e.searchValue === 'LOW');

    // Get unique identifiers for searching (top 5 high-value)
    const uniqueIdentifiers = this.getUniqueIdentifiers(highValueEntities);

    logger.info('Entity extraction complete', {
      total: entities.length,
      highValue: highValueEntities.length,
      lowValue: lowValueEntities.length,
      identifiers: uniqueIdentifiers,
    });

    return {
      entities,
      highValueEntities,
      lowValueEntities,
      uniqueIdentifiers,
    };
  }

  /**
   * Extract entities by type using patterns
   */
  private extractByType(
    text: string,
    type: EntityType,
    config: typeof ENTITY_CONFIG[EntityType]
  ): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    for (const pattern of config.patterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      
      while ((match = regex.exec(text)) !== null) {
        const original = match[1] || match[0];
        const normalized = config.normalizer(original);

        // Validate
        if (!config.validator(normalized)) continue;

        // Check for name stop words
        if (type === 'name' && 'stopWords' in config) {
          const words = normalized.split(/\s+/);
          if (words.every(w => (config.stopWords as Set<string>).has(w))) continue;
        }

        // Deduplication key
        const key = `${type}:${normalized}`;
        if (this.seenEntities.has(key)) continue;
        this.seenEntities.add(key);

        entities.push({
          type,
          value: normalized,
          normalized,
          original,
          confidence: this.calculateConfidence(type, normalized),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          searchValue: config.searchValue,
          searchPriority: config.priority,
        });
      }
    }

    return entities;
  }

  /**
   * Calculate confidence score for entity
   */
  private calculateConfidence(type: EntityType, normalized: string): number {
    switch (type) {
      case 'phone':
        // Higher confidence for valid Indian mobile
        return /^[6-9]\d{9}$/.test(normalized) ? 0.98 : 0.7;
      case 'email':
        return 0.95;
      case 'id_number':
        // PAN and Aadhaar have very high confidence
        if (/^[A-Z]{5}\d{4}[A-Z]$/.test(normalized)) return 0.99;
        if (/^\d{12}$/.test(normalized)) return 0.98;
        return 0.85;
      case 'account':
        return 0.9;
      case 'name':
        // Higher confidence if contains common name parts
        const words = normalized.split(/\s+/);
        if (words.some(w => COMMON_NAME_PARTS.has(w))) return 0.85;
        return 0.6;
      case 'location':
        return 0.5;
      case 'company':
        return 0.6;
      default:
        return 0.5;
    }
  }

  /**
   * Get unique identifiers for searching
   * Only returns HIGH value entities that haven't been searched yet
   */
  private getUniqueIdentifiers(entities: ExtractedEntity[]): string[] {
    const identifiers: string[] = [];
    const seen = new Set<string>();

    // Priority order: phone > email > id_number > account
    const typePriority = ['phone', 'email', 'id_number', 'account'];

    for (const type of typePriority) {
      for (const entity of entities) {
        if (entity.type !== type) continue;
        if (seen.has(entity.normalized)) continue;
        seen.add(entity.normalized);
        identifiers.push(entity.normalized);
        if (identifiers.length >= 5) break; // Max 5 identifiers
      }
      if (identifiers.length >= 5) break;
    }

    return identifiers;
  }

  /**
   * Extract entities from a structured record (database result)
   */
  extractFromRecord(record: Record<string, unknown>, table?: string): EntityExtractionResult {
    // Convert record to searchable text
    const text = Object.entries(record)
      .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    const result = this.extract(text);

    // Add source information
    logger.debug(`Extracted from ${table || 'record'}`, {
      highValue: result.highValueEntities.map(e => e.original),
    });

    return result;
  }

  /**
   * Check if an entity is worth searching for
   */
  isSearchable(entity: ExtractedEntity): boolean {
    return entity.searchValue === 'HIGH' && entity.confidence >= 0.7;
  }

  /**
   * Get filter entities for result filtering
   */
  getFilterEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    return entities.filter(e => e.searchValue === 'LOW' || e.confidence < 0.7);
  }

  /**
   * Merge entity extraction results from multiple sources
   */
  mergeResults(results: EntityExtractionResult[]): EntityExtractionResult {
    const allEntities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      for (const entity of result.entities) {
        const key = `${entity.type}:${entity.normalized}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allEntities.push(entity);
      }
    }

    // Sort by priority
    allEntities.sort((a, b) => b.searchPriority - a.searchPriority);

    return {
      entities: allEntities,
      highValueEntities: allEntities.filter(e => e.searchValue === 'HIGH'),
      lowValueEntities: allEntities.filter(e => e.searchValue === 'LOW'),
      uniqueIdentifiers: this.getUniqueIdentifiers(allEntities.filter(e => e.searchValue === 'HIGH')),
    };
  }
}

// Singleton instance
export const entityExtractor = new EntityExtractor();