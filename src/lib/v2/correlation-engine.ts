/**
 * Correlation Engine V2
 * Pattern detection, multi-hop reasoning, anomaly detection, and risk scoring
 * Implements 2026 research on intelligent correlation systems
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  Relationship,
  GraphNode,
  GraphEdge,
  CorrelationResult,
  DetectedPattern,
  Anomaly,
  Insight,
  RiskIndicator,
  TimelineEvent,
  PatternType,
} from '../types';

// ============================================================================
// PATTERN DETECTOR
// ============================================================================

interface PatternDefinition {
  type: PatternType;
  name: string;
  description: string;
  minOccurrences: number;
  minSignificance: number;
  detect: (nodes: GraphNode[], edges: GraphEdge[]) => DetectedPattern[];
}

const PATTERN_DEFINITIONS: PatternDefinition[] = [
  {
    type: 'frequency_pattern',
    name: 'High Frequency Contact',
    description: 'Entities with unusually high number of communications',
    minOccurrences: 5,
    minSignificance: 0.7,
    detect: (nodes, edges) => {
      const patterns: DetectedPattern[] = [];
      
      // Find nodes with high connectivity
      const highConnectivityNodes = nodes.filter(n => 
        n.incomingEdges.length + n.outgoingEdges.length > 10
      );
      
      for (const node of highConnectivityNodes) {
        patterns.push({
          id: uuidv4(),
          type: 'frequency_pattern',
          description: `${node.label} has ${node.incomingEdges.length + node.outgoingEdges.length} connections, indicating high activity`,
          entities: [node.id],
          frequency: node.incomingEdges.length + node.outgoingEdges.length,
          firstOccurrence: node.createdAt,
          lastOccurrence: node.updatedAt,
          significance: Math.min((node.incomingEdges.length + node.outgoingEdges.length) / 50, 1),
          evidence: [`High connectivity node in knowledge graph`],
        });
      }
      
      return patterns;
    },
  },
  {
    type: 'financial_pattern',
    name: 'Circular Transaction Pattern',
    description: 'Money flowing through a circular path between entities',
    minOccurrences: 2,
    minSignificance: 0.8,
    detect: (nodes, edges) => {
      const patterns: DetectedPattern[] = [];
      const financialEdges = edges.filter(e => e.type === 'financial');
      
      // Build adjacency for financial transactions
      const adjacency = new Map<string, Set<string>>();
      for (const edge of financialEdges) {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
        adjacency.get(edge.source)!.add(edge.target);
      }
      
      // Find cycles (simplified - finds 2-hop and 3-hop cycles)
      for (const [start, targets] of adjacency) {
        for (const mid of targets) {
          const midTargets = adjacency.get(mid);
          if (midTargets?.has(start)) {
            // 2-hop cycle
            patterns.push({
              id: uuidv4(),
              type: 'financial_pattern',
              description: `Circular transaction detected: ${start.substring(0, 8)}... → ${mid.substring(0, 8)}... → back`,
              entities: [start, mid],
              frequency: 1,
              firstOccurrence: new Date(),
              lastOccurrence: new Date(),
              significance: 0.9,
              evidence: ['Circular money flow pattern detected'],
            });
          }
          
          // Check for 3-hop cycles
          if (midTargets) {
            for (const end of midTargets) {
              const endTargets = adjacency.get(end);
              if (endTargets?.has(start)) {
                patterns.push({
                  id: uuidv4(),
                  type: 'financial_pattern',
                  description: `3-party circular transaction detected`,
                  entities: [start, mid, end],
                  frequency: 1,
                  firstOccurrence: new Date(),
                  lastOccurrence: new Date(),
                  significance: 0.95,
                  evidence: ['3-hop circular money flow detected - potential layering'],
                });
              }
            }
          }
        }
      }
      
      return patterns;
    },
  },
  {
    type: 'temporal_pattern',
    name: 'Time-based Clustering',
    description: 'Activities clustered in specific time windows',
    minOccurrences: 3,
    minSignificance: 0.6,
    detect: (nodes, edges) => {
      const patterns: DetectedPattern[] = [];
      
      // Group edges by date
      const edgesByDate = new Map<string, GraphEdge[]>();
      for (const edge of edges) {
        const date = edge.createdAt.toISOString().split('T')[0];
        if (!edgesByDate.has(date)) edgesByDate.set(date, []);
        edgesByDate.get(date)!.push(edge);
      }
      
      // Find dates with unusually high activity
      const avgActivity = edges.length / Math.max(edgesByDate.size, 1);
      for (const [date, dayEdges] of edgesByDate) {
        if (dayEdges.length > avgActivity * 2) {
          patterns.push({
            id: uuidv4(),
            type: 'temporal_pattern',
            description: `Unusual activity spike on ${date}: ${dayEdges.length} events`,
            entities: [...new Set(dayEdges.flatMap(e => [e.source, e.target]))],
            frequency: dayEdges.length,
            firstOccurrence: new Date(date),
            lastOccurrence: new Date(date),
            significance: dayEdges.length / (avgActivity * 3),
            evidence: [`Activity on ${date} is ${Math.round(dayEdges.length / avgActivity)}x above average`],
          });
        }
      }
      
      return patterns;
    },
  },
  {
    type: 'spatial_pattern',
    name: 'Location Clustering',
    description: 'Multiple entities associated with same location',
    minOccurrences: 3,
    minSignificance: 0.5,
    detect: (nodes, edges) => {
      const patterns: DetectedPattern[] = [];
      
      // Find location nodes
      const locationNodes = nodes.filter(n => n.type === 'location');
      
      for (const location of locationNodes) {
        // Find entities connected to this location
        const connectedEntities = location.incomingEdges
          .map(eid => edges.find(e => e.id === eid))
          .filter(e => e?.type === 'location')
          .map(e => e?.source)
          .filter(Boolean);
        
        if (connectedEntities.length >= 3) {
          patterns.push({
            id: uuidv4(),
            type: 'spatial_pattern',
            description: `${connectedEntities.length} entities connected to location: ${location.label}`,
            entities: [location.id, ...connectedEntities as string[]],
            frequency: connectedEntities.length,
            firstOccurrence: location.createdAt,
            lastOccurrence: location.updatedAt,
            significance: connectedEntities.length / 10,
            evidence: [`Multiple entities share same location: ${location.label}`],
          });
        }
      }
      
      return patterns;
    },
  },
];

// ============================================================================
// ANOMALY DETECTOR
// ============================================================================

interface AnomalyDefinition {
  type: 'statistical' | 'behavioral' | 'temporal' | 'relational';
  name: string;
  threshold: number;
  detect: (
    nodes: GraphNode[],
    edges: GraphEdge[],
    threshold: number
  ) => Anomaly[];
}

const ANOMALY_DEFINITIONS: AnomalyDefinition[] = [
  {
    type: 'statistical',
    name: 'Outlier Connectivity',
    threshold: 2.5, // Standard deviations
    detect: (nodes, edges, threshold) => {
      const anomalies: Anomaly[] = [];
      
      // Calculate mean and std of connectivity
      const connectivities = nodes.map(n => n.incomingEdges.length + n.outgoingEdges.length);
      const mean = connectivities.reduce((a, b) => a + b, 0) / connectivities.length;
      const variance = connectivities.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / connectivities.length;
      const std = Math.sqrt(variance);
      
      // Find outliers
      for (let i = 0; i < nodes.length; i++) {
        const zScore = std > 0 ? (connectivities[i] - mean) / std : 0;
        if (Math.abs(zScore) > threshold) {
          anomalies.push({
            id: uuidv4(),
            type: 'statistical',
            description: `${nodes[i].label} has ${connectivities[i]} connections (z-score: ${zScore.toFixed(2)})`,
            entities: [nodes[i].id],
            score: Math.abs(zScore),
            threshold,
            detected: new Date(),
            context: `Statistical outlier in network connectivity`,
          });
        }
      }
      
      return anomalies;
    },
  },
  {
    type: 'behavioral',
    name: 'Entity Type Mismatch',
    threshold: 0.8,
    detect: (nodes, edges, threshold) => {
      const anomalies: Anomaly[] = [];
      
      // Find edges between unexpected entity types
      const expectedConnections: Record<string, string[]> = {
        'person': ['phone', 'email', 'address', 'account', 'organization', 'location'],
        'phone': ['person', 'account', 'location'],
        'email': ['person', 'account', 'organization'],
        'account': ['person', 'organization', 'amount', 'account'],
        'organization': ['person', 'address', 'account', 'phone'],
      };
      
      for (const edge of edges) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode) {
          const allowedTargets = expectedConnections[sourceNode.type] || [];
          if (!allowedTargets.includes(targetNode.type)) {
            anomalies.push({
              id: uuidv4(),
              type: 'behavioral',
              description: `Unusual connection: ${sourceNode.type} → ${targetNode.type}`,
              entities: [edge.source, edge.target],
              score: 0.85,
              threshold,
              detected: new Date(),
              context: `Edge ID: ${edge.id}`,
            });
          }
        }
      }
      
      return anomalies;
    },
  },
  {
    type: 'relational',
    name: 'Hidden Hub Detection',
    threshold: 0.7,
    detect: (nodes, edges, threshold) => {
      const anomalies: Anomaly[] = [];
      
      // Find nodes that bridge otherwise disconnected components
      for (const node of nodes) {
        const neighbors = new Set([
          ...node.incomingEdges.map(eid => {
            const edge = edges.find(e => e.id === eid);
            return edge?.source;
          }),
          ...node.outgoingEdges.map(eid => {
            const edge = edges.find(e => e.id === eid);
            return edge?.target;
          }),
        ].filter(Boolean));
        
        // Check if removing this node would disconnect components
        // (simplified: node has connections to multiple clusters)
        if (neighbors.size > 5) {
          const neighborTypes = new Set(
            Array.from(neighbors)
              .map(nid => nodes.find(n => n.id === nid)?.type)
              .filter(Boolean)
          );
          
          if (neighborTypes.size >= 3) {
            anomalies.push({
              id: uuidv4(),
              type: 'relational',
              description: `Potential hub node: ${node.label} connects ${neighborTypes.size} entity types`,
              entities: [node.id],
              score: neighborTypes.size / 5,
              threshold,
              detected: new Date(),
              context: `Bridges multiple entity type clusters`,
            });
          }
        }
      }
      
      return anomalies;
    },
  },
];

// ============================================================================
// RISK SCORER
// ============================================================================

interface RiskFactor {
  id: string;
  type: RiskIndicator['type'];
  weight: number;
  evaluate: (node: GraphNode, edges: GraphEdge[], allNodes: GraphNode[]) => number;
}

const RISK_FACTORS: RiskFactor[] = [
  {
    id: 'high_value_transactions',
    type: 'high_value_transactions',
    weight: 0.3,
    evaluate: (node, edges, allNodes) => {
      // Check for high-value financial edges
      const financialEdges = edges.filter(e =>
        (e.source === node.id || e.target === node.id) &&
        e.type === 'financial'
      );
      
      // More financial transactions = higher risk
      return Math.min(financialEdges.length / 10, 1);
    },
  },
  {
    id: 'frequent_transfers',
    type: 'frequent_transfers',
    weight: 0.2,
    evaluate: (node) => {
      const totalEdges = node.incomingEdges.length + node.outgoingEdges.length;
      return Math.min(totalEdges / 50, 1);
    },
  },
  {
    id: 'cross_border',
    type: 'cross_border',
    weight: 0.25,
    evaluate: (node, edges, allNodes) => {
      // Check for connections to entities in different locations
      const connectedNodes = new Set([
        ...node.incomingEdges.map(eid => {
          const edge = edges.find(e => e.id === eid);
          return edge?.source;
        }),
        ...node.outgoingEdges.map(eid => {
          const edge = edges.find(e => e.id === eid);
          return edge?.target;
        }),
      ].filter(Boolean));
      
      const locations = new Set(
        Array.from(connectedNodes)
          .map(nid => allNodes.find(n => n.id === nid))
          .filter(n => n?.type === 'location')
          .map(n => n?.value)
      );
      
      return locations.size > 1 ? Math.min(locations.size / 5, 1) : 0;
    },
  },
  {
    id: 'multiple_accounts',
    type: 'multiple_accounts',
    weight: 0.15,
    evaluate: (node, edges, allNodes) => {
      // Check for multiple account connections
      const accountNodes = new Set([
        ...node.incomingEdges.map(eid => {
          const edge = edges.find(e => e.id === eid);
          const targetId = edge?.source === node.id ? edge.target : edge?.source;
          return allNodes.find(n => n.id === targetId && n.type === 'account_number');
        }),
      ].filter(Boolean));
      
      return accountNodes.size > 2 ? Math.min(accountNodes.size / 5, 1) : 0;
    },
  },
  {
    id: 'unusual_pattern',
    type: 'unusual_pattern',
    weight: 0.1,
    evaluate: (node) => {
      // Based on graph properties
      const inOutRatio = node.incomingEdges.length / Math.max(node.outgoingEdges.length, 1);
      
      // Unusual if heavily unbalanced
      if (inOutRatio > 5 || inOutRatio < 0.2) {
        return Math.min(Math.abs(Math.log10(inOutRatio)) / 2, 1);
      }
      
      return 0;
    },
  },
];

// ============================================================================
// CORRELATION ENGINE CLASS
// ============================================================================

export class CorrelationEngine {
  private patternDefinitions: PatternDefinition[];
  private anomalyDefinitions: AnomalyDefinition[];
  private riskFactors: RiskFactor[];

  constructor() {
    this.patternDefinitions = PATTERN_DEFINITIONS;
    this.anomalyDefinitions = ANOMALY_DEFINITIONS;
    this.riskFactors = RISK_FACTORS;
  }

  /**
   * Main correlation analysis method
   */
  async analyze(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): Promise<CorrelationResult> {
    const startTime = Date.now();

    // Detect patterns
    const patterns = this.detectPatterns(nodes, edges);

    // Detect anomalies
    const anomalies = this.detectAnomalies(nodes, edges);

    // Calculate risk indicators
    const riskIndicators = this.calculateRiskIndicators(nodes, edges);

    // Generate insights
    const insights = this.generateInsights(patterns, anomalies, riskIndicators, nodes);

    // Build timeline
    const timeline = this.buildTimeline(nodes, edges);

    console.log(`Correlation analysis completed in ${Date.now() - startTime}ms`);

    return {
      patterns,
      anomalies,
      insights,
      riskIndicators,
      timeline,
    };
  }

  /**
   * Detect all patterns
   */
  private detectPatterns(nodes: GraphNode[], edges: GraphEdge[]): DetectedPattern[] {
    const allPatterns: DetectedPattern[] = [];

    for (const definition of this.patternDefinitions) {
      const patterns = definition.detect(nodes, edges);
      
      // Filter by minimum criteria
      const validPatterns = patterns.filter(
        p => p.frequency >= definition.minOccurrences &&
             p.significance >= definition.minSignificance
      );
      
      allPatterns.push(...validPatterns);
    }

    return allPatterns.sort((a, b) => b.significance - a.significance);
  }

  /**
   * Detect all anomalies
   */
  private detectAnomalies(nodes: GraphNode[], edges: GraphEdge[]): Anomaly[] {
    const allAnomalies: Anomaly[] = [];

    for (const definition of this.anomalyDefinitions) {
      const anomalies = definition.detect(nodes, edges, definition.threshold);
      allAnomalies.push(...anomalies);
    }

    return allAnomalies.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate risk indicators for all nodes
   */
  private calculateRiskIndicators(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): RiskIndicator[] {
    const indicators: RiskIndicator[] = [];

    for (const node of nodes) {
      const nodeRiskFactors: Array<{ factor: RiskFactor; score: number }> = [];

      for (const factor of this.riskFactors) {
        const score = factor.evaluate(node, edges, nodes);
        if (score > 0.5) {
          nodeRiskFactors.push({ factor, score });
        }
      }

      if (nodeRiskFactors.length > 0) {
        // Calculate weighted score
        const totalWeight = nodeRiskFactors.reduce((sum, { factor }) => sum + factor.weight, 0);
        const weightedScore = nodeRiskFactors.reduce(
          (sum, { factor, score }) => sum + factor.weight * score,
          0
        ) / totalWeight;

        // Determine severity
        let severity: RiskIndicator['severity'];
        if (weightedScore >= 0.8) severity = 'critical';
        else if (weightedScore >= 0.6) severity = 'high';
        else if (weightedScore >= 0.4) severity = 'medium';
        else severity = 'low';

        indicators.push({
          id: uuidv4(),
          type: nodeRiskFactors[0].factor.type,
          severity,
          description: `Risk indicators for ${node.label}: ${nodeRiskFactors.map(f => f.factor.id).join(', ')}`,
          entities: [node.id],
          score: weightedScore,
        });
      }
    }

    return indicators.sort((a, b) => b.score - a.score);
  }

  /**
   * Generate insights from analysis
   */
  private generateInsights(
    patterns: DetectedPattern[],
    anomalies: Anomaly[],
    riskIndicators: RiskIndicator[],
    nodes: GraphNode[]
  ): Insight[] {
    const insights: Insight[] = [];

    // Pattern-based insights
    for (const pattern of patterns.slice(0, 5)) {
      insights.push({
        id: uuidv4(),
        category: 'pattern',
        title: `${pattern.type.replace('_', ' ')} detected`,
        description: pattern.description,
        entities: pattern.entities,
        confidence: pattern.significance,
        actionable: pattern.significance > 0.7,
        suggestedActions: this.getSuggestedActions(pattern),
      });
    }

    // Anomaly-based insights
    for (const anomaly of anomalies.slice(0, 5)) {
      insights.push({
        id: uuidv4(),
        category: 'risk',
        title: `${anomaly.type} anomaly detected`,
        description: anomaly.description,
        entities: anomaly.entities,
        confidence: anomaly.score / anomaly.threshold,
        actionable: anomaly.score > anomaly.threshold,
        suggestedActions: ['Review anomaly details', 'Verify data accuracy', 'Investigate related entities'],
      });
    }

    // Risk-based insights
    const highRiskIndicators = riskIndicators.filter(i => i.severity === 'high' || i.severity === 'critical');
    if (highRiskIndicators.length > 0) {
      insights.push({
        id: uuidv4(),
        category: 'risk',
        title: `${highRiskIndicators.length} high-risk entities identified`,
        description: 'Multiple entities have elevated risk scores requiring attention',
        entities: highRiskIndicators.flatMap(i => i.entities),
        confidence: 0.85,
        actionable: true,
        suggestedActions: ['Prioritize investigation', 'Gather additional evidence', 'Consider surveillance'],
      });
    }

    // Connection insights
    const highlyConnected = nodes.filter(n => n.incomingEdges.length + n.outgoingEdges.length > 15);
    if (highlyConnected.length > 0) {
      insights.push({
        id: uuidv4(),
        category: 'connection',
        title: `${highlyConnected.length} highly connected entities found`,
        description: 'These entities may be key nodes in the network',
        entities: highlyConnected.map(n => n.id),
        confidence: 0.75,
        actionable: true,
        suggestedActions: ['Analyze network position', 'Identify cluster membership', 'Map influence patterns'],
      });
    }

    return insights;
  }

  /**
   * Get suggested actions for a pattern
   */
  private getSuggestedActions(pattern: DetectedPattern): string[] {
    const actions: Record<PatternType, string[]> = {
      frequency_pattern: ['Monitor activity', 'Set up alerts', 'Compare with baseline'],
      temporal_pattern: ['Investigate timing', 'Check for events', 'Analyze triggers'],
      spatial_pattern: ['Physical surveillance', 'Location history', 'Verify addresses'],
      financial_pattern: ['Trace funds', 'Check source of funds', 'Identify beneficiaries'],
      communication_pattern: ['Analyze content', 'Map communication network', 'Identify patterns'],
      behavioral_pattern: ['Profile behavior', 'Compare with norms', 'Predict future actions'],
    };

    return actions[pattern.type] || ['Investigate further'];
  }

  /**
   * Build timeline from nodes and edges
   */
  private buildTimeline(nodes: GraphNode[], edges: GraphEdge[]): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // Add node creation events
    for (const node of nodes) {
      events.push({
        id: uuidv4(),
        timestamp: node.createdAt,
        type: 'entity_discovered',
        description: `Entity discovered: ${node.label} (${node.type})`,
        entities: [node.id],
        source: node.sources[0] || 'unknown',
        significance: node.incomingEdges.length + node.outgoingEdges.length > 5 ? 0.8 : 0.5,
      });
    }

    // Add edge events
    for (const edge of edges) {
      events.push({
        id: uuidv4(),
        timestamp: edge.createdAt,
        type: 'relationship_established',
        description: `Relationship: ${edge.type} (${edge.strength})`,
        entities: [edge.source, edge.target],
        source: edge.sources[0] || 'unknown',
        significance: edge.confidence,
      });
    }

    // Sort by timestamp
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Find multi-hop paths
   */
  findPaths(
    startNodeId: string,
    endNodeId: string,
    maxHops: number,
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const dfs = (currentId: string, path: string[], depth: number) => {
      if (depth > maxHops) return;
      if (currentId === endNodeId) {
        paths.push([...path]);
        return;
      }
      if (visited.has(currentId)) return;

      visited.add(currentId);
      const node = nodeMap.get(currentId);
      if (!node) return;

      // Get neighbors
      const neighbors = new Set([
        ...node.incomingEdges.map(eid => {
          const edge = edges.find(e => e.id === eid);
          return edge?.source;
        }),
        ...node.outgoingEdges.map(eid => {
          const edge = edges.find(e => e.id === eid);
          return edge?.target;
        }),
      ].filter(Boolean) as string[]);

      for (const neighborId of neighbors) {
        dfs(neighborId, [...path, neighborId], depth + 1);
      }

      visited.delete(currentId);
    };

    dfs(startNodeId, [startNodeId], 0);
    return paths;
  }
}

// Export singleton
export const correlationEngine = new CorrelationEngine();
