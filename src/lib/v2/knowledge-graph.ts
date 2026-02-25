/**
 * Knowledge Graph V2
 * Graph construction, entity resolution, and relationship inference
 * Implements 2026 research on knowledge graph construction
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  EntityType,
  Relationship,
  RelationshipType,
  RelationshipStrength,
  GraphNode,
  GraphEdge,
  GraphCluster,
  KnowledgeGraph,
  GraphMetadata,
  RelationshipEvidence,
} from './types';

// ============================================================================
// ENTITY RESOLUTION
// ============================================================================

interface BlockingKey {
  key: string;
  entities: string[];
}

interface SimilarityScore {
  entityId1: string;
  entityId2: string;
  score: number;
  reasons: string[];
}

export class EntityResolver {
  private similarityThreshold: number;
  private blockingEnabled: boolean;

  constructor(similarityThreshold: number = 0.85, blockingEnabled: boolean = true) {
    this.similarityThreshold = similarityThreshold;
    this.blockingEnabled = blockingEnabled;
  }

  /**
   * Resolve entities - identify duplicates and merge
   */
  async resolve(entities: Entity[]): Promise<Map<string, string[]>> {
    const clusters = new Map<string, string[]>();

    if (entities.length === 0) return clusters;

    // Create blocking keys for efficient comparison
    const blockingKeys = this.blockingEnabled
      ? this.createBlockingKeys(entities)
      : [{ key: 'all', entities: entities.map(e => e.id) }];

    // Compare entities within each block
    for (const block of blockingKeys) {
      const blockEntities = entities.filter(e => block.entities.includes(e.id));

      for (let i = 0; i < blockEntities.length; i++) {
        for (let j = i + 1; j < blockEntities.length; j++) {
          const similarity = this.calculateSimilarity(blockEntities[i], blockEntities[j]);

          if (similarity.score >= this.similarityThreshold) {
            // Add to cluster
            const clusterKey = this.findOrCreateCluster(clusters, blockEntities[i].id, blockEntities[j].id);
            this.addToCluster(clusters, clusterKey, [blockEntities[i].id, blockEntities[j].id]);
          }
        }
      }
    }

    return clusters;
  }

  /**
   * Create blocking keys for efficient entity comparison
   */
  private createBlockingKeys(entities: Entity[]): BlockingKey[] {
    const keyMap = new Map<string, string[]>();

    for (const entity of entities) {
      // Create multiple blocking keys
      const keys = this.generateBlockingKeys(entity);

      for (const key of keys) {
        if (!keyMap.has(key)) {
          keyMap.set(key, []);
        }
        keyMap.get(key)!.push(entity.id);
      }
    }

    return Array.from(keyMap.entries()).map(([key, entities]) => ({ key, entities }));
  }

  /**
   * Generate blocking keys for an entity
   */
  private generateBlockingKeys(entity: Entity): string[] {
    const keys: string[] = [];

    // Type-based blocking
    keys.push(`type:${entity.type}`);

    // First few characters (for similar values)
    if (entity.normalizedValue.length >= 2) {
      keys.push(`prefix:${entity.type}:${entity.normalizedValue.substring(0, 2)}`);
    }

    // Phonetic blocking for names
    if (entity.type === 'name' || entity.type === 'organization') {
      const phonetic = this.phoneticEncode(entity.normalizedValue);
      keys.push(`phonetic:${phonetic}`);
    }

    // Length-based blocking
    const len = Math.floor(entity.normalizedValue.length / 5);
    keys.push(`length:${entity.type}:${len}`);

    return keys;
  }

  /**
   * Calculate similarity between two entities
   */
  private calculateSimilarity(entity1: Entity, entity2: Entity): SimilarityScore {
    const reasons: string[] = [];
    let score = 0;

    // Must be same type
    if (entity1.type !== entity2.type) {
      return { entityId1: entity1.id, entityId2: entity2.id, score: 0, reasons: ['different_type'] };
    }

    // Exact match
    if (entity1.normalizedValue === entity2.normalizedValue) {
      return { entityId1: entity1.id, entityId2: entity2.id, score: 1, reasons: ['exact_match'] };
    }

    // String similarity
    const stringSim = this.stringSimilarity(entity1.normalizedValue, entity2.normalizedValue);
    if (stringSim > 0.8) {
      score += stringSim * 0.6;
      reasons.push(`string_similarity:${stringSim.toFixed(2)}`);
    }

    // Phonetic similarity for names
    if (entity.type === 'name' || entity.type === 'organization') {
      const phonetic1 = this.phoneticEncode(entity1.normalizedValue);
      const phonetic2 = this.phoneticEncode(entity2.normalizedValue);
      if (phonetic1 === phonetic2) {
        score += 0.3;
        reasons.push('phonetic_match');
      }
    }

    // Alias match
    if (entity1.aliases?.some(a => entity2.normalizedValue.includes(a)) ||
        entity2.aliases?.some(a => entity1.normalizedValue.includes(a))) {
      score += 0.2;
      reasons.push('alias_match');
    }

    // Context similarity
    if (entity1.metadata?.context && entity2.metadata?.context) {
      const contextSim = this.stringSimilarity(
        entity1.metadata.context as string,
        entity2.metadata.context as string
      );
      if (contextSim > 0.5) {
        score += 0.1;
        reasons.push(`context_similarity:${contextSim.toFixed(2)}`);
      }
    }

    return { entityId1: entity1.id, entityId2: entity2.id, score, reasons };
  }

  /**
   * Calculate string similarity (Levenshtein-based)
   */
  private stringSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    return 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Phonetic encoding (Soundex-like)
   */
  private phoneticEncode(str: string): string {
    const s = str.toLowerCase();
    let result = s[0] || '';

    const mapping: Record<string, string> = {
      'b': '1', 'p': '1', 'bh': '1',
      'c': '2', 'k': '2', 'q': '2', 'ch': '2',
      'd': '3', 't': '3', 'dh': '3', 'th': '3',
      'l': '4',
      'm': '5', 'n': '5',
      'r': '6',
      's': '7', 'sh': '7',
      'v': '8', 'w': '8',
      'j': '9', 'g': '9', 'z': '9',
    };

    let i = 1;
    while (i < s.length) {
      const twoChar = s.substring(i, i + 2);
      const oneChar = s[i];

      if (mapping[twoChar]) {
        result += mapping[twoChar];
        i += 2;
      } else if (mapping[oneChar]) {
        result += mapping[oneChar];
        i += 1;
      } else {
        i += 1;
      }
    }

    return result;
  }

  /**
   * Find or create cluster for entity pair
   */
  private findOrCreateCluster(
    clusters: Map<string, string[]>,
    id1: string,
    id2: string
  ): string {
    for (const [key, ids] of clusters) {
      if (ids.includes(id1) || ids.includes(id2)) {
        return key;
      }
    }
    return uuidv4();
  }

  /**
   * Add entities to cluster
   */
  private addToCluster(
    clusters: Map<string, string[]>,
    clusterKey: string,
    ids: string[]
  ): void {
    const existing = clusters.get(clusterKey) || [];
    const merged = [...new Set([...existing, ...ids])];
    clusters.set(clusterKey, merged);
  }
}

