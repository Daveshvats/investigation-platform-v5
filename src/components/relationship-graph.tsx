'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Relationship {
  from: string;
  to: string;
  type: string;
  evidence: string;
  confidence: number;
}

interface DiscoveredRecord {
  record: Record<string, unknown>;
  sourceTable: string;
  matchedOn: string[];
  matchType: 'direct' | 'indirect' | 'inferred';
  confidence: number;
  discoveryPath: string[];
}

interface RelationshipGraphProps {
  relationships: Relationship[];
  records: DiscoveredRecord[];
  primarySubject?: DiscoveredRecord | null;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'primary' | 'related';
  x: number;
  y: number;
  table?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
  confidence: number;
  evidence: string;
}

const COLORS = {
  primary: '#3b82f6', // blue
  related: '#8b5cf6', // purple
  edge: {
    shared_phone: '#10b981',
    shared_email: '#f59e0b',
    shared_address: '#ef4444',
    default: '#6b7280',
  },
};

export function RelationshipGraph({ relationships, records, primarySubject }: RelationshipGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeList: GraphEdge[] = [];

    // Add primary subject
    if (primarySubject) {
      const id = String(primarySubject.record.id || primarySubject.record.name || 'primary');
      nodeMap.set(id, {
        id,
        label: String(primarySubject.record.name || primarySubject.record.first_name || primarySubject.record.company_name || id).slice(0, 15),
        type: 'primary',
        x: 200,
        y: 150,
        table: primarySubject.sourceTable,
      });
    }

    // Add related records as nodes
    const centerX = 200;
    const centerY = 150;
    const radius = 120;
    
    records.forEach((record, index) => {
      const id = String(record.record.id || record.record.name || `record-${index}`);
      if (!nodeMap.has(id)) {
        const angle = (2 * Math.PI * nodeMap.size) / Math.max(records.length, 1);
        nodeMap.set(id, {
          id,
          label: String(record.record.name || record.record.first_name || record.record.company_name || id).slice(0, 15),
          type: record === primarySubject ? 'primary' : 'related',
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
          table: record.sourceTable,
        });
      }
    });

    // If no records but have relationships, create nodes from them
    if (nodeMap.size === 0 && relationships.length > 0) {
      const uniqueNodes = new Set<string>();
      relationships.forEach(rel => {
        uniqueNodes.add(rel.from);
        uniqueNodes.add(rel.to);
      });
      
      const nodesArray = Array.from(uniqueNodes);
      nodesArray.forEach((id, index) => {
        const angle = (2 * Math.PI * index) / nodesArray.length;
        nodeMap.set(id, {
          id,
          label: id.slice(0, 15),
          type: 'related',
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        });
      });
    }

    // Add edges
    relationships.forEach(rel => {
      edgeList.push({
        from: rel.from,
        to: rel.to,
        type: rel.type,
        confidence: rel.confidence,
        evidence: rel.evidence,
      });
    });

    return { nodes: Array.from(nodeMap.values()), edges: edgeList };
  }, [relationships, records, primarySubject]);

  if (nodes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No relationships to visualize. Run an investigation to discover connections.
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            Relationship Network
            <Badge variant="secondary">{nodes.length} nodes, {edges.length} connections</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <svg viewBox="0 0 400 300" className="w-full h-auto">
            {/* Edges */}
            {edges.map((edge, index) => {
              const fromNode = nodes.find(n => n.id === edge.from);
              const toNode = nodes.find(n => n.id === edge.to);
              if (!fromNode || !toNode) return null;
              
              const edgeColor = COLORS.edge[edge.type as keyof typeof COLORS.edge] || COLORS.edge.default;
              
              return (
                <g key={index}>
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke={edgeColor}
                    strokeWidth={2 + edge.confidence * 2}
                    strokeOpacity={0.6}
                  />
                  {/* Edge label */}
                  <text
                    x={(fromNode.x + toNode.x) / 2}
                    y={(fromNode.y + toNode.y) / 2 - 5}
                    fontSize="8"
                    fill={edgeColor}
                    textAnchor="middle"
                  >
                    {edge.type.replace('shared_', '')}
                  </text>
                </g>
              );
            })}
            
            {/* Nodes */}
            {nodes.map((node) => (
              <Tooltip key={node.id}>
                <TooltipTrigger asChild>
                  <g>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.type === 'primary' ? 20 : 15}
                      fill={node.type === 'primary' ? COLORS.primary : COLORS.related}
                      stroke="white"
                      strokeWidth="2"
                    />
                    <text
                      x={node.x}
                      y={node.y + 4}
                      fontSize="8"
                      fill="white"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {node.label.slice(0, 8)}
                    </text>
                  </g>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <div className="font-bold">{node.label}</div>
                    {node.table && <div className="text-muted-foreground">Table: {node.table}</div>}
                    <div className="text-muted-foreground capitalize">Type: {node.type}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </svg>
          
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-2 justify-center text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.primary }} />
              <span>Primary Subject</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.related }} />
              <span>Related Records</span>
            </div>
            {Object.entries(COLORS.edge).slice(0, 3).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="w-3 h-0.5" style={{ backgroundColor: color }} />
                <span>{type.replace('shared_', '')}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
