/**
 * Intelligent Entity Extractor
 * 
 * Uses Local AI (Ollama) for intelligent entity extraction with
 * regex patterns as fallback when AI is not available.
 * 
 * Entity Value Classification:
 * - HIGH VALUE (Search First): phone, email, id_number, account
 * - MEDIUM VALUE (Search After High): specific_address (addresses with numbers, long addresses)
 * - LOW VALUE (Filter Only): name, location, generic_address
 */

import { createLogger } from './logger';
import { ollamaClient } from './ollama-client';

const logger = createLogger('EntityExtractor');

// Entity types with their search priority
export type EntityType = 'phone' | 'email' | 'id_number' | 'account' | 'name' | 'location' | 'company' | 'address';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  normalized: string;
  original: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  searchValue: 'HIGH' | 'MEDIUM' | 'LOW';
  searchPriority: number;
  source: 'ai' | 'regex';
  specificity?: number; // 0-1 score for how specific this entity is
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  highValueEntities: ExtractedEntity[]; // HIGH priority - search first
  mediumValueEntities: ExtractedEntity[]; // MEDIUM priority - search after high
  lowValueEntities: ExtractedEntity[];  // LOW priority - filter only
  uniqueIdentifiers: string[];
  usedAI: boolean;
  relationships?: Array<{
    from: string;
    to: string;
    type: string;
    evidence: string;
  }>;
  searchStrategy?: {
    primarySearchTerms: string[];
    filterTerms: string[];
    intent: string;
  };
}

// Generic location words (not useful for searching)
const GENERIC_LOCATION_WORDS = new Set([
  'delhi', 'mumbai', 'kolkata', 'chennai', 'bangalore', 'hyderabad', 'pune',
  'ahmedabad', 'jaipur', 'lucknow', 'kanpur', 'nagpur', 'indore', 'bhopal',
  'patna', 'ludhiana', 'agra', 'nashik', 'faridabad', 'meerut', 'rajkot',
  'kota', 'varanasi', 'srinagar', 'aurangabad', 'dhanbad', 'gwalior',
  'india', 'maharashtra', 'karnataka', 'tamil', 'nadu', 'gujarat', 'rajasthan',
  'uttar', 'pradesh', 'madhya', 'bihar', 'bengal', 'punjab', 'haryana',
  'west', 'east', 'north', 'south', 'central', 'area', 'city', 'town',
  'village', 'district', 'state', 'country', 'road', 'street', 'lane',
]);

// Check if an address is specific enough to be searchable
function calculateAddressSpecificity(address: string): { specificity: number; searchValue: 'HIGH' | 'MEDIUM' | 'LOW' } {
  const normalized = address.toLowerCase().trim();
  
  // Check if it's just a generic location
  if (GENERIC_LOCATION_WORDS.has(normalized)) {
    return { specificity: 0, searchValue: 'LOW' };
  }
  
  // Count specificity indicators
  let score = 0;
  
  // Has numbers (house numbers, pin codes)
  const numbers = address.match(/\d+/g) || [];
  if (numbers.length > 0) score += 0.3;
  if (numbers.length > 1) score += 0.2;
  
  // Long address (more specific)
  if (address.length > 20) score += 0.2;
  if (address.length > 40) score += 0.1;
  if (address.length > 60) score += 0.1;
  
  // Contains specific markers
  if (/\b(?:near|opposite|beside|behind|above|below|next to)\b/i.test(address)) score += 0.15;
  if (/\b(?:house|flat|apartment|building|block|sector|plot|shop|office)\b/i.test(address)) score += 0.15;
  if (/\b(?:masjid|mandir|church|temple|hospital|school|college|market|park)\b/i.test(address)) score += 0.1;
  
  // Multiple words (more specific than single word)
  const words = address.split(/\s+/).filter(w => w.length > 1);
  if (words.length > 2) score += 0.1;
  if (words.length > 4) score += 0.1;
  
  // Pin code (6 digits starting with 1-8)
  if (/\b[1-8]\d{5}\b/.test(address)) score += 0.2;
  
  // Normalize to 0-1
  score = Math.min(1, score);
  
  // Determine search value
  let searchValue: 'HIGH' | 'MEDIUM' | 'LOW';
  if (score >= 0.5) {
    searchValue = 'MEDIUM'; // Specific addresses are MEDIUM value - search after HIGH value entities
  } else if (score >= 0.25) {
    searchValue = 'MEDIUM'; // Moderately specific - still worth searching
  } else {
    searchValue = 'LOW'; // Too generic - only use for filtering
  }
  
  return { specificity: score, searchValue };
}