// ============================================================================
// RELATIONSHIP INFERENCE
// ============================================================================

interface RelationshipPattern {
  type: RelationshipType;
  patterns: RegExp[];
  extractEntities: (match: RegExpMatchArray, text: string) => { source: string; target: string };
  strength: RelationshipStrength;
}

const RELATIONSHIP_PATTERNS: RelationshipPattern[] = [
  {
    type: 'family',
    patterns: [
      /(\w+)\s+(?:is\s+)?(?:the\s+)?(?:son|daughter|father|mother|brother|sister|husband|wife|cousin|uncle|aunt)\s+(?:of|to)\s+(\w+)/gi,
      /(\w+)'s\s+(?:son|daughter|father|mother|brother|sister|husband|wife)/gi,
    ],
    extractEntities: (match) => ({ source: match[1], target: match[2] || match[1] }),
    strength: 'strong',
  },
  {
    type: 'financial',
    patterns: [
      /(\w+)\s+(?:transferred?|sent|paid)\s+(?:Rs\.?|INR|₹)?\s*[\d,]+\s*(?:to|for)\s+(\w+)/gi,
      /(\w+)\s+(?:received?|got)\s+(?:Rs\.?|INR|₹)?\s*[\d,]+\s*(?:from|by)\s+(\w+)/gi,
      /transaction\s+(?:from|by)\s+(\w+)\s+(?:to)\s+(\w+)/gi,
    ],
    extractEntities: (match) => ({ source: match[1], target: match[2] }),
    strength: 'strong',
  },
  {
    type: 'communication',
    patterns: [
      /(\w+)\s+(?:called|phoned|contacted|emailed)\s+(\w+)/gi,
      /call\s+(?:between|from)\s+(\w+)\s+(?:and|to)\s+(\w+)/gi,
      /(\w+)\s+(?:and|&)\s+(\w+)\s+(?:exchanged|had)\s+(?:calls?|messages?)/gi,
    ],
    extractEntities: (match) => ({ source: match[1], target: match[2] }),
    strength: 'moderate',
  },
  {
    type: 'location',
    patterns: [
      /(\w+)\s+(?:lives?|resides?|stays?|located)\s+(?:in|at)\s+(\w+)/gi,
      /(\w+)'s\s+(?:address|location|residence)\s+(?:is|in)\s+(\w+)/gi,
    ],
    extractEntities: (match) => ({ source: match[1], target: match[2] }),
    strength: 'moderate',
  },
  {
    type: 'employment',
    patterns: [
      /(\w+)\s+(?:works?|employed|working)\s+(?:at|for|in)\s+(\w+)/gi,
      /(\w+)\s+(?:is|was)\s+(?:an?\s+)?(?:employee|staff|worker)\s+(?:at|of)\s+(\w+)/gi,
    ],
    extractEntities: (match) => ({ source: match[1], target: match[2] }),
    strength: 'moderate',
  },
  {
    type: 'ownership',
    patterns: [
      /(\w+)\s+(?:owns?|possesses?|has)\s+(?:a\s+)?(\w+)/gi,
      /(\w+)'s\s+(?:vehicle|car|property|house|account)/gi,
    ],
    extractEntities: (match) => ({ source: match[1], target: match[2] }),
    strength: 'strong',
  },
];

