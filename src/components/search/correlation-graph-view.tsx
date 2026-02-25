'use client';

/**
 * Correlation Graph View Component
 * Interactive network visualization with pan and zoom
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { CorrelationGraph, GraphNode, GraphEdge } from '@/store/investigation-store';

interface Props {
  graph: CorrelationGraph;
}

// Node colors by type
const NODE_COLORS: Record<string, string> = {
  phone: '#FF6B6B',
  email: '#4ECDC4',
  person: '#45B7D1',
  address: '#96CEB4',
  account: '#FFEAA7',
  pan_number: '#DDA0DD',
  aadhaar_number: '#98D8C8',
  location: '#F7DC6F',
  company: '#BB8FCE',
  other: '#BDC3C7',
};

export function CorrelationGraphView({ graph }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // View state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Calculate node positions
  const getNodePositions = useCallback(() => {
    if (!graph || !graph.nodes || graph.nodes.length === 0) return {};

    const positions: Record<string, { x: number; y: number }> = {};
    const centerX = 400;
    const centerY = 300;
    const radius = Math.min(250, 200 + graph.nodes.length * 5);

    // Sort nodes by connections for better layout
    const sortedNodes = [...graph.nodes].sort((a, b) => b.connections.length - a.connections.length);

    sortedNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / sortedNodes.length;
      const nodeRadius = radius * (0.6 + 0.4 * (1 - i / sortedNodes.length));
      
      positions[node.id] = {
        x: centerX + nodeRadius * Math.cos(angle),
        y: centerY + nodeRadius * Math.sin(angle),
      };
    });

    return positions;
  }, [graph]);

  const nodePositions = getNodePositions();

  // Draw legend helper function (defined before draw to avoid hoisting issues)
  const drawLegend = (ctx: CanvasRenderingContext2D) => {
    const legendItems = [
      { type: 'phone', label: 'Phone' },
      { type: 'email', label: 'Email' },
      { type: 'person', label: 'Person' },
      { type: 'address', label: 'Address' },
      { type: 'account', label: 'Account' },
    ];

    ctx.font = '10px Arial';
    ctx.fillStyle = '#fff';

    let y = 20;
    ctx.fillText('Legend:', 10, y);
    y += 15;

    for (const item of legendItems) {
      ctx.beginPath();
      ctx.arc(20, y - 3, 5, 0, 2 * Math.PI);
      ctx.fillStyle = NODE_COLORS[item.type];
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(item.label, 30, y);
      y += 15;
    }
  };

  // Draw graph
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply transformations
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw edges
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.3)';
    ctx.lineWidth = 1;

    for (const edge of graph.edges) {
      const source = nodePositions[edge.source];
      const target = nodePositions[edge.target];

      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        
        // Thicker lines for stronger connections
        ctx.lineWidth = Math.min(edge.weight, 3);
        ctx.stroke();
      }
    }

    // Draw nodes
    for (const node of graph.nodes) {
      const pos = nodePositions[node.id];
      if (!pos) continue;

      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const nodeColor = NODE_COLORS[node.entityType] || NODE_COLORS.other;

      // Node size based on connections
      const baseSize = 8;
      const size = baseSize + Math.min(node.connections.length * 2, 15);

      // Draw glow for selected/hovered
      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size + 8, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
      }

      // Draw node
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = nodeColor;
      ctx.fill();

      // Draw border
      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.stroke();

      // Draw label for important nodes
      if (node.connections.length > 2 || isHovered || isSelected) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        const label = node.label.length > 15 ? node.label.substring(0, 12) + '...' : node.label;
        ctx.fillText(label, pos.x, pos.y + size + 12);
      }
    }

    ctx.restore();

    // Draw legend
    drawLegend(ctx);

  }, [graph, nodePositions, scale, offset, hoveredNode, selectedNode, drawLegend]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const handleResize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Redraw on state change
  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else {
      // Check for node hover
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - offset.x) / scale;
      const mouseY = (e.clientY - rect.top - offset.y) / scale;

      let foundNode: GraphNode | null = null;
      for (const node of graph.nodes) {
        const pos = nodePositions[node.id];
        if (!pos) continue;

        const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
        const size = 8 + Math.min(node.connections.length * 2, 15);
        
        if (dist < size) {
          foundNode = node;
          break;
        }
      }
      setHoveredNode(foundNode);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode);
    } else {
      setSelectedNode(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.min(Math.max(s * delta, 0.3), 3));
  };

  // Zoom controls
  const zoomIn = () => setScale(s => Math.min(s * 1.2, 3));
  const zoomOut = () => setScale(s => Math.max(s * 0.8, 0.3));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent>
          <p className="text-muted-foreground">No correlation data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full border rounded-lg overflow-hidden bg-slate-900">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        className="cursor-grab active:cursor-grabbing"
      />

      {/* Controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <Button variant="secondary" size="icon" onClick={zoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" onClick={zoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" onClick={resetView}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Selected Node Info */}
      {selectedNode && (
        <Card className="absolute bottom-2 left-2 w-64">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: NODE_COLORS[selectedNode.entityType] || NODE_COLORS.other }}
              />
              <span className="font-medium">{selectedNode.label}</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Type: {selectedNode.entityType}</p>
              <p>Connections: {selectedNode.connections.length}</p>
              <p>Occurrences: {selectedNode.occurrences}</p>
              <p>Sources: {selectedNode.sources.join(', ')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="absolute bottom-2 right-2">
        <Card>
          <CardContent className="p-2">
            <div className="flex gap-3 text-sm">
              <Badge variant="outline">
                {graph.nodes.length} nodes
              </Badge>
              <Badge variant="outline">
                {graph.edges.length} edges
              </Badge>
              <Badge variant="outline">
                Zoom: {(scale * 100).toFixed(0)}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
