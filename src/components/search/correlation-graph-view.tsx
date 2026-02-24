'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  User,
  Phone,
  Mail,
  MapPin,
  Building,
  CreditCard,
  Hash,
  Circle,
  Move,
} from 'lucide-react';

interface GraphNode {
  id: string;
  type: 'person' | 'phone' | 'email' | 'location' | 'company' | 'account' | 'id' | 'other';
  value: string;
  count: number;
  connections: string[];
  sources: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
}

interface CorrelationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Array<{
    id: string;
    nodes: string[];
    label: string;
  }>;
}

interface CorrelationGraphViewProps {
  graph: CorrelationGraph;
  searchHistory?: string[];
  discoveredEntities?: string[];
}

// Node type colors and icons
const NODE_CONFIG: Record<string, { color: string; bgColor: string; icon: React.ElementType }> = {
  person: { color: 'text-blue-600', bgColor: 'fill-blue-100', icon: User },
  phone: { color: 'text-green-600', bgColor: 'fill-green-100', icon: Phone },
  email: { color: 'text-purple-600', bgColor: 'fill-purple-100', icon: Mail },
  location: { color: 'text-orange-600', bgColor: 'fill-orange-100', icon: MapPin },
  company: { color: 'text-cyan-600', bgColor: 'fill-cyan-100', icon: Building },
  account: { color: 'text-pink-600', bgColor: 'fill-pink-100', icon: CreditCard },
  id: { color: 'text-red-600', bgColor: 'fill-red-100', icon: Hash },
  other: { color: 'text-gray-600', bgColor: 'fill-gray-100', icon: Circle },
};

// Compute node positions using force simulation (pure function)
function computeNodePositions(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map();

  const width = 1200;
  const height = 800;
  const centerX = width / 2;
  const centerY = height / 2;

  // Create initial positions
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();

  // Position nodes by type in clusters
  const typeGroups: Record<string, GraphNode[]> = {};
  nodes.forEach(node => {
    if (!typeGroups[node.type]) typeGroups[node.type] = [];
    typeGroups[node.type].push(node);
  });

  const types = Object.keys(typeGroups);
  const angleStep = (2 * Math.PI) / types.length;
  const radius = Math.min(width, height) * 0.35;

  types.forEach((type, typeIndex) => {
    const groupNodes = typeGroups[type];
    const groupAngle = typeIndex * angleStep;
    const groupX = centerX + radius * Math.cos(groupAngle);
    const groupY = centerY + radius * Math.sin(groupAngle);

    groupNodes.forEach((node, i) => {
      const nodeAngle = (i / groupNodes.length) * 2 * Math.PI;
      const nodeRadius = 30 + groupNodes.length * 5;
      positions.set(node.id, {
        x: groupX + nodeRadius * Math.cos(nodeAngle),
        y: groupY + nodeRadius * Math.sin(nodeAngle),
        vx: 0,
        vy: 0,
      });
    });
  });

  // Simple force simulation
  const alpha = 0.3;
  const iterations = 50;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    positions.forEach((p1, id1) => {
      positions.forEach((p2, id2) => {
        if (id1 === id2) return;
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (100 * alpha) / (dist * dist);
        p1.vx += (dx / dist) * force;
        p1.vy += (dy / dist) * force;
      });
    });

    // Attraction along edges
    edges.forEach(edge => {
      const p1 = positions.get(edge.source);
      const p2 = positions.get(edge.target);
      if (!p1 || !p2) return;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 80) * 0.01 * alpha;

      p1.vx += (dx / dist) * force;
      p1.vy += (dy / dist) * force;
      p2.vx -= (dx / dist) * force;
      p2.vy -= (dy / dist) * force;
    });

    // Center gravity
    positions.forEach(p => {
      p.vx += (centerX - p.x) * 0.001 * alpha;
      p.vy += (centerY - p.y) * 0.001 * alpha;
    });

    // Apply velocity
    positions.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.9;
      p.vy *= 0.9;

      // Keep in bounds
      p.x = Math.max(40, Math.min(width - 40, p.x));
      p.y = Math.max(40, Math.min(height - 40, p.y));
    });
  }

  // Convert to simple positions
  const finalPositions = new Map<string, { x: number; y: number }>();
  positions.forEach((p, id) => {
    finalPositions.set(id, { x: p.x, y: p.y });
  });

  return finalPositions;
}