export class RelationshipInferrer {
  /**
   * Infer relationships from text
   */
  inferFromText(text: string, entities: Entity[]): Relationship[] {
    const relationships: Relationship[] = [];
    const entityMap = new Map(entities.map(e => [e.normalizedValue.toLowerCase(), e]));

    for (const pattern of RELATIONSHIP_PATTERNS) {
      for (const regex of pattern.patterns) {
        const matches = text.matchAll(regex);

        for (const match of matches) {
          const { source, target } = pattern.extractEntities(match, text);

          // Find matching entities
          const sourceEntity = entityMap.get(source.toLowerCase());
          const targetEntity = entityMap.get(target.toLowerCase());

          if (sourceEntity && targetEntity) {
            const relationship: Relationship = {
              id: uuidv4(),
              source: sourceEntity.id,
              target: targetEntity.id,
              type: pattern.type,
              strength: pattern.strength,
              confidence: 0.8,
              evidence: [{
                source: 'text_inference',
                context: match[0],
              }],
              firstSeen: new Date(),
              lastSeen: new Date(),
              occurrences: 1,
            };

            relationships.push(relationship);
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Infer relationships from co-occurrence in records
   */
  inferFromCoOccurrence(
    records: Array<{ entities: Entity[]; source: string; timestamp?: Date }>
  ): Relationship[] {
    const relationships: Relationship[] = [];
    const relationshipMap = new Map<string, Relationship>();

    for (const record of records) {
      const entities = record.entities;

      // Create relationships between all entity pairs in same record
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const entity1 = entities[i];
          const entity2 = entities[j];

          // Skip same type entities
          if (entity1.type === entity2.type) continue;

          const key = [entity1.id, entity2.id].sort().join('-');

          if (relationshipMap.has(key)) {
            // Update existing relationship
            const existing = relationshipMap.get(key)!;
            existing.occurrences++;
            existing.lastSeen = record.timestamp || new Date();
            existing.evidence.push({
              source: record.source,
              context: `Co-occurrence in ${record.source}`,
            });
          } else {
            // Create new relationship
            const relationship: Relationship = {
              id: uuidv4(),
              source: entity1.id,
              target: entity2.id,
              type: 'co_occurrence',
              strength: 'weak',
              confidence: 0.5,
              evidence: [{
                source: record.source,
                context: `Co-occurrence in ${record.source}`,
              }],
              firstSeen: record.timestamp || new Date(),
              lastSeen: record.timestamp || new Date(),
              occurrences: 1,
            };

            relationshipMap.set(key, relationship);
          }
        }
      }
    }

    // Convert to array and adjust confidence based on occurrences
    for (const relationship of relationshipMap.values()) {
      relationship.confidence = Math.min(0.5 + (relationship.occurrences * 0.1), 0.95);
      if (relationship.occurrences >= 5) {
        relationship.strength = 'moderate';
      }
      if (relationship.occurrences >= 10) {
        relationship.strength = 'strong';
      }
      relationships.push(relationship);
    }

    return relationships;
  }
}

// ============================================================================
// KNOWLEDGE GRAPH CLASS
// ============================================================================

export class KnowledgeGraphBuilder {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private clusters: Map<string, GraphCluster> = new Map();
  private entityResolver: EntityResolver;
  private relationshipInferrer: RelationshipInferrer;

  constructor() {
    this.entityResolver = new EntityResolver();
    this.relationshipInferrer = new RelationshipInferrer();
  }

  /**
   * Add entity to graph
   */
  addEntity(entity: Entity): GraphNode {
    // Check if node already exists
    const existingNode = this.findNodeByValue(entity.normalizedValue, entity.type);
    if (existingNode) {
      // Update existing node
      existingNode.aliases = [...new Set([...existingNode.aliases, entity.value])];
      existingNode.sources.push(entity.source);
      existingNode.updatedAt = new Date();
      return existingNode;
    }

    // Create new node
    const node: GraphNode = {
      id: entity.id,
      type: entity.type,
      label: entity.value,
      value: entity.normalizedValue,
      aliases: entity.aliases || [],
      properties: {
        confidence: entity.confidence,
        priority: entity.priority,
        position: entity.position,
        metadata: entity.metadata,
      },
      incomingEdges: [],
      outgoingEdges: [],
      sources: [entity.source],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.nodes.set(node.id, node);
    return node;
  }

  /**
   * Add relationship to graph
   */
  addRelationship(relationship: Relationship): GraphEdge | null {
    // Validate nodes exist
    if (!this.nodes.has(relationship.source) || !this.nodes.has(relationship.target)) {
      return null;
    }

    // Check if edge already exists
    const existingEdge = this.findEdge(relationship.source, relationship.target, relationship.type);
    if (existingEdge) {
      // Update existing edge
      existingEdge.evidence.push(...relationship.evidence);
      existingEdge.occurrences++;
      existingEdge.updatedAt = new Date();
      existingEdge.confidence = Math.min(existingEdge.confidence + 0.05, 1);
      return existingEdge;
    }

    // Create new edge
    const edge: GraphEdge = {
      id: relationship.id,
      source: relationship.source,
      target: relationship.target,
      type: relationship.type,
      strength: relationship.strength,
      weight: this.calculateEdgeWeight(relationship),
      properties: {
        firstSeen: relationship.firstSeen,
        lastSeen: relationship.lastSeen,
      },
      evidence: relationship.evidence,
      confidence: relationship.confidence,
      sources: relationship.evidence.map(e => e.source),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.edges.set(edge.id, edge);

    // Update node edge references
    const sourceNode = this.nodes.get(relationship.source)!;
    const targetNode = this.nodes.get(relationship.target)!;
    sourceNode.outgoingEdges.push(edge.id);
    targetNode.incomingEdges.push(edge.id);

    return edge;
  }

  /**
   * Build graph from entities and relationships
   */
  async build(
    entities: Entity[],
    relationships: Relationship[]
  ): Promise<KnowledgeGraph> {
    // Resolve entities
    const entityClusters = await this.entityResolver.resolve(entities);

    // Add entities to graph
    for (const entity of entities) {
      this.addEntity(entity);
    }

    // Add relationships to graph
    for (const relationship of relationships) {
      this.addRelationship(relationship);
    }

    // Auto-detect clusters
    await this.detectClusters();

    // Build metadata
    const metadata = this.buildMetadata();

    return {
      nodes: this.nodes,
      edges: this.edges,
      clusters: this.clusters,
      metadata,
    };
  }

  /**
   * Find node by value and type
   */
  private findNodeByValue(value: string, type: EntityType): GraphNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.value === value && node.type === type) {
        return node;
      }
    }
    return undefined;
  }

  /**
   * Find edge by source, target, and type
   */
  private findEdge(source: string, target: string, type: RelationshipType): GraphEdge | undefined {
    for (const edge of this.edges.values()) {
      if (
        edge.source === source &&
        edge.target === target &&
        edge.type === type
      ) {
        return edge;
      }
    }
    return undefined;
  }

  /**
   * Calculate edge weight based on relationship properties
   */
  private calculateEdgeWeight(relationship: Relationship): number {
    let weight = 0.5;

    // Strength factor
    const strengthWeights = { strong: 0.3, moderate: 0.2, weak: 0.1, inferred: 0.05 };
    weight += strengthWeights[relationship.strength] || 0.1;

    // Occurrences factor
    weight += Math.min(relationship.occurrences * 0.05, 0.2);

    return Math.min(weight, 1);
  }

  /**
   * Detect clusters using community detection
   */
  private async detectClusters(): Promise<void> {
    // Simple clustering based on connectivity
    const visited = new Set<string>();
    let clusterIndex = 0;

    for (const node of this.nodes.values()) {
      if (visited.has(node.id)) continue;

      // BFS to find connected component
      const component = this.findConnectedComponent(node.id, visited);

      if (component.length >= 3) {
        const cluster: GraphCluster = {
          id: uuidv4(),
          label: `Cluster ${++clusterIndex}`,
          nodes: component,
          type: 'auto_detected',
          riskScore: this.calculateClusterRisk(component),
        };

        this.clusters.set(cluster.id, cluster);
      }
    }
  }

  /**
   * Find connected component using BFS
   */
  private findConnectedComponent(startId: string, visited: Set<string>): string[] {
    const component: string[] = [];
    const queue: string[] = [startId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;

      visited.add(nodeId);
      component.push(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        // Add connected nodes to queue
        const connectedIds = [...node.incomingEdges, ...node.outgoingEdges]
          .map(edgeId => {
            const edge = this.edges.get(edgeId);
            return edge ? (edge.source === nodeId ? edge.target : edge.source) : null;
          })
          .filter((id): id is string => id !== null && !visited.has(id));

        queue.push(...connectedIds);
      }
    }

    return component;
  }

  /**
   * Calculate risk score for a cluster
   */
  private calculateClusterRisk(nodeIds: string[]): number {
    let riskScore = 0;

    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      // High-risk entity types
      const riskWeights: Record<EntityType, number> = {
        phone: 0.1,
        email: 0.1,
        pan_number: 0.15,
        aadhaar_number: 0.15,
        account_number: 0.2,
        amount: 0.15,
        crypto_address: 0.3,
        social_handle: 0.05,
        vehicle_number: 0.1,
        ip_address: 0.1,
        name: 0.05,
        organization: 0.05,
        location: 0.03,
        address: 0.05,
        date: 0.02,
        upi_id: 0.15,
        aadhaar_vid: 0.15,
        url: 0.05,
        ifsc_code: 0.1,
        pincode: 0.02,
        id_number: 0.1,
        unknown: 0,
      };

      riskScore += riskWeights[node.type] || 0.05;
    }

    // Normalize by cluster size
    return Math.min(riskScore / nodeIds.length * 5, 1);
  }

  /**
   * Build graph metadata
   */
  private buildMetadata(): GraphMetadata {
    const nodeTypes: Record<EntityType, number> = {} as Record<EntityType, number>;
    const edgeTypes: Record<RelationshipType, number> = {} as Record<RelationshipType, number>;
    let totalEdges = 0;

    for (const node of this.nodes.values()) {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
      totalEdges += node.incomingEdges.length + node.outgoingEdges.length;
    }

    for (const edge of this.edges.values()) {
      edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
    }

    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      nodeTypes,
      edgeTypes,
      avgConnectivity: this.nodes.size > 0 ? totalEdges / this.nodes.size : 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Find shortest path between two nodes
   */
  findShortestPath(startId: string, endId: string): string[] | null {
    if (!this.nodes.has(startId) || !this.nodes.has(endId)) {
      return null;
    }

    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startId, path: [startId] }];

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === endId) {
        return path;
      }

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        const neighbors = [...node.incomingEdges, ...node.outgoingEdges]
          .map(edgeId => {
            const edge = this.edges.get(edgeId);
            return edge ? (edge.source === nodeId ? edge.target : edge.source) : null;
          })
          .filter((id): id is string => id !== null && !visited.has(id));

