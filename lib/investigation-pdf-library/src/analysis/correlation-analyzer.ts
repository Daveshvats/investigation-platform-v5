/**
 * Data Correlation Analyzer
 * Core module for entity correlation, relationship detection, and pattern analysis
 */

import {
  BaseEntity,
  Relationship,
  CorrelationConfig,
  CorrelationResult,
  EntityCluster,
  DetectedPattern,
  TimelineEvent,
  CorrelationStatistics,
  EntityType,
  RelationshipType,
  PatternType,
  PatternIndicator,
  Evidence,
} from '../core/types';

import {
  normalizeString,
  calculateStringSimilarity,
  extractEntitiesFromRecord,
  calculateDateProximity,
  generateEntityId,
} from '../utils/helpers';

export class CorrelationAnalyzer {
  private config: CorrelationConfig;
  private entities: Map<string, BaseEntity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private entityIndex: Map<string, Set<string>> = new Map(); // value -> entity IDs

  constructor(config?: Partial<CorrelationConfig>) {
    this.config = {
      minimumConfidence: 0.6,
      maxIterations: 100,
      fuzzyMatchThreshold: 0.85,
      dateToleranceDays: 30,
      addressMatchThreshold: 0.8,
      phoneMatchThreshold: 0.9,
      emailMatchThreshold: 0.95,
      ...config,
    };
  }

  /**
   * Analyze multiple data tables and find correlations
   */
  public async analyze(
    tables: Array<{ name: string; records: Record<string, unknown>[] }>
  ): Promise<CorrelationResult> {
    // Phase 1: Extract entities from all records
    await this.extractEntities(tables);

    // Phase 2: Find relationships between entities
    await this.findRelationships();

    // Phase 3: Build entity clusters
    const clusters = this.buildClusters();

    // Phase 4: Detect patterns
    const patterns = this.detectPatterns();

    // Phase 5: Build timeline
    const timeline = this.buildTimeline();

    // Phase 6: Calculate statistics
    const statistics = this.calculateStatistics();

    return {
      entities: Array.from(this.entities.values()),
      relationships: Array.from(this.relationships.values()),
      clusters,
      patterns,
      timeline,
      statistics,
    };
  }

  /**
   * Extract entities from data records
   */
  private async extractEntities(
    tables: Array<{ name: string; records: Record<string, unknown>[] }>
  ): Promise<void> {
    for (const table of tables) {
      for (const record of table.records) {
        const extractedEntities = extractEntitiesFromRecord(record, table.name);
        
        for (const entity of extractedEntities) {
          // Check for potential duplicates
          const existingEntity = this.findPotentialDuplicate(entity);
          
          if (existingEntity) {
            // Merge attributes
            this.mergeEntityAttributes(existingEntity, entity);
          } else {
            // Add new entity
            this.entities.set(entity.id, entity);
            this.indexEntity(entity);
          }
        }
      }
    }
  }

  /**
   * Index entity for quick lookup
   */
  private indexEntity(entity: BaseEntity): void {
    // Index by name
    if (entity.name) {
      const normalized = normalizeString(entity.name);
      if (!this.entityIndex.has(normalized)) {
        this.entityIndex.set(normalized, new Set());
      }
      this.entityIndex.get(normalized)!.add(entity.id);
    }

    // Index by key attributes
    for (const [key, value] of Object.entries(entity.attributes)) {
      if (typeof value === 'string' && value.length > 0) {
        const normalized = normalizeString(value);
        const indexKey = `${key}:${normalized}`;
        if (!this.entityIndex.has(indexKey)) {
          this.entityIndex.set(indexKey, new Set());
        }
        this.entityIndex.get(indexKey)!.add(entity.id);
      }
    }
  }