// Entity configuration with patterns (fallback)
const ENTITY_CONFIG = {
  phone: {
    priority: 10,
    searchValue: 'HIGH' as const,
    patterns: [
      /(?:\+91[-\s]?|91[-\s]?|0[-\s]?|[-\s])?([6-9]\d{9})\b/g,
      /\+91[-\s]?([6-9]\d{4}[-\s]?\d{5})\b/g,
    ],
    normalizer: (match: string) => {
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
    patterns: [/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi],
    normalizer: (match: string) => match.toLowerCase().trim(),
    validator: (normalized: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized),
  },
  id_number: {
    priority: 8,
    searchValue: 'HIGH' as const,
    patterns: [
      /\b([A-Z]{5}\d{4}[A-Z])\b/gi,
      /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
      /\b([A-Z]{1,2}\d{6,8})\b/g,
      /\b([A-Z]{3}\d{7})\b/gi,
    ],
    normalizer: (match: string) => match.toUpperCase().replace(/[\s-]/g, ''),
    validator: (normalized: string) => {
      if (/^[A-Z]{5}\d{4}[A-Z]$/.test(normalized)) return true;
      if (/^\d{12}$/.test(normalized)) return true;
      if (/^[A-Z]{1,2}\d{6,8}$/.test(normalized)) return true;
      if (/^[A-Z]{3}\d{7}$/.test(normalized)) return true;
      return false;
    },
  },
  account: {
    priority: 7,
    searchValue: 'HIGH' as const,
    patterns: [
      /(?:account|a\/c|acct|acc)[\s:-]*(\d{9,18})\b/gi,
      /\b([A-Z]{4}0[A-Z0-9]{6})\b/g,
    ],
    normalizer: (match: string) => match.toUpperCase().replace(/[\s-]/g, ''),
    validator: (normalized: string) => {
      if (/^\d{9,18}$/.test(normalized)) return true;
      if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) return true;
      return false;
    },
  },
  address: {
    priority: 5, // Lower than HIGH value entities
    searchValue: 'MEDIUM' as const, // Default, will be calculated
    patterns: [
      // Address with numbers (house/flat/shop numbers)
      /(?:address|addr|add)[:\s]*([0-9]+[,\s]*(?:[A-Za-z]+[,\s]*)+(?:lane|road|street|nagar|colony|sector|area|market|park|block|flat|house|shop|building)[\w\s,-]*)/gi,
      // Near landmark pattern
      /(?:near|opposite|beside)[\s]+([A-Za-z0-9\s]+(?:masjid|mandir|church|temple|hospital|school|college|market|park|station|metro))[\w\s,-]*/gi,
      // Full address with pin code
      /\b(\d+[\s,]*(?:[A-Za-z]+[\s,]*){2,}(?:lane|road|street|nagar|colony|sector)[\w\s,-]*[1-8]\d{5})\b/gi,
      // House/Flat/Shop with address
      /(?:house|flat|shop|office|plot|building|block)[\s.,]*no?[.\s]*([0-9]+[,\s]*[A-Za-z0-9\s,-]+)/gi,
    ],
    normalizer: (match: string) => match.trim().replace(/\s+/g, ' '),
    validator: (normalized: string) => normalized.length >= 5,
  },
  name: {
    priority: 3,
    searchValue: 'LOW' as const,
    patterns: [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
    ],
    normalizer: (match: string) => match.toLowerCase().trim(),
    validator: (normalized: string) => normalized.length >= 2,
  },
  location: {
    priority: 1,
    searchValue: 'LOW' as const,
    patterns: [/(?:from|in|at|near|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi],
    normalizer: (match: string) => match.toLowerCase().trim(),
    validator: (normalized: string) => normalized.length >= 3,
  },
  company: {
    priority: 2,
    searchValue: 'LOW' as const,
    patterns: [/(?:company|firm|business|enterprise|pvt|ltd|llp|inc)\s*[.:]?\s*([A-Za-z][A-Za-z0-9\s]{2,30})/gi],
    normalizer: (match: string) => match.toLowerCase().trim(),
    validator: (normalized: string) => normalized.length >= 3,
  },
};

/**
 * Intelligent Entity Extractor Class
 */
export class EntityExtractor {
  private seenEntities = new Set<string>();

  /**
   * Extract entities using AI (primary method)
   */
  async extractWithAI(text: string): Promise<EntityExtractionResult> {
    const isAIAvailable = await ollamaClient.isAvailable();
    
    if (isAIAvailable) {
      try {
        logger.info('Using AI for entity extraction');
        const aiResult = await ollamaClient.extractEntities(text);
        
        logger.info('AI extraction result', { 
          entityCount: aiResult.entities?.length || 0,
          hasEntities: !!aiResult.entities,
          hasStrategy: !!aiResult.searchStrategy,
          hasRelationships: !!(aiResult.relationships?.length),
          summary: aiResult.summary?.slice(0, 50) 
        });
        
        if (aiResult.entities && aiResult.entities.length > 0) {
          const entities = this.convertAIEntities(aiResult.entities, text);
          logger.info('AI entities converted', { count: entities.length });
          
          const result = this.categorizeEntities(entities, true);
          
          // Add relationships from AI
          if (aiResult.relationships && aiResult.relationships.length > 0) {
            result.relationships = aiResult.relationships;
            logger.info('AI relationships extracted', { count: aiResult.relationships.length });
          }
          
          // Add search strategy from AI
          if (aiResult.searchStrategy) {
            result.searchStrategy = aiResult.searchStrategy;
          }
          
          return result;
        } else {
          logger.warn('AI returned no entities, falling back to regex');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn('AI extraction failed, falling back to regex', { error: errorMsg });
      }
    }
    
    // Use enhanced regex with relationship extraction
    const regexResult = this.extractWithRelationships(text);
    return { ...regexResult, usedAI: false };
  }

  /**
   * Extract entities and relationships using enhanced regex patterns
   * This handles complex queries like "find X from Y connected to Z"
   */
  extractWithRelationships(text: string): EntityExtractionResult {
    const baseResult = this.extract(text);
    const relationships = this.extractRelationships(text);
    
    // If we have relationships but no entities, extract names from relationships
    if (relationships.length > 0 && baseResult.entities.length === 0) {
      const nameEntities = this.extractNamesFromRelationships(text, relationships);
      baseResult.entities.push(...nameEntities);
      baseResult.lowValueEntities.push(...nameEntities);
    }
    
    return {
      ...baseResult,
      relationships,
      searchStrategy: {
        primarySearchTerms: baseResult.uniqueIdentifiers,
        filterTerms: baseResult.lowValueEntities.map(e => e.value),
        intent: this.determineIntent(baseResult, relationships)
      }
    };
  }

  /**
   * Extract relationships from query text
   * Handles both capitalized and lowercase queries
   */
  private extractRelationships(text: string): Array<{from: string; to: string; type: string; evidence: string}> {
    const relationships: Array<{from: string; to: string; type: string; evidence: string}> = [];
    
    // Common Indian names for case-insensitive matching
    const commonNames = new Set([
      'rahul', 'amit', 'priya', 'sunil', 'anil', 'rajesh', 'suresh', 'ravi', 'sanjay', 'vijay',
      'subodh', 'aman', 'rohit', 'mohit', 'neha', 'pooja', 'deepak', 'manish', 'rakesh', 'ajay',
      'vikram', 'sachin', 'varun', 'arun', 'kiran', 'meena', 'rekha', 'sunita', 'kavita', 'nisha',
      'sharma', 'verma', 'gupta', 'singh', 'kumar', 'joshi', 'patel', 'shah', 'agarwal', 'yadav'
    ]);
    
    // Common Indian cities for location detection
    const commonCities = new Set([
      'delhi', 'mumbai', 'kolkata', 'chennai', 'bangalore', 'hyderabad', 'pune',
      'ahmedabad', 'jaipur', 'lucknow', 'kanpur', 'nagpur', 'indore', 'bhopal', 'patna'
    ]);
    
    // Helper function to capitalize name
    const capitalize = (s: string) => s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    
    // Relationship patterns - now case-insensitive
    const patterns = [
      // "X lives in Y" - location
      { 
        regex: /\b([a-z]+)\s+(?:lives?|resides?|stays?|located)\s+(?:in|at|near)\s+([a-z]+)\b/gi,
        type: 'location',
        validate: (m: string[]) => commonNames.has(m[1].toLowerCase()) || commonCities.has(m[2].toLowerCase())
      },
      // "X from Y" - origin/location
      { 
        regex: /\b([a-z]+)\s+(?:from|of)\s+([a-z]+)\b/gi,
        type: 'origin',
        validate: (m: string[]) => commonNames.has(m[1].toLowerCase()) || commonCities.has(m[2].toLowerCase())
      },
      // "X related/connected to Y" - association
      { 
        regex: /\b([a-z]+)\s+(?:is\s+)?(?:connected|related|associated|linked)\s+(?:to|with)\s+([a-z]+(?:\s+[a-z]+)?)\b/gi,
        type: 'association',
        validate: () => true
      },
      // "X having/has relation to Y" - association
      {
        regex: /\b([a-z]+)\s+(?:having|has|with)\s+(?:any\s+)?(?:relation|connection)\s+(?:to|with)\s+([a-z]+(?:\s+[a-z]+)?(?:\s+and\s+[a-z]+(?:\s+[a-z]+)?)*)\b/gi,
        type: 'association',
        validate: () => true
      },
      // "relation to X and Y and Z" - multiple associations
      {
        regex: /(?:relation|connection)\s+(?:to|with)\s+([a-z]+(?:\s+[a-z]+)?(?:\s+and\s+[a-z]+(?:\s+[a-z]+)?)*)\b/gi,
        type: 'association_multi',
        validate: () => true
      },
      // Capitalized patterns (original)
      { 
        regex: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:connected|related|associated|linked)\s+(?:to|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
        type: 'association',
        validate: () => true
      },
      { 
        regex: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:lives?|resides?|stays?|located)\s+(?:in|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
        type: 'location',
        validate: () => true
      },
      { 
        regex: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:from|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
        type: 'origin',
        validate: () => true
      },
    ];
    
    for (const { regex, type, validate } of patterns) {
      let match;
      regex.lastIndex = 0; // Reset regex
      
      while ((match = regex.exec(text)) !== null) {
        // Skip if validation fails
        if (validate && !validate(match)) continue;
        
        if (type === 'association_multi') {
          // Handle "rahul sharma and aman verma"
          const people = match[1].split(/\s+and\s+/i);
          for (const person of people) {
            const trimmed = person.trim();
            if (trimmed.length >= 3 && !commonCities.has(trimmed.toLowerCase())) {
              const capitalizedName = capitalize(trimmed);
              // Create relationship from each person to the "subject" (we'll link them later)
              relationships.push({
                from: 'SUBJECT', // Placeholder - will be replaced
                to: capitalizedName,
                type: 'association',
                evidence: match[0]
              });
            }
          }
        } else {
          // Avoid duplicates
          const from = capitalize(match[1]);
          const to = capitalize(match[2]);
          
          const exists = relationships.some(r => 
            (r.from === from && r.to === to) ||
            (r.from === to && r.to === from)
          );
          
          if (!exists) {
            relationships.push({
              from,
              to,
              type,
              evidence: match[0]
            });
          }
        }
      }
    }
    
    // Clean up SUBJECT placeholders - find the main subject
    const subjectPlaceholders = relationships.filter(r => r.from === 'SUBJECT');
    if (subjectPlaceholders.length > 0) {
      // Try to find the main subject from other relationships or from text
      const mainSubject = relationships.find(r => r.from !== 'SUBJECT')?.from;
      
      if (mainSubject) {
        // Replace SUBJECT with main subject
        for (const rel of relationships) {
          if (rel.from === 'SUBJECT') {
            rel.from = mainSubject;
          }
        }
      } else {
        // Try to extract subject from text patterns like "i want to know X" or "find X"
        const subjectPatterns = [
          /(?:want\s+to\s+(?:know|find)|find|search|looking\s+for)\s+([a-z]+)/gi,
          /(?:know|find)\s+([a-z]+)\s+(?:that|who|which|from|in|lives)/gi,
        ];
        
        for (const pattern of subjectPatterns) {
          const m = pattern.exec(text);
          if (m && commonNames.has(m[1].toLowerCase())) {
            const subject = capitalize(m[1]);
            for (const rel of relationships) {
              if (rel.from === 'SUBJECT') {
                rel.from = subject;
              }
            }
            break;
          }
        }
      }
      
      // Remove any remaining SUBJECT placeholders
      const filtered = relationships.filter(r => r.from !== 'SUBJECT');
      relationships.length = 0;
      relationships.push(...filtered);
    }
    
    if (relationships.length > 0) {
      logger.info('Extracted relationships from text', { count: relationships.length, relationships });
    }
    
    return relationships;
  }

  /**
   * Extract names from relationship patterns
   */
  private extractNamesFromRelationships(text: string, relationships: Array<{from: string; to: string; type: string; evidence: string}>): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();
    
    for (const rel of relationships) {
      // Add 'from' entity as name
      const fromKey = `name:${rel.from.toLowerCase()}`;
      if (!seen.has(fromKey)) {
        seen.add(fromKey);
        entities.push({
          type: 'name',
          value: rel.from,
          normalized: rel.from.toLowerCase(),
          original: rel.from,
          confidence: 0.8,
          startIndex: text.indexOf(rel.from),
          endIndex: text.indexOf(rel.from) + rel.from.length,
          searchValue: 'LOW',
          searchPriority: 3,
          source: 'regex'
        });
      }
      
      // Add 'to' entity as name or location based on relationship type
      const toKey = rel.type === 'location' || rel.type === 'origin' 
        ? `location:${rel.to.toLowerCase()}`
        : `name:${rel.to.toLowerCase()}`;
      
      if (!seen.has(toKey)) {
        seen.add(toKey);
        const isLocation = rel.type === 'location' || rel.type === 'origin';
        entities.push({
          type: isLocation ? 'location' : 'name',
          value: rel.to,
          normalized: rel.to.toLowerCase(),
          original: rel.to,
          confidence: 0.8,
          startIndex: text.indexOf(rel.to),
          endIndex: text.indexOf(rel.to) + rel.to.length,
          searchValue: 'LOW',
          searchPriority: isLocation ? 1 : 3,
          source: 'regex'
        });
      }
    }
    
    return entities;
  }

  /**
   * Determine search intent from entities and relationships
   */
  private determineIntent(result: EntityExtractionResult, relationships: Array<{from: string; to: string; type: string; evidence: string}>): string {
    if (result.highValueEntities.length > 0) {
      const types = [...new Set(result.highValueEntities.map(e => e.type))];
      return `Find by ${types.join(', ')} with filters`;
    }
    
    if (relationships.length > 0) {
      const types = [...new Set(relationships.map(r => r.type))];
      if (types.includes('association')) {
        return 'Find person with relationship to others';
      }
      if (types.includes('location')) {
        return 'Find person by name and location';
      }
    }
    
    if (result.lowValueEntities.some(e => e.type === 'name')) {
      return 'Find person by name';
    }
    
    return 'General search';
  }

  /**
   * Categorize entities by value
   */
  private categorizeEntities(entities: ExtractedEntity[], usedAI: boolean): EntityExtractionResult {
    // Sort by priority
    entities.sort((a, b) => b.searchPriority - a.searchPriority);
    
    const highValueEntities = entities.filter(e => e.searchValue === 'HIGH');
    const mediumValueEntities = entities.filter(e => e.searchValue === 'MEDIUM');
    const lowValueEntities = entities.filter(e => e.searchValue === 'LOW');
    
    // Get identifiers from HIGH and MEDIUM value entities
    const uniqueIdentifiers = this.getUniqueIdentifiers([...highValueEntities, ...mediumValueEntities]);
    
    logger.info('Entity extraction complete', {
      total: entities.length,
      highValue: highValueEntities.length,
      mediumValue: mediumValueEntities.length,
      lowValue: lowValueEntities.length,
      identifiers: uniqueIdentifiers,
    });
    
    return {
      entities,
      highValueEntities,
      mediumValueEntities,
      lowValueEntities,
      uniqueIdentifiers,
      usedAI,
    };
  }

  /**
   * Convert AI-extracted entities to our format
   */
  private convertAIEntities(
    aiEntities: Array<{ type: string; value: string; confidence: number; context?: string; searchPriority?: string }>,
    originalText: string
  ): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    this.seenEntities.clear();

    for (const aiEntity of aiEntities) {
      const type = this.normalizeEntityType(aiEntity.type);
      if (!type) continue;
      
      const normalized = this.normalizeValue(aiEntity.value, type);
      const key = `${type}:${normalized.toLowerCase()}`;
      
      if (this.seenEntities.has(key)) continue;
      this.seenEntities.add(key);
      
      const lowerText = originalText.toLowerCase();
      const valueLower = aiEntity.value.toLowerCase();
      const startIndex = lowerText.indexOf(valueLower);
      
      // Determine search value based on type and AI suggestion
      let searchValue: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      let specificity = 0;
      
      // Use AI's searchPriority if provided
      if (aiEntity.searchPriority) {
        if (aiEntity.searchPriority === 'HIGH') searchValue = 'HIGH';
        else if (aiEntity.searchPriority === 'MEDIUM') searchValue = 'MEDIUM';
        else searchValue = 'LOW';
      } else {
        // Fall back to type-based logic
        if (['phone', 'email', 'id_number', 'account'].includes(type)) {
          searchValue = 'HIGH';
        } else if (type === 'address') {
          const result = calculateAddressSpecificity(aiEntity.value);
          searchValue = result.searchValue;
          specificity = result.specificity;
        } else {
          searchValue = 'LOW';
        }
      }
      
      entities.push({
        type,
        value: aiEntity.value,
        normalized,
        original: aiEntity.value,
        confidence: aiEntity.confidence,
        startIndex: startIndex >= 0 ? startIndex : 0,
        endIndex: startIndex >= 0 ? startIndex + aiEntity.value.length : aiEntity.value.length,
        searchValue,
        searchPriority: ENTITY_CONFIG[type]?.priority || 1,
        source: 'ai',
        specificity,
      });
    }

    return entities;
  }

  /**
   * Normalize entity type from AI response
   */
  private normalizeEntityType(aiType: string): EntityType | null {
    const typeMap: Record<string, EntityType> = {
      'phone': 'phone',
      'mobile': 'phone',
      'phone_number': 'phone',
      'email': 'email',
      'email_address': 'email',
      'id_number': 'id_number',
      'pan': 'id_number',
      'aadhaar': 'id_number',
      'aadhar': 'id_number',
      'passport': 'id_number',
      'voter_id': 'id_number',
      'account': 'account',
      'bank_account': 'account',
      'account_number': 'account',
      'ifsc': 'account',
      'name': 'name',
      'person_name': 'name',
      'full_name': 'name',
      'location': 'location',
      'city': 'location',
      'state': 'location',
      'address': 'address',
      'street_address': 'address',
      'full_address': 'address',
      'company': 'company',
      'company_name': 'company',
      'organization': 'company',
    };
    
    return typeMap[aiType.toLowerCase()] || null;
  }

  /**
   * Normalize value based on type
   */
  private normalizeValue(value: string, type: EntityType): string {
    const config = ENTITY_CONFIG[type];
    if (config?.normalizer) {
      return config.normalizer(value);
    }
    return value.toLowerCase().trim();
  }

  /**
   * Extract entities using regex patterns (fallback)
   */
  extract(text: string): EntityExtractionResult {
    this.seenEntities.clear();
    const entities: ExtractedEntity[] = [];

    // First, do intelligent NLP parsing for complex queries
    const smartEntities = this.smartParseQuery(text);
    entities.push(...smartEntities);

    // Extract each entity type using regex
    for (const [type, config] of Object.entries(ENTITY_CONFIG)) {
      const extracted = this.extractByType(text, type as EntityType, config);
      for (const entity of extracted) {
        const key = `${entity.type}:${entity.normalized.toLowerCase()}`;
        if (!this.seenEntities.has(key)) {
          this.seenEntities.add(key);
          entities.push(entity);
        }
      }
    }

    // Also extract addresses from common address fields
    const addressEntities = this.extractAddressesFromText(text);
    for (const addr of addressEntities) {
      const key = `address:${addr.normalized.toLowerCase()}`;
      if (!this.seenEntities.has(key)) {
        this.seenEntities.add(key);
        entities.push(addr);
      }
    }

    return this.categorizeEntities(entities, false);
  }

  /**
   * Smart query parsing for complex natural language queries
   * Handles queries like: "find subodh from delhi who has relation to rahul sharma and aman verma"
   */
  private smartParseQuery(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const lowerText = text.toLowerCase();
    const seen = new Set<string>();

    // Common Indian names for better detection
    const commonFirstNames = new Set([
      'rahul', 'amit', 'priya', 'sunil', 'anil', 'rajesh', 'suresh', 'ravi', 'sanjay', 'vijay',
      'subodh', 'aman', 'rohit', 'mohit', 'neha', 'pooja', 'deepak', 'manish', 'rakesh', 'ajay',
      'vikram', 'sachin', 'varun', 'arun', 'kiran', 'meena', 'rekha', 'sunita', 'kavita', 'nisha',
      'sharma', 'verma', 'gupta', 'singh', 'kumar', 'joshi', 'patel', 'shah', 'agarwal', 'yadav'
    ]);

    // Extract names with context (case-insensitive)
    // Pattern: "know/find [name]" or "[name] from [location]" or "[name] having/with [something]"
    const nameWithContextPatterns = [
      // "know subodh" or "find subodh"
      /(?:know|find|search|looking\s+for|want\s+(?:to\s+)?(?:know|find)|information\s+about)\s+([a-z]+(?:\s+[a-z]+)?)/gi,
      // "subodh from delhi" or "subodh lives in delhi"
      /([a-z]+)\s+(?:from|lives?\s+in|resides?\s+(?:in|at)|of)\s+([a-z]+)/gi,
      // "subodh having phone" or "subodh with phone"
      /([a-z]+)\s+(?:having|has|with)\s+(?:phone|mobile|number|email|account)/gi,
      // Names before relationship keywords
      /([a-z]+(?:\s+[a-z]+)?)\s+(?:who|that|which)\s+(?:has|have|is|lives|resides|connected|related)/gi,
    ];

    for (const pattern of nameWithContextPatterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      
      while ((match = regex.exec(lowerText)) !== null) {
        const potentialName = match[1];
        // Check if it looks like a name (not a common word)
        const words = potentialName.split(/\s+/);
        const isValidName = words.every(w => w.length >= 3 && !['the', 'and', 'for', 'who', 'has', 'had', 'was', 'his', 'her', 'phone', 'email', 'from', 'live', 'lives', 'with', 'that', 'this', 'they', 'them'].includes(w));
        
        if (isValidName && !seen.has(`name:${potentialName}`)) {
          seen.add(`name:${potentialName}`);
          entities.push({
            type: 'name',
            value: this.capitalizeName(potentialName),
            normalized: potentialName,
            original: match[1],
            confidence: 0.75,
            startIndex: match.index,
            endIndex: match.index + match[1].length,
            searchValue: 'LOW',
            searchPriority: 3,
            source: 'regex'
          });
        }

        // If there's a second capture group (location)
        if (match[2]) {
          const location = match[2];
          if (!seen.has(`location:${location}`) && !['phone', 'email', 'mobile', 'number'].includes(location)) {
            seen.add(`location:${location}`);
            entities.push({
              type: 'location',
              value: this.capitalizeName(location),
              normalized: location,
              original: match[2],
              confidence: 0.85,
              startIndex: match.index + match[1].length + 1,
              endIndex: match.index + match[0].length,
              searchValue: 'LOW',
              searchPriority: 1,
              source: 'regex'
            });
          }
        }
      }
    }

    // Extract multiple related people: "relation to rahul sharma and aman verma"
    const relationPattern = /(?:relation|connection|associated|connected|related|linked)\s+(?:to|with)\s+([a-z\s,]+?)(?:\s+(?:and|who|which|that|\.|$))/gi;
    let relMatch;
    while ((relMatch = relationPattern.exec(lowerText)) !== null) {
      const relatedPeople = relMatch[1]
        .split(/\s+and\s+|,/)
        .map(s => s.trim())
        .filter(s => s.length >= 3 && !['phone', 'email', 'mobile', 'the'].includes(s));

      for (const person of relatedPeople) {
        if (!seen.has(`name:${person}`)) {
          seen.add(`name:${person}`);
          entities.push({
            type: 'name',
            value: this.capitalizeName(person),
            normalized: person,
            original: person,
            confidence: 0.8,
            startIndex: relMatch.index,
            endIndex: relMatch.index + relMatch[0].length,
            searchValue: 'LOW',
            searchPriority: 3,
            source: 'regex'
          });
        }
      }
    }

    // Extract capitalized names (standard pattern)
    const capitalizedNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let capMatch;
    while ((capMatch = capitalizedNamePattern.exec(text)) !== null) {
      const name = capMatch[1].toLowerCase();
      const words = name.split(/\s+/);
      
      // Must have at least one common name part or be 2+ capitalized words
      const hasCommonName = words.some(w => commonFirstNames.has(w));
      const isFullName = words.length >= 2 && words.every(w => w.length >= 3);
      
      if ((hasCommonName || isFullName) && !seen.has(`name:${name}`)) {
        seen.add(`name:${name}`);
        entities.push({
          type: 'name',
          value: capMatch[1],
          normalized: name,
          original: capMatch[1],
          confidence: hasCommonName ? 0.85 : 0.75,
          startIndex: capMatch.index,
          endIndex: capMatch.index + capMatch[1].length,
          searchValue: 'LOW',
          searchPriority: 3,
          source: 'regex'
        });
      }
    }

    return entities;
  }

  /**
   * Capitalize a name properly
   */
  private capitalizeName(name: string): string {
    return name
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Extract addresses from text more aggressively
   */
  private extractAddressesFromText(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    // Look for common address field patterns
    const addressPatterns = [
      // "address: 123 Main Street" - must start with address keyword
      /(?:address|addr|location|street)[:\s]+([A-Za-z0-9][A-Za-z0-9\s,-]{10,100})/gi,
      // House/flat/shop patterns - must have these keywords
      /((?:house|flat|shop|office|plot|building|block)[\s.,]*no?[.\s]*[0-9]+[A-Za-z0-9\s,-]{5,50})/gi,
      // Near landmark pattern
      /((?:near|opposite|beside|behind)[\s]+[A-Za-z0-9]+[\s]+(?:masjid|mandir|church|temple|hospital|school|college|market|park|station|metro)[A-Za-z0-9\s,-]{5,50})/gi,
      // Lane/Road/Street with number - specific addresses only
      /\b([0-9]+[\s,]*(?:[A-Za-z]+[\s,]*){1,3}(?:lane|road|street|nagar|colony|sector)[A-Za-z0-9\s,-]{5,50})\b/gi,
    ];
    
    for (const pattern of addressPatterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      
      while ((match = regex.exec(text)) !== null) {
        const original = match[1] || match[0];
        const normalized = original.trim().replace(/\s+/g, ' ');
        
        // Skip if too short or too long
        if (normalized.length < 10 || normalized.length > 150) continue;
        
        // Skip if it looks like a phone number or email
        if (/^[6-9]\d{9}$/.test(normalized.replace(/\D/g, ''))) continue;
        if (/@/.test(normalized)) continue;
        
        // Skip if it's just numbers and spaces
        if (/^[\d\s]+$/.test(normalized)) continue;
        
        // Calculate specificity
        const result = calculateAddressSpecificity(normalized);
        
        if (result.specificity < 0.25) continue; // Skip very generic addresses
        
        entities.push({
          type: 'address',
          value: normalized,
          normalized,
          original,
          confidence: 0.7 + result.specificity * 0.2,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          searchValue: result.searchValue,
          searchPriority: result.searchValue === 'MEDIUM' ? 5 : 1,
          source: 'regex',
          specificity: result.specificity,
        });
      }
    }
    
    return entities;
  }

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

        if (!config.validator(normalized)) continue;

        const key = `${type}:${normalized.toLowerCase()}`;
        if (this.seenEntities.has(key)) continue;
        this.seenEntities.add(key);

        // Calculate search value for addresses
        let searchValue = config.searchValue;
        let specificity = 0;
        
        if (type === 'address') {
          const result = calculateAddressSpecificity(normalized);
          searchValue = result.searchValue;
          specificity = result.specificity;
        }

        entities.push({
          type,
          value: normalized,
          normalized,
          original,
          confidence: this.calculateConfidence(type, normalized),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          searchValue,
          searchPriority: config.priority,
          source: 'regex',
          specificity,
        });
      }
    }

    return entities;
  }

  private calculateConfidence(type: EntityType, normalized: string): number {
    switch (type) {
      case 'phone':
        return /^[6-9]\d{9}$/.test(normalized) ? 0.98 : 0.7;
      case 'email':
        return 0.95;
      case 'id_number':
        if (/^[A-Z]{5}\d{4}[A-Z]$/.test(normalized)) return 0.99;
        if (/^\d{12}$/.test(normalized)) return 0.98;
        return 0.85;
      case 'account':
        return 0.9;
      case 'address':
        return 0.7;
      default:
        return 0.6;
    }
  }

  private getUniqueIdentifiers(entities: ExtractedEntity[]): string[] {
    const identifiers: string[] = [];
    const seen = new Set<string>();
    
    // Priority order: HIGH value first, then MEDIUM value
    const typePriority = ['phone', 'email', 'id_number', 'account', 'address'];

    for (const type of typePriority) {
      for (const entity of entities) {
        if (entity.type !== type) continue;
        if (seen.has(entity.normalized)) continue;
        
        // For addresses, only include if MEDIUM value
        if (type === 'address' && entity.searchValue === 'LOW') continue;
        
        seen.add(entity.normalized);
        identifiers.push(entity.normalized);
        if (identifiers.length >= 10) break; // Increased limit for addresses
      }
      if (identifiers.length >= 10) break;
    }

    return identifiers;
  }

  /**
   * Extract entities from a structured record (database result)
   */
  extractFromRecord(record: Record<string, unknown>, table?: string): EntityExtractionResult {
    const text = Object.entries(record)
      .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    const result = this.extract(text);
    
    // Also check common address field names
    const addressFields = ['address', 'addr', 'location', 'street', 'city', 'state', 'full_address', 'residential_address'];
    for (const field of addressFields) {
      const value = record[field];
      if (value && typeof value === 'string' && value.length > 10) {
        const specificity = calculateAddressSpecificity(value);
        if (specificity.specificity >= 0.3) {
          const key = `address:${value.toLowerCase()}`;
          if (!this.seenEntities.has(key)) {
            result.entities.push({
              type: 'address',
              value: value.trim(),
              normalized: value.trim(),
              original: value,
              confidence: 0.8,
              startIndex: 0,
              endIndex: value.length,
              searchValue: specificity.searchValue,
              searchPriority: specificity.searchValue === 'MEDIUM' ? 5 : 1,
              source: 'regex',
              specificity: specificity.specificity,
            });
            if (specificity.searchValue === 'MEDIUM') {
              result.mediumValueEntities.push(result.entities[result.entities.length - 1]);
            }
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Merge entity extraction results
   */
  mergeResults(results: EntityExtractionResult[]): EntityExtractionResult {
    const allEntities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      for (const entity of result.entities) {
        const key = `${entity.type}:${entity.normalized.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allEntities.push(entity);
      }
    }

    allEntities.sort((a, b) => b.searchPriority - a.searchPriority);

    return {
      entities: allEntities,
      highValueEntities: allEntities.filter(e => e.searchValue === 'HIGH'),
      mediumValueEntities: allEntities.filter(e => e.searchValue === 'MEDIUM'),
      lowValueEntities: allEntities.filter(e => e.searchValue === 'LOW'),
      uniqueIdentifiers: this.getUniqueIdentifiers(allEntities.filter(e => e.searchValue !== 'LOW')),
      usedAI: results.some(r => r.usedAI),
    };
  }
}

// Singleton instance
export const entityExtractor = new EntityExtractor();