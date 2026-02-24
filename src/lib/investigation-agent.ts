/**
 * Investigation Agent
 * AI-powered agent for iterative investigation and entity discovery
 */

import ZAI from 'z-ai-web-dev-sdk';
import { backendAPI, fetchAllSearchResults, type Record, type TableInfo } from './backend-api';

// Types
export interface ExtractedEntity {
  type: 'phone' | 'email' | 'name' | 'address' | 'city' | 'state' | 'pincode' | 'company' | 'id' | 'date' | 'amount' | 'unknown';
  value: string;
  confidence: number;
  source: 'user' | 'discovered';
}

export interface InvestigationStep {
  id: string;
  type: 'search' | 'extract' | 'correlate' | 'analyze' | 'summarize';
  status: 'pending' | 'running' | 'completed' | 'failed';
  query?: string;
  table?: string;
  recordsFound?: number;
  entitiesExtracted?: number;
  message: string;
  timestamp: Date;
}

export interface DiscoveredRecord {
  record: Record;
  sourceTable: string;
  matchedOn: string[];
  matchType: 'direct' | 'indirect' | 'inferred';
  confidence: number;
  discoveryPath: string[];
}

export interface InvestigationResult {
  query: string;
  primarySubject: DiscoveredRecord | null;
  relatedRecords: DiscoveredRecord[];
  allRecords: DiscoveredRecord[];
  entities: ExtractedEntity[];
  relationships: Relationship[];
  timeline: TimelineEvent[];
  insights: string[];
  summary: string;
  steps: InvestigationStep[];
  stats: {
    totalRecordsFound: number;
    tablesSearched: string[];
    entitiesDiscovered: number;
    searchDuration: number;
  };
}

export interface Relationship {
  from: string;
  to: string;
  type: string;
  evidence: string;
  confidence: number;
}

export interface TimelineEvent {
  date: string;
  event: string;
  source: string;
  details: Record;
}

// Regex patterns for entity extraction
const ENTITY_PATTERNS = {
  phone: [
    /(?:\+91[-.\s]?)?[6-9]\d{9}\b/g,  // Indian mobile numbers
    /(?:\+91[-.\s]?)?\d{3,4}[-.\s]?\d{6,7}\b/g,  // Landline
    /(?:phone|mobile|contact|cell)[\s:.-]*([6-9]\d{9})\b/gi,
  ],
  email: [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ],
  pincode: [
    /\b[1-9][0-9]{5}\b/g,  // Indian pincodes
  ],
  amount: [
    /(?:rs\.?|₹|inr)\s*[\d,]+(?:\.\d{2})?/gi,
    /[\d,]+(?:\.\d{2})?\s*(?:rs\.?|₹|inr)/gi,
  ],
  date: [
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,
    /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,
  ],
};

// Common Indian names for better name extraction
const COMMON_FIRST_NAMES = new Set([
  'rahul', 'amit', 'priya', 'vikram', 'neha', 'arun', 'pooja', 'rajesh', 'sunita', 'sanjay',
  'anil', 'deepak', 'ravi', 'manish', 'varun', 'ankit', 'nitin', 'akash', 'naveen', 'suresh',
  'kumar', 'sharma', 'singh', 'verma', 'gupta', 'jain', 'mehta', 'patel', 'shah', 'agarwal',
]);

const COMMON_LAST_NAMES = new Set([
  'sharma', 'verma', 'gupta', 'singh', 'kumar', 'jain', 'mehta', 'patel', 'shah', 'agarwal',
  'mittal', 'bansal', 'goyal', 'bhargava', 'dixit', 'tiwari', 'tripathi', 'mishra', 'pandey', 'yadav',
]);

// City name patterns
const MAJOR_CITIES = new Set([
  'delhi', 'mumbai', 'bangalore', 'bengaluru', 'chennai', 'kolkata', 'hyderabad', 'pune', 'ahmedabad',
  'jaipur', 'lucknow', 'kanpur', 'nagpur', 'indore', 'bhopal', 'patna', 'ludhiana', 'agra', 'nashik',
  'faridabad', 'meerut', 'rajkot', 'varanasi', 'srinagar', 'aurangabad', 'dhanbad', 'amritsar',
  'navi mumbai', 'gurgaon', 'ghaziabad', 'noida', 'greater noida', 'howrah', 'ranchi', 'coimbatore',
]);