  /**
   * Find potential duplicate entity
   */
  private findPotentialDuplicate(entity: BaseEntity): BaseEntity | null {
    const normalized = normalizeString(entity.name);
    const candidates = this.entityIndex.get(normalized);

    if (!candidates) return null;

    for (const candidateId of candidates) {
      const candidate = this.entities.get(candidateId);
      if (candidate && candidate.type === entity.type) {
        const similarity = calculateStringSimilarity(entity.name, candidate.name);
        if (similarity >= this.config.fuzzyMatchThreshold) {
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Merge attributes from source entity into target
   */
  private mergeEntityAttributes(target: BaseEntity, source: BaseEntity): void {
    for (const [key, value] of Object.entries(source.attributes)) {
      if (!(key in target.attributes)) {
        target.attributes[key] = value;
      }
    }
    
    if (source.aliases) {
      target.aliases = [...new Set([...(target.aliases || []), ...source.aliases])];
    }
    
    if (source.sources) {
      target.sources = [...new Set([...(target.sources || []), ...source.sources])];
    }
  }

  /**
   * Find relationships between entities
   */
  private async findRelationships(): Promise<void> {
    const entityList = Array.from(this.entities.values());

    // Find direct relationships (same field values)
    for (let i = 0; i < entityList.length; i++) {
      for (let j = i + 1; j < entityList.length; j++) {
        const relationships = this.findRelationshipsBetween(
          entityList[i],
          entityList[j]
        );
        
        for (const rel of relationships) {
          if (rel.strength >= this.config.minimumConfidence) {
            this.relationships.set(rel.id, rel);
          }
        }
      }
    }

    // Find transitive relationships
    await this.findTransitiveRelationships();
  }

  /**
   * Find relationships between two entities
   */
  private findRelationshipsBetween(
    entity1: BaseEntity,
    entity2: BaseEntity
  ): Relationship[] {
    const relationships: Relationship[] = [];

    // Address sharing
    if (entity1.type === 'person' && entity2.type === 'person') {
      const addr1 = entity1.attributes.address as string;
      const addr2 = entity2.attributes.address as string;
      
      if (addr1 && addr2) {
        const similarity = calculateStringSimilarity(addr1, addr2);
        if (similarity >= this.config.addressMatchThreshold) {
          relationships.push({
            id: generateEntityId(),
            sourceId: entity1.id,
            targetId: entity2.id,
            type: 'shared_address',
            strength: similarity,
            attributes: { sharedValue: addr1 },
          });
        }
      }
    }

    // Phone sharing
    const phone1 = entity1.attributes.phone as string;
    const phone2 = entity2.attributes.phone as string;
    if (phone1 && phone2 && this.phonesMatch(phone1, phone2)) {
      relationships.push({
        id: generateEntityId(),
        sourceId: entity1.id,
        targetId: entity2.id,
        type: 'shared_contact',
        strength: 0.95,
        attributes: { sharedValue: phone1 },
      });
    }

    // Email sharing
    const email1 = entity1.attributes.email as string;
    const email2 = entity2.attributes.email as string;
    if (email1 && email2 && this.emailsMatch(email1, email2)) {
      relationships.push({
        id: generateEntityId(),
        sourceId: entity1.id,
        targetId: entity2.id,
        type: 'shared_contact',
        strength: 0.99,
        attributes: { sharedValue: email1 },
      });
    }

    // Company associations
    if (entity1.type === 'person' && entity2.type === 'company') {
      const companyAssoc = entity1.attributes.company as string;
      if (companyAssoc && this.namesMatch(companyAssoc, entity2.name)) {
        relationships.push({
          id: generateEntityId(),
          sourceId: entity1.id,
          targetId: entity2.id,
          type: 'employed_by',
          strength: 0.85,
          attributes: { role: entity1.attributes.designation },
        });
      }
    }

    // Financial links
    const bankAcc1 = entity1.attributes.bankAccount as string;
    const bankAcc2 = entity2.attributes.bankAccount as string;
    if (bankAcc1 && bankAcc2 && bankAcc1 === bankAcc2) {
      relationships.push({
        id: generateEntityId(),
        sourceId: entity1.id,
        targetId: entity2.id,
        type: 'financial_link',
        strength: 0.99,
        attributes: { sharedValue: bankAcc1 },
      });
    }

    return relationships;
  }

  /**
   * Find transitive relationships through intermediate entities
   */
  private async findTransitiveRelationships(): Promise<void> {
    const entityList = Array.from(this.entities.values());
    let iterations = 0;

    while (iterations < this.config.maxIterations) {
      let newRelationshipsFound = 0;
      
      for (const entity of entityList) {
        const directConnections = this.getConnectedEntities(entity.id);
        
        for (const connectedId of directConnections) {
          const secondDegree = this.getConnectedEntities(connectedId);
          
          for (const secondDegreeId of secondDegree) {
            if (secondDegreeId === entity.id) continue;
            
            const existingRel = this.getRelationship(entity.id, secondDegreeId);
            if (!existingRel) {
              // Create suspected link
              const pathStrength = this.calculatePathStrength(entity.id, connectedId, secondDegreeId);
              
              if (pathStrength >= this.config.minimumConfidence) {
                const rel: Relationship = {
                  id: generateEntityId(),
                  sourceId: entity.id,
                  targetId: secondDegreeId,
                  type: 'suspected_link',
                  strength: pathStrength * 0.7, // Reduce confidence for indirect links
                  attributes: { 
                    connectionPath: [entity.id, connectedId, secondDegreeId],
                    isTransitive: true,
                  },
                };
                this.relationships.set(rel.id, rel);
                newRelationshipsFound++;
              }
            }
          }
        }
      }

      if (newRelationshipsFound === 0) break;
      iterations++;
    }
  }

  /**
   * Build entity clusters based on relationships
   */
  private buildClusters(): EntityCluster[] {
    const clusters: EntityCluster[] = [];
    const visited = new Set<string>();
    let clusterId = 1;

    for (const entity of this.entities.values()) {
      if (visited.has(entity.id)) continue;

      const clusterEntities = this.expandCluster(entity.id, visited);
      
      if (clusterEntities.length > 1) {
        const clusterType = this.determineClusterType(clusterEntities);
        const strength = this.calculateClusterStrength(clusterEntities);
        
        clusters.push({
          id: `cluster-${clusterId++}`,
          name: this.generateClusterName(clusterEntities),
          entities: clusterEntities,
          clusterType,
          strength,
          summary: this.generateClusterSummary(clusterEntities),
        });
      }
    }

    return clusters.sort((a, b) => b.entities.length - a.entities.length);
  }

  /**
   * Expand cluster from seed entity
   */
  private expandCluster(seedId: string, visited: Set<string>): string[] {
    const cluster: string[] = [];
    const queue = [seedId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      cluster.push(currentId);

      const connections = this.getConnectedEntities(currentId);
      for (const connId of connections) {
        if (!visited.has(connId)) {
          queue.push(connId);
        }
      }
    }

    return cluster;
  }

  /**
   * Detect patterns in data
   */
  private detectPatterns(): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Detect address sharing patterns
    patterns.push(...this.detectAddressSharingPatterns());

    // Detect contact sharing patterns
    patterns.push(...this.detectContactSharingPatterns());

    // Detect suspicious timelines
    patterns.push(...this.detectSuspiciousTimelines());

    // Detect financial anomalies
    patterns.push(...this.detectFinancialAnomalies());

    // Detect potential shell companies
    patterns.push(...this.detectShellCompanyIndicators());

    // Detect circular relationships
    patterns.push(...this.detectCircularRelationships());

    return patterns.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Detect address sharing patterns
   */
  private detectAddressSharingPatterns(): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const addressGroups = new Map<string, string[]>();

    for (const entity of this.entities.values()) {
      const address = entity.attributes.address as string;
      if (address) {
        const normalized = normalizeString(address);
        if (!addressGroups.has(normalized)) {
          addressGroups.set(normalized, []);
        }
        addressGroups.get(normalized)!.push(entity.id);
      }
    }

    for (const [address, entityIds] of addressGroups) {
      if (entityIds.length >= 3) {
        const entities = entityIds.map(id => this.entities.get(id)!);
        const personCount = entities.filter(e => e.type === 'person').length;
        const companyCount = entities.filter(e => e.type === 'company').length;

        patterns.push({
          id: generateEntityId(),
          type: 'address_sharing',
          severity: entityIds.length >= 5 ? 'high' : 'medium',
          confidence: 0.9,
          entities: entityIds,
          description: `${entityIds.length} entities (${personCount} persons, ${companyCount} companies) share the same address: ${address}`,
          indicators: [
            {
              name: 'entity_count',
              value: entityIds.length,
              threshold: 3,
              weight: 0.5,
              description: 'Number of entities at same address',
            },
            {
              name: 'entity_diversity',
              value: personCount > 0 && companyCount > 0,
              threshold: true,
              weight: 0.3,
              description: 'Mix of persons and companies',
            },
          ],
          recommendations: [
            'Verify if this is a legitimate shared office or residential building',
            'Check if companies are operating from residential addresses',
            'Investigate potential shell company indicators',
          ],
        });
      }
    }

    return patterns;
  }

  /**
   * Detect contact sharing patterns
   */
  private detectContactSharingPatterns(): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const contactGroups = new Map<string, { type: string; entities: string[] }>();

    for (const entity of this.entities.values()) {
      const phone = entity.attributes.phone as string;
      const email = entity.attributes.email as string;

      if (phone) {
        const key = `phone:${normalizeString(phone)}`;
        if (!contactGroups.has(key)) {
          contactGroups.set(key, { type: 'phone', entities: [] });
        }
        contactGroups.get(key)!.entities.push(entity.id);
      }

      if (email) {
        const key = `email:${normalizeString(email)}`;
        if (!contactGroups.has(key)) {
          contactGroups.set(key, { type: 'email', entities: [] });
        }
        contactGroups.get(key)!.entities.push(entity.id);
      }
    }

    for (const [key, { type, entities }] of contactGroups) {
      if (entities.length >= 2) {
        const value = key.split(':')[1];
        patterns.push({
          id: generateEntityId(),
          type: 'contact_sharing',
          severity: entities.length >= 3 ? 'high' : 'medium',
          confidence: 0.95,
          entities,
          description: `${entities.length} entities share the same ${type}: ${value}`,
          indicators: [
            {
              name: 'shared_contact_count',
              value: entities.length,
              threshold: 2,
              weight: 0.7,
              description: `Number of entities sharing ${type}`,
            },
          ],
          recommendations: [
            'Verify if this represents a legitimate business relationship',
            'Check for potential identity confusion or data entry errors',
            'Investigate if entities are truly distinct',
          ],
        });
      }
    }

    return patterns;
  }

  /**
   * Detect suspicious timeline patterns
   */
  private detectSuspiciousTimelines(): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const entity of this.entities.values()) {
      const createdAt = entity.attributes.createdAt as Date;
      const updatedAt = entity.attributes.updatedAt as Date;

      if (createdAt && updatedAt) {
        const daysDiff = Math.abs(
          (updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Rapid updates in short period
        if (daysDiff < 7 && daysDiff > 0) {
          patterns.push({
            id: generateEntityId(),
            type: 'suspicious_timeline',
            severity: 'low',
            confidence: 0.6,
            entities: [entity.id],
            description: `Entity ${entity.name} was updated ${Math.round(daysDiff)} days after creation`,
            indicators: [
              {
                name: 'update_frequency',
                value: daysDiff,
                threshold: 7,
                weight: 0.4,
                description: 'Days between creation and last update',
              },
            ],
            recommendations: ['Review recent changes for data accuracy'],
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Detect financial anomalies
   */
  private detectFinancialAnomalies(): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Look for entities with multiple bank accounts
    const bankAccountOwners = new Map<string, string[]>();
    for (const entity of this.entities.values()) {
      const bankAccount = entity.attributes.bankAccount as string;
      if (bankAccount) {
        if (!bankAccountOwners.has(bankAccount)) {
          bankAccountOwners.set(bankAccount, []);
        }
        bankAccountOwners.get(bankAccount)!.push(entity.id);
      }
    }

    for (const [account, entityIds] of bankAccountOwners) {
      if (entityIds.length >= 2) {
        patterns.push({
          id: generateEntityId(),
          type: 'financial_anomaly',
          severity: 'high',
          confidence: 0.95,
          entities: entityIds,
          description: `${entityIds.length} entities are linked to the same bank account: ${account}`,
          indicators: [
            {
              name: 'shared_account',
              value: entityIds.length,
              threshold: 2,
              weight: 0.9,
              description: 'Multiple entities with same bank account',
            },
          ],
          recommendations: [
            'Verify authorized signatories for this account',
            'Investigate relationship between account holders',
            'Check for potential fraud indicators',
          ],
        });
      }
    }

    return patterns;
  }

  /**
   * Detect shell company indicators
   */
  private detectShellCompanyIndicators(): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const entity of this.entities.values()) {
      if (entity.type !== 'company') continue;

      const indicators: PatternIndicator[] = [];
      let totalWeight = 0;

      // Check for shared address with many entities
      const address = entity.attributes.address as string;
      if (address) {
        const normalized = normalizeString(address);
        const entitiesAtAddress = this.entitiesAtAddress(normalized);
        if (entitiesAtAddress.length >= 5) {
          indicators.push({
            name: 'high_density_address',
            value: entitiesAtAddress.length,
            threshold: 5,
            weight: 0.3,
            description: 'Many entities registered at same address',
          });
          totalWeight += 0.3;
        }
      }

      // Check for shared contacts
      const phone = entity.attributes.phone as string;
      const email = entity.attributes.email as string;
      if (phone || email) {
        const sharedContactEntities = this.entitiesWithSharedContact(phone, email);
        if (sharedContactEntities.length >= 2) {
          indicators.push({
            name: 'shared_contacts',
            value: sharedContactEntities.length,
            threshold: 2,
            weight: 0.25,
            description: 'Contact details shared with other entities',
          });
          totalWeight += 0.25;
        }
      }

      // Check for lack of digital presence
      const website = entity.attributes.website as string;
      if (!website) {
        indicators.push({
          name: 'no_website',
          value: false,
          threshold: true,
          weight: 0.1,
          description: 'No website registered',
        });
        totalWeight += 0.1;
      }

      if (totalWeight >= 0.4) {
        patterns.push({
          id: generateEntityId(),
          type: 'shell_company_indicator',
          severity: totalWeight >= 0.6 ? 'high' : 'medium',
          confidence: totalWeight,
          entities: [entity.id],
          description: `Company ${entity.name} shows shell company indicators`,
          indicators,
          recommendations: [
            'Verify actual business operations at registered address',
            'Check financial activity and tax filings',
            'Investigate beneficial ownership structure',
            'Review any related party transactions',
          ],
        });
      }
    }

    return patterns;
  }

  /**
   * Detect circular relationships
   */
  private detectCircularRelationships(): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const entity of this.entities.values()) {
      const cycles = this.findCyclesFromEntity(entity.id, 4);
      
      for (const cycle of cycles) {
        patterns.push({
          id: generateEntityId(),
          type: 'circular_transaction',
          severity: 'high',
          confidence: 0.85,
          entities: cycle,
          description: `Circular relationship detected involving ${cycle.length} entities`,
          indicators: [
            {
              name: 'cycle_length',
              value: cycle.length,
              threshold: 3,
              weight: 0.6,
              description: 'Number of entities in circular relationship',
            },
          ],
          recommendations: [
            'Investigate transaction flows in this network',
            'Check for potential round-tripping',
            'Analyze timing of related transactions',
          ],
        });
      }
    }

    return patterns;
  }

  /**
   * Build timeline of events
   */
  private buildTimeline(): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const entity of this.entities.values()) {
      const createdAt = entity.attributes.createdAt as Date || 
                        entity.attributes.OPEN_DATE as Date ||
                        entity.attributes.openDate as Date;
      
      if (createdAt) {
        events.push({
          id: generateEntityId(),
          timestamp: new Date(createdAt),
          type: 'registration',
          title: `${entity.type === 'company' ? 'Company' : 'Entity'} registered: ${entity.name}`,
          description: `${entity.name} was registered/created`,
          entities: [entity.id],
          importance: 'medium',
          sources: entity.sources || ['Database'],
        });
      }

      // Add relationship establishment events
      for (const rel of this.relationships.values()) {
        if (rel.sourceId === entity.id && rel.firstObserved) {
          events.push({
            id: generateEntityId(),
            timestamp: rel.firstObserved,
            type: 'contact_established',
            title: `Relationship established: ${rel.type}`,
            description: `Connection between entities detected`,
            entities: [rel.sourceId, rel.targetId],
            importance: rel.strength >= 0.8 ? 'high' : 'medium',
            sources: rel.evidence?.map(e => e.reference) || ['Analysis'],
          });
        }
      }
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Calculate correlation statistics
   */
  private calculateStatistics(): CorrelationStatistics {
    const entitiesByType: Record<EntityType, number> = {} as Record<EntityType, number>;
    const relationshipsByType: Record<RelationshipType, number> = {} as Record<RelationshipType, number>;

    for (const entity of this.entities.values()) {
      entitiesByType[entity.type] = (entitiesByType[entity.type] || 0) + 1;
    }

    for (const rel of this.relationships.values()) {
      relationshipsByType[rel.type] = (relationshipsByType[rel.type] || 0) + 1;
    }

    const connectionsPerEntity = Array.from(this.entities.values()).map(
      e => this.getConnectedEntities(e.id).length
    );

    const clusters = this.buildClusters();

    return {
      totalEntities: this.entities.size,
      totalRelationships: this.relationships.size,
      entitiesByType,
      relationshipsByType,
      averageConnectionsPerEntity: connectionsPerEntity.length > 0
        ? connectionsPerEntity.reduce((a, b) => a + b, 0) / connectionsPerEntity.length
        : 0,
      maxClusterSize: clusters.length > 0 ? clusters[0].entities.length : 0,
      patternsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      dataQualityScore: this.calculateDataQualityScore(),
      coverageScore: this.calculateCoverageScore(),
    };
  }

  // Helper methods
  private phonesMatch(phone1: string, phone2: string): boolean {
    const normalize = (p: string) => p.replace(/[^0-9]/g, '').slice(-10);
    return normalize(phone1) === normalize(phone2);
  }

  private emailsMatch(email1: string, email2: string): boolean {
    return normalizeString(email1) === normalizeString(email2);
  }

  private namesMatch(name1: string, name2: string): boolean {
    return calculateStringSimilarity(name1, name2) >= this.config.fuzzyMatchThreshold;
  }

  private getConnectedEntities(entityId: string): string[] {
    const connected = new Set<string>();
    for (const rel of this.relationships.values()) {
      if (rel.sourceId === entityId) connected.add(rel.targetId);
      if (rel.targetId === entityId) connected.add(rel.sourceId);
    }
    return Array.from(connected);
  }

  private getRelationship(entity1: string, entity2: string): Relationship | undefined {
    for (const rel of this.relationships.values()) {
      if (
        (rel.sourceId === entity1 && rel.targetId === entity2) ||
        (rel.sourceId === entity2 && rel.targetId === entity1)
      ) {
        return rel;
      }
    }
    return undefined;
  }

  private calculatePathStrength(id1: string, id2: string, id3: string): number {
    const rel1 = this.getRelationship(id1, id2);
    const rel2 = this.getRelationship(id2, id3);
    return Math.min(rel1?.strength || 0, rel2?.strength || 0);
  }

  private determineClusterType(entityIds: string[]): EntityCluster['clusterType'] {
    const entities = entityIds.map(id => this.entities.get(id)!);
    const types = new Set(entities.map(e => e.type));
    
    if (types.size === 1) {
      const type = Array.from(types)[0];
      if (type === 'person') return 'person_network';
      if (type === 'company') return 'company_network';
      if (type === 'address') return 'address_group';
    }
    return 'mixed';
  }

  private calculateClusterStrength(entityIds: string[]): number {
    let totalStrength = 0;
    let count = 0;
    
    for (let i = 0; i < entityIds.length; i++) {
      for (let j = i + 1; j < entityIds.length; j++) {
        const rel = this.getRelationship(entityIds[i], entityIds[j]);
        if (rel) {
          totalStrength += rel.strength;
          count++;
        }
      }
    }
    
    return count > 0 ? totalStrength / count : 0;
  }

  private generateClusterName(entityIds: string[]): string {
    const entities = entityIds.map(id => this.entities.get(id)!);
    const firstEntity = entities[0];
    
    if (entities.length <= 3) {
      return entities.map(e => e.name).join(' - ');
    }
    
    return `${firstEntity.name} Network (${entities.length} entities)`;
  }

  private generateClusterSummary(entityIds: string[]): string {
    const entities = entityIds.map(id => this.entities.get(id)!);
    const types = entities.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const typeDescriptions = Object.entries(types)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');

    return `Cluster contains ${typeDescriptions} with shared connections`;
  }

  private entitiesAtAddress(normalizedAddress: string): string[] {
    const result: string[] = [];
    for (const entity of this.entities.values()) {
      const address = entity.attributes.address as string;
      if (address && normalizeString(address) === normalizedAddress) {
        result.push(entity.id);
      }
    }
    return result;
  }

  private entitiesWithSharedContact(phone?: string, email?: string): string[] {
    const result: string[] = [];
    for (const entity of this.entities.values()) {
      const ePhone = entity.attributes.phone as string;
      const eEmail = entity.attributes.email as string;
      if (
        (phone && this.phonesMatch(phone, ePhone)) ||
        (email && this.emailsMatch(email, eEmail))
      ) {
        result.push(entity.id);
      }
    }
    return result;
  }

  private findCyclesFromEntity(startId: string, maxLength: number): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    
    const dfs = (currentId: string, path: string[]): void => {
      if (path.length > maxLength) return;
      
      visited.add(currentId);
      
      const connections = this.getConnectedEntities(currentId);
      for (const nextId of connections) {
        if (nextId === startId && path.length >= 2) {
          cycles.push([...path, nextId]);
        } else if (!visited.has(nextId)) {
          dfs(nextId, [...path, nextId]);
        }
      }
      
      visited.delete(currentId);
    };
    
    dfs(startId, [startId]);
    return cycles;
  }

  private calculateDataQualityScore(): number {
    let totalScore = 0;
    let count = 0;

    for (const entity of this.entities.values()) {
      const attrCount = Object.keys(entity.attributes).length;
      const hasName = entity.name ? 1 : 0;
      const score = (attrCount / 10 + hasName) / 2;
      totalScore += score;
      count++;
    }

    return count > 0 ? totalScore / count : 0;
  }

  private calculateCoverageScore(): number {
    const entitiesWithRelationships = Array.from(this.entities.values())
      .filter(e => this.getConnectedEntities(e.id).length > 0).length;
    
    return this.entities.size > 0 
      ? entitiesWithRelationships / this.entities.size 
      : 0;
  }
}

export default CorrelationAnalyzer;