        for (const neighborId of neighbors) {
          queue.push({ nodeId: neighborId, path: [...path, neighborId] });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get node neighbors
   */
  getNeighbors(nodeId: string, depth: number = 1): GraphNode[] {
    const neighbors: GraphNode[] = [];
    const visited = new Set<string>([nodeId]);
    let currentLevel = [nodeId];

    for (let i = 0; i < depth; i++) {
      const nextLevel: string[] = [];

      for (const id of currentLevel) {
        const node = this.nodes.get(id);
        if (!node) continue;

        const neighborIds = [...node.incomingEdges, ...node.outgoingEdges]
          .map(edgeId => {
            const edge = this.edges.get(edgeId);
            return edge ? (edge.source === id ? edge.target : edge.source) : null;
          })
          .filter((nid): nid is string => nid !== null && !visited.has(nid));

        for (const nid of neighborIds) {
          visited.add(nid);
          nextLevel.push(nid);
          const neighbor = this.nodes.get(nid);
          if (neighbor) {
            neighbors.push(neighbor);
          }
        }
      }

      currentLevel = nextLevel;
    }

    return neighbors;
  }

  /**
   * Export graph as adjacency list
   */
  toAdjacencyList(): Map<string, string[]> {
    const adjacencyList = new Map<string, string[]>();

    for (const node of this.nodes.values()) {
      const neighbors = [...node.incomingEdges, ...node.outgoingEdges]
        .map(edgeId => {
          const edge = this.edges.get(edgeId);
          return edge ? (edge.source === node.id ? edge.target : edge.source) : null;
        })
        .filter((id): id is string => id !== null);

      adjacencyList.set(node.id, [...new Set(neighbors)]);
    }

    return adjacencyList;
  }

  /**
   * Export graph as JSON (for visualization)
   */
  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }
}

// Export singleton instances
export const knowledgeGraphBuilder = new KnowledgeGraphBuilder();
export const entityResolver = new EntityResolver();
export const relationshipInferrer = new RelationshipInferrer();