export class InvestigationAgent {
  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
  private tables: TableInfo[] = [];
  private searchableColumns: Map<string, string[]> = new Map();
  private steps: InvestigationStep[] = [];
  private allRecords: DiscoveredRecord[] = [];
  private entities: ExtractedEntity[] = [];
  private searchedValues: Set<string> = new Set();

  async initialize(): Promise<void> {
    this.zai = await ZAI.create();
    
    // Load tables and their schemas
    const tablesResponse = await backendAPI.listTables();
    this.tables = tablesResponse.tables;
    
    // Cache searchable columns per table
    for (const table of this.tables) {
      this.searchableColumns.set(table.name, table.searchable);
    }
  }

  /**
   * Main investigation method
   */
  async investigate(query: string, onProgress?: (step: InvestigationStep) => void): Promise<InvestigationResult> {
    const startTime = Date.now();
    this.steps = [];
    this.allRecords = [];
    this.entities = [];
    this.searchedValues = new Set();

    // Initialize if needed
    if (!this.zai) {
      await this.initialize();
    }

    // Step 1: Extract entities from the query
    const extractedEntities = await this.extractEntities(query, 'user');
    this.entities.push(...extractedEntities);

    this.addStep({
      type: 'extract',
      status: 'completed',
      message: `Extracted ${extractedEntities.length} entities from query: ${extractedEntities.map(e => `${e.type}:${e.value}`).join(', ')}`,
      entitiesExtracted: extractedEntities.length,
    }, onProgress);

    // Step 2: Prioritize search order based on entity uniqueness
    const searchOrder = this.prioritizeEntities(extractedEntities);

    // Step 3: Execute iterative search
    for (const entity of searchOrder) {
      if (this.searchedValues.has(entity.value.toLowerCase())) continue;
      this.searchedValues.add(entity.value.toLowerCase());

      await this.searchByEntity(entity, onProgress);
    }

    // Step 4: Extract new entities from discovered records
    await this.extractFromRecords(onProgress);

    // Step 5: Iterative expansion - search newly discovered entities
    let iteration = 0;
    const maxIterations = 3;
    let newEntitiesFound = true;

    while (newEntitiesFound && iteration < maxIterations) {
      const newEntities = this.entities.filter(e => 
        e.source === 'discovered' && 
        !this.searchedValues.has(e.value.toLowerCase())
      );

      if (newEntities.length === 0) {
        newEntitiesFound = false;
        break;
      }

      iteration++;
      
      for (const entity of newEntities.slice(0, 5)) { // Limit iterations
        this.searchedValues.add(entity.value.toLowerCase());
        await this.searchByEntity(entity, onProgress);
      }

      // Extract more entities from new records
      await this.extractFromRecords(onProgress);
    }

    // Step 6: Identify primary subject
    const primarySubject = await this.identifyPrimarySubject(extractedEntities, query);

    // Step 7: Build relationships
    const relationships = this.buildRelationships();

    // Step 8: Build timeline
    const timeline = this.buildTimeline();

    // Step 9: Generate insights and summary
    const { insights, summary } = await this.generateInsights(query, primarySubject);

    // Final step
    this.addStep({
      type: 'summarize',
      status: 'completed',
      message: `Investigation complete. Found ${this.allRecords.length} records across ${new Set(this.allRecords.map(r => r.sourceTable)).size} tables.`,
      recordsFound: this.allRecords.length,
    }, onProgress);

    return {
      query,
      primarySubject,
      relatedRecords: this.allRecords.filter(r => r !== primarySubject),
      allRecords: this.allRecords,
      entities: this.entities,
      relationships,
      timeline,
      insights,
      summary,
      steps: this.steps,
      stats: {
        totalRecordsFound: this.allRecords.length,
        tablesSearched: [...new Set(this.allRecords.map(r => r.sourceTable))],
        entitiesDiscovered: this.entities.length,
        searchDuration: Date.now() - startTime,
      },
    };
  }

  /**
   * Extract entities from text using patterns and AI
   */
  private async extractEntities(text: string, source: 'user' | 'discovered'): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = [];