export function CorrelationGraphView({ graph, searchHistory = [], discoveredEntities = [] }: CorrelationGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  
  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panStartOffset, setPanStartOffset] = useState({ x: 0, y: 0 });

  // Compute node positions using useMemo - this is synchronous but fast enough
  const nodePositions = useMemo(() => {
    return computeNodePositions(graph.nodes, graph.edges);
  }, [graph.nodes, graph.edges]);

  // isSimulating is true when we have no positions yet
  const isSimulating = nodePositions.size === 0 && graph.nodes.length > 0;

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.3, 5));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.3, 0.2));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  // Mouse/touch pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanStartOffset({ x: pan.x, y: pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    setPan({ x: panStartOffset.x + dx, y: panStartOffset.y + dy });
  }, [isPanning, panStart, panStartOffset]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(5, z * delta)));
  }, []);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setPanStartOffset({ x: pan.x, y: pan.y });
    }
  }, [pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPanning || e.touches.length !== 1) return;
    
    const dx = e.touches[0].clientX - panStart.x;
    const dy = e.touches[0].clientY - panStart.y;
    setPan({ x: panStartOffset.x + dx, y: panStartOffset.y + dy });
  }, [isPanning, panStart, panStartOffset]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  const getNodePosition = useCallback((nodeId: string) => {
    return nodePositions.get(nodeId) || { x: 600, y: 400 };
  }, [nodePositions]);

  if (graph.nodes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="text-muted-foreground">No graph data to display</div>
          <p className="text-sm text-muted-foreground mt-2">Run a search to see entity relationships</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search History & Discovery */}
      <div className="grid grid-cols-2 gap-4">
        {searchHistory.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-500" />
                Search Iterations
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="flex flex-wrap gap-1">
                {searchHistory.map((term, i) => (
                  <Badge key={i} variant={i === 0 ? 'default' : 'secondary'} className="text-xs">
                    {i + 1}. {term.length > 20 ? term.slice(0, 20) + '...' : term}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        
        {discoveredEntities.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Hash className="h-4 w-4 text-green-500" />
                Discovered Entities ({discoveredEntities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="flex flex-wrap gap-1">
                {discoveredEntities.slice(0, 15).map((entity, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {entity.length > 20 ? entity.slice(0, 20) + '...' : entity}
                  </Badge>
                ))}
                {discoveredEntities.length > 15 && (
                  <Badge variant="secondary" className="text-xs">
                    +{discoveredEntities.length - 15} more
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Graph Visualization */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Entity Relationship Graph</CardTitle>
              <CardDescription>
                {graph.nodes.length} entities, {graph.edges.length} connections
                <span className="ml-2 text-blue-500">
                  <Move className="inline h-3 w-3 mr-1" />
                  Drag to pan, scroll to zoom
                </span>
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">
                {Math.round(zoom * 100)}%
              </Badge>
              <Button variant="outline" size="sm" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset} title="Reset View">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div 
            ref={containerRef}
            className="relative overflow-hidden border-t cursor-grab active:cursor-grabbing"
            style={{ height: '550px' }}
          >
            {isSimulating ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Building graph...</span>
              </div>
            ) : (
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox="0 0 1200 800"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{ touchAction: 'none' }}
              >
                {/* Background grid pattern */}
                <defs>
                  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f0f0f0" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Edges */}
                  {graph.edges.map((edge, i) => {
                    const source = getNodePosition(edge.source);
                    const target = getNodePosition(edge.target);
                    const isHighlighted = selectedNode?.id === edge.source || selectedNode?.id === edge.target;
                    
                    return (
                      <line
                        key={i}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={isHighlighted ? '#3b82f6' : '#d1d5db'}
                        strokeWidth={isHighlighted ? 2 : Math.max(0.5, edge.weight * 0.5)}
                        strokeOpacity={isHighlighted ? 1 : 0.4}
                        className="transition-all duration-200"
                      />
                    );
                  })}

                  {/* Nodes */}
                  {graph.nodes.map((node) => {
                    const pos = getNodePosition(node.id);
                    const config = NODE_CONFIG[node.type] || NODE_CONFIG.other;
                    const Icon = config.icon;
                    const isSelected = selectedNode?.id === node.id;
                    const nodeSize = Math.max(15, Math.min(35, 12 + node.count * 3));

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNode(isSelected ? null : node);
                        }}
                        className="cursor-pointer"
                        style={{ pointerEvents: 'all' }}
                      >
                        {/* Node circle */}
                        <circle
                          r={nodeSize}
                          className={`${config.bgColor} ${isSelected ? 'stroke-2 stroke-blue-500' : 'stroke-1 stroke-gray-300'}`}
                          fillOpacity={isSelected ? 1 : 0.9}
                        />
                        
                        {/* Count badge */}
                        {node.count > 1 && (
                          <circle
                            cx={nodeSize * 0.7}
                            cy={-nodeSize * 0.7}
                            r={10}
                            className="fill-blue-500 stroke-white stroke-1"
                          />
                        )}
                        {node.count > 1 && (
                          <text
                            x={nodeSize * 0.7}
                            y={-nodeSize * 0.7}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-white font-bold"
                            style={{ fontSize: '9px' }}
                          >
                            {node.count}
                          </text>
                        )}

                        {/* Label */}
                        <text
                          y={nodeSize + 14}
                          textAnchor="middle"
                          className="fill-gray-700"
                          style={{ fontSize: '10px', fontWeight: isSelected ? 'bold' : 'normal' }}
                        >
                          {node.value.length > 18 ? node.value.slice(0, 18) + '...' : node.value}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>

          {/* Legend */}
          <div className="p-3 border-t bg-muted/30">
            <div className="flex flex-wrap gap-3 justify-center">
              {Object.entries(NODE_CONFIG).slice(0, -1).map(([type, config]) => (
                <div key={type} className="flex items-center gap-1 text-xs">
                  <div className={`w-3 h-3 rounded-full ${config.bgColor}`} />
                  <span className="capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected Node Details */}
      {selectedNode && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {(() => {
                const Icon = NODE_CONFIG[selectedNode.type]?.icon || Circle;
                return <Icon className="h-4 w-4" />;
              })()}
              {selectedNode.value}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span>{' '}
                <Badge variant="outline" className="capitalize">{selectedNode.type}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Appearances:</span>{' '}
                <Badge>{selectedNode.count}</Badge>
              </div>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Found in tables:</span>{' '}
              <span>{selectedNode.sources.join(', ')}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Connected to:</span>{' '}
              <span>{selectedNode.connections.length} entities</span>
            </div>
            {selectedNode.connections.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedNode.connections.slice(0, 10).map((connId, i) => {
                  const connNode = graph.nodes.find(n => n.id === connId);
                  if (!connNode) return null;
                  return (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-xs cursor-pointer hover:bg-secondary/80"
                      onClick={() => setSelectedNode(connNode)}
                    >
                      {connNode.value.slice(0, 15)}
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clusters */}
      {graph.clusters.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Entity Clusters</CardTitle>
            <CardDescription>Groups of related entities found</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-2">
              {graph.clusters.slice(0, 5).map((cluster) => (
                <div key={cluster.id} className="p-2 bg-muted/50 rounded">
                  <div className="text-sm font-medium mb-1">{cluster.label}</div>
                  <div className="flex flex-wrap gap-1">
                    {cluster.nodes.slice(0, 8).map((nodeId) => {
                      const node = graph.nodes.find(n => n.id === nodeId);
                      if (!node) return null;
                      return (
                        <Badge
                          key={nodeId}
                          variant="outline"
                          className="text-xs cursor-pointer"
                          onClick={() => setSelectedNode(node)}
                        >
                          {node.value.slice(0, 12)}
                        </Badge>
                      );
                    })}
                    {cluster.nodes.length > 8 && (
                      <Badge variant="secondary" className="text-xs">
                        +{cluster.nodes.length - 8} more
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CorrelationGraphView;