    // Pattern-based extraction
    // Phones
    for (const pattern of ENTITY_PATTERNS.phone) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const value = match[1] || match[0];
        const cleaned = value.replace(/[^0-9+]/g, '');
        if (cleaned.length >= 10) {
          entities.push({ type: 'phone', value: cleaned, confidence: 0.95, source });
        }
      }
    }

    // Emails
    for (const pattern of ENTITY_PATTERNS.email) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({ type: 'email', value: match[0].toLowerCase(), confidence: 0.95, source });
      }
    }

    // Pincodes
    for (const pattern of ENTITY_PATTERNS.pincode) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({ type: 'pincode', value: match[0], confidence: 0.8, source });
      }
    }

    // Names and cities - using simple heuristics
    const words = text.split(/[\s,]+/);
    
    // Check for name patterns
    const namePattern = /(?:name\s*(?:is|:)?\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
    let nameMatch;
    while ((nameMatch = namePattern.exec(text)) !== null) {
      const name = nameMatch[1];
      const parts = name.toLowerCase().split(/\s+/);
      
      if (parts.some(p => COMMON_FIRST_NAMES.has(p) || COMMON_LAST_NAMES.has(p))) {
        entities.push({ type: 'name', value: name, confidence: 0.85, source });
      }
    }

    // Check for cities
    const lowerText = text.toLowerCase();
    for (const city of MAJOR_CITIES) {
      if (lowerText.includes(city)) {
        entities.push({ type: 'city', value: city.charAt(0).toUpperCase() + city.slice(1), confidence: 0.9, source });
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return entities.filter(e => {
      const key = `${e.type}:${e.value.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Prioritize entities for search based on uniqueness
   */
  private prioritizeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const priorityOrder = ['phone', 'email', 'id', 'pincode', 'name', 'city', 'address', 'company'];
    
    return [...entities].sort((a, b) => {
      const priorityA = priorityOrder.indexOf(a.type);
      const priorityB = priorityOrder.indexOf(b.type);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Search for records by entity
   */
  private async searchByEntity(
    entity: ExtractedEntity, 
    onProgress?: (step: InvestigationStep) => void
  ): Promise<void> {
    const stepId = this.addStep({
      type: 'search',
      status: 'running',
      query: entity.value,
      message: `Searching for ${entity.type}: ${entity.value}`,
    }, onProgress);

    try {
      // Global search across all tables
      const searchQuery = entity.value;
      let totalFound = 0;

      // Search each table individually for better control
      for (const table of this.tables) {
        if (!table.searchable || table.searchable.length === 0) continue;

        try {
          const records = await fetchAllSearchResults(
            table.name,
            searchQuery,
            { limit: 100, maxRecords: 500 }
          );

          for (const record of records) {
            // Check if we already have this record
            const recordId = String(record.id || record._id || JSON.stringify(record));
            const existingRecord = this.allRecords.find(r => 
              r.sourceTable === table.name && 
              String(r.record.id || r.record._id) === String(record.id || record._id)
            );

            if (existingRecord) {
              // Update match info
              if (!existingRecord.matchedOn.includes(entity.value)) {
                existingRecord.matchedOn.push(entity.value);
              }
            } else {
              // Add new record
              this.allRecords.push({
                record,
                sourceTable: table.name,
                matchedOn: [entity.value],
                matchType: entity.type === 'phone' || entity.type === 'email' ? 'direct' : 'indirect',
                confidence: entity.confidence,
                discoveryPath: [`Search for ${entity.type}: ${entity.value}`],
              });
              totalFound++;
            }
          }
        } catch (error) {
          console.error(`Error searching table ${table.name}:`, error);
        }
      }

      this.updateStep(stepId, {
        status: 'completed',
        recordsFound: totalFound,
        message: `Found ${totalFound} records for ${entity.type}: ${entity.value}`,
      }, onProgress);

    } catch (error) {
      this.updateStep(stepId, {
        status: 'failed',
        message: `Search failed for ${entity.type}: ${entity.value} - ${error}`,
      }, onProgress);
    }
  }

  /**
   * Extract entities from discovered records
   */
  private async extractFromRecords(onProgress?: (step: InvestigationStep) => void): Promise<void> {
    const stepId = this.addStep({
      type: 'extract',
      status: 'running',
      message: 'Extracting entities from discovered records...',
    }, onProgress);

    let newEntities = 0;
    const existingEntityKeys = new Set(this.entities.map(e => `${e.type}:${e.value.toLowerCase()}`));

    for (const discovered of this.allRecords) {
      const record = discovered.record;
      
      // Convert record to searchable text
      const text = Object.entries(record)
        .filter(([key]) => !key.startsWith('_'))
        .map(([key, value]) => `${key}: ${value}`)
        .join(' ');

      // Extract entities from this text
      const extracted = await this.extractEntities(text, 'discovered');
      
      for (const entity of extracted) {
        const key = `${entity.type}:${entity.value.toLowerCase()}`;
        if (!existingEntityKeys.has(key)) {
          this.entities.push(entity);
          existingEntityKeys.add(key);
          newEntities++;
        }
      }
    }

    this.updateStep(stepId, {
      status: 'completed',
      entitiesExtracted: newEntities,
      message: `Extracted ${newEntities} new entities from ${this.allRecords.length} records`,
    }, onProgress);
  }

  /**
   * Identify the primary subject from results
   */
  private async identifyPrimarySubject(
    queryEntities: ExtractedEntity[],
    originalQuery: string
  ): Promise<DiscoveredRecord | null> {
    if (this.allRecords.length === 0) return null;

    // Score each record based on match with query entities
    const scored = this.allRecords.map(record => {
      let score = 0;
      const recordText = JSON.stringify(record.record).toLowerCase();

      for (const entity of queryEntities) {
        if (recordText.includes(entity.value.toLowerCase())) {
          score += entity.confidence * (entity.type === 'phone' || entity.type === 'email' ? 2 : 1);
        }
      }

      // Check for name match specifically
      const nameEntity = queryEntities.find(e => e.type === 'name');
      if (nameEntity) {
        const nameParts = nameEntity.value.toLowerCase().split(/\s+/);
        for (const part of nameParts) {
          if (recordText.includes(part)) {
            score += 1;
          }
        }
      }

      return { record, score };
    });

    // Sort by score and return top match
    scored.sort((a, b) => b.score - a.score);
    
    if (scored[0].score > 0) {
      return scored[0].record;
    }

    return this.allRecords[0];
  }

  /**
   * Build relationships between entities
   */
  private buildRelationships(): Relationship[] {
    const relationships: Relationship[] = [];

    // Group records by common identifiers
    const byPhone = new Map<string, DiscoveredRecord[]>();
    const byEmail = new Map<string, DiscoveredRecord[]>();
    const byAddress = new Map<string, DiscoveredRecord[]>();

    for (const record of this.allRecords) {
      const r = record.record;
      
      // Find phone fields
      for (const [key, value] of Object.entries(r)) {
        const lowerKey = key.toLowerCase();
        if ((lowerKey.includes('phone') || lowerKey.includes('mobile')) && value) {
          const phone = String(value).replace(/[^0-9]/g, '');
          if (phone.length >= 10) {
            if (!byPhone.has(phone)) byPhone.set(phone, []);
            byPhone.get(phone)!.push(record);
          }
        }
        
        if (lowerKey.includes('email') && value) {
          const email = String(value).toLowerCase();
          if (!byEmail.has(email)) byEmail.set(email, []);
          byEmail.get(email)!.push(record);
        }

        if ((lowerKey.includes('address') || lowerKey.includes('city')) && value) {
          const address = String(value).toLowerCase();
          if (!byAddress.has(address)) byAddress.set(address, []);
          byAddress.get(address)!.push(record);
        }
      }
    }

    // Create relationships from shared identifiers
    for (const [phone, records] of byPhone) {
      if (records.length > 1) {
        for (let i = 0; i < records.length - 1; i++) {
          relationships.push({
            from: String(records[i].record.id || records[i].record.name || 'Unknown'),
            to: String(records[i + 1].record.id || records[i + 1].record.name || 'Unknown'),
            type: 'shared_phone',
            evidence: `Both share phone: ${phone}`,
            confidence: 0.9,
          });
        }
      }
    }

    for (const [email, records] of byEmail) {
      if (records.length > 1) {
        for (let i = 0; i < records.length - 1; i++) {
          relationships.push({
            from: String(records[i].record.id || records[i].record.name || 'Unknown'),
            to: String(records[i + 1].record.id || records[i + 1].record.name || 'Unknown'),
            type: 'shared_email',
            evidence: `Both share email: ${email}`,
            confidence: 0.95,
          });
        }
      }
    }

    for (const [address, records] of byAddress) {
      if (records.length > 1) {
        for (let i = 0; i < records.length - 1; i++) {
          relationships.push({
            from: String(records[i].record.id || records[i].record.name || 'Unknown'),
            to: String(records[i + 1].record.id || records[i + 1].record.name || 'Unknown'),
            type: 'shared_address',
            evidence: `Both share address/city: ${address}`,
            confidence: 0.7,
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Build timeline from records
   */
  private buildTimeline(): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const discovered of this.allRecords) {
      const record = discovered.record;
      
      // Look for date fields
      for (const [key, value] of Object.entries(record)) {
        const lowerKey = key.toLowerCase();
        if ((lowerKey.includes('date') || lowerKey.includes('time') || lowerKey === 'updated_at' || lowerKey === 'created_at') && value) {
          const dateStr = String(value);
          if (dateStr && dateStr !== 'null' && dateStr !== 'undefined') {
            events.push({
              date: dateStr,
              event: `${discovered.sourceTable} record ${record.id || ''}`,
              source: discovered.sourceTable,
              details: record,
            });
          }
        }
      }
    }

    // Sort by date
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return events;
  }

  /**
   * Generate insights and summary using AI
   */
  private async generateInsights(
    query: string, 
    primarySubject: DiscoveredRecord | null
  ): Promise<{ insights: string[]; summary: string }> {
    const insights: string[] = [];

    // Statistical insights
    const tablesSearched = [...new Set(this.allRecords.map(r => r.sourceTable))];
    insights.push(`Found ${this.allRecords.length} records across ${tablesSearched.length} tables: ${tablesSearched.join(', ')}`);

    // Entity insights
    const phoneEntities = this.entities.filter(e => e.type === 'phone');
    const emailEntities = this.entities.filter(e => e.type === 'email');
    const addressEntities = this.entities.filter(e => e.type === 'address' || e.type === 'city');

    if (phoneEntities.length > 1) {
      insights.push(`Discovered ${phoneEntities.length} phone numbers associated with this query`);
    }
    if (emailEntities.length > 1) {
      insights.push(`Found ${emailEntities.length} email addresses in related records`);
    }
    if (addressEntities.length > 0) {
      insights.push(`Identified ${addressEntities.length} locations/addresses: ${addressEntities.map(e => e.value).join(', ')}`);
    }

    // Relationship insights
    const relationships = this.buildRelationships();
    const sharedPhones = relationships.filter(r => r.type === 'shared_phone').length;
    const sharedEmails = relationships.filter(r => r.type === 'shared_email').length;

    if (sharedPhones > 0) {
      insights.push(`Found ${sharedPhones} instances of shared phone numbers between records`);
    }
    if (sharedEmails > 0) {
      insights.push(`Found ${sharedEmails} instances of shared email addresses between records`);
    }

    // Generate summary using AI if available
    let summary = '';
    if (this.zai && primarySubject) {
      try {
        const context = `
Query: ${query}
Primary Subject: ${JSON.stringify(primarySubject.record, null, 2)}
Related Records: ${this.allRecords.length}
Tables Searched: ${tablesSearched.join(', ')}
Entities Found: ${this.entities.map(e => `${e.type}:${e.value}`).join(', ')}
        `.trim();

        const completion = await this.zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'You are an investigation assistant. Summarize the findings in a clear, concise manner for an investigating officer. Focus on key facts and potential leads.'
            },
            {
              role: 'user',
              content: `Summarize these investigation findings:\n\n${context}`
            }
          ],
          max_tokens: 500,
        });

        summary = completion.choices[0]?.message?.content || '';
      } catch (error) {
        console.error('Error generating summary:', error);
      }
    }

    if (!summary) {
      summary = `Investigation for "${query}" found ${this.allRecords.length} records across ${tablesSearched.length} tables. ` +
        `Primary subject identified with ${primarySubject?.matchedOn.length || 0} matching identifiers. ` +
        `Discovered ${this.entities.length} entities including ${phoneEntities.length} phone numbers and ${emailEntities.length} email addresses.`;
    }

    return { insights, summary };
  }

  private addStep(
    step: Omit<InvestigationStep, 'id' | 'timestamp'>,
    onProgress?: (step: InvestigationStep) => void
  ): string {
    const id = `step_${this.steps.length + 1}_${Date.now()}`;
    const fullStep: InvestigationStep = {
      ...step,
      id,
      timestamp: new Date(),
    };
    this.steps.push(fullStep);
    onProgress?.(fullStep);
    return id;
  }

  private updateStep(
    id: string,
    updates: Partial<InvestigationStep>,
    onProgress?: (step: InvestigationStep) => void
  ): void {
    const index = this.steps.findIndex(s => s.id === id);
    if (index !== -1) {
      this.steps[index] = { ...this.steps[index], ...updates };
      onProgress?.(this.steps[index]);
    }
  }
}

// Export singleton instance
export const investigationAgent = new InvestigationAgent();
