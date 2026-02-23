'use client';

import React, { useMemo, useState } from 'react';
import type { CorrelationGraph, FilteredResult } from '@/lib/robust-agent-search';

interface CorrelationGraphViewProps {
  graph: CorrelationGraph;
  results: FilteredResult[];
  onNodeClick?: (nodeId: string) => void;
}

// Node colors by type
const NODE_COLORS: Record<string, string> = {
  person: '#3B82F6',    // Blue
  phone: '#10B981',     // Green
  email: '#8B5CF6',     // Purple
  location: '#F59E0B',  // Amber
  company: '#EF4444',   // Red
  account: '#6366F1',   // Indigo
  other: '#6B7280',     // Gray
};

// Node icons by type
const NODE_ICONS: Record<string, string> = {
  person: '👤',
  phone: '📱',
  email: '📧',
  location: '📍',
  company: '🏢',
  account: '💳',
  other: '📌',
};

export function CorrelationGraphView({ graph, results, onNodeClick }: CorrelationGraphViewProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  // Filter nodes by type
  const filteredNodes = useMemo(() => {
    if (filterType === 'all') return graph.nodes;
    return graph.nodes.filter(n => n.type === filterType);
  }, [graph.nodes, filterType]);

  // Get node statistics
  const nodeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const node of graph.nodes) {
      stats[node.type] = (stats[node.type] || 0) + 1;
    }
    return stats;
  }, [graph.nodes]);

  // Handle node click
  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(selectedNode === nodeId ? null : nodeId);
    onNodeClick?.(nodeId);
  };

  // Get connected nodes for selected node
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const node = graph.nodes.find(n => n.id === selectedNode);
    return node?.connections || [];
  }, [selectedNode, graph.nodes]);

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            filterType === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All ({graph.nodes.length})
        </button>
        {Object.entries(nodeStats).map(([type, count]) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterType === type
                ? 'text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={{
              backgroundColor: filterType === type ? NODE_COLORS[type] : undefined,
            }}
          >
            {NODE_ICONS[type]} {type} ({count})
          </button>
        ))}
      </div>

      {/* Graph Visualization */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* SVG Graph */}
        <svg
          width="100%"
          height="400"
          className="w-full"
          viewBox="0 0 800 400"
        >
          {/* Edges */}
          <g className="edges">
            {graph.edges.slice(0, 100).map((edge, i) => {
              const sourceIndex = filteredNodes.findIndex(n => n.id === edge.source);
              const targetIndex = filteredNodes.findIndex(n => n.id === edge.target);
              
              if (sourceIndex === -1 || targetIndex === -1) return null;

              const cols = Math.ceil(Math.sqrt(filteredNodes.length));
              const sourceX = ((sourceIndex % cols) + 1) * (800 / (cols + 1));
              const sourceY = (Math.floor(sourceIndex / cols) + 1) * (400 / (Math.ceil(filteredNodes.length / cols) + 1));
              const targetX = ((targetIndex % cols) + 1) * (800 / (cols + 1));
              const targetY = (Math.floor(targetIndex / cols) + 1) * (400 / (Math.ceil(filteredNodes.length / cols) + 1));

              const isHighlighted = selectedNode && 
                (edge.source === selectedNode || edge.target === selectedNode);

              return (
                <line
                  key={i}
                  x1={sourceX}
                  y1={sourceY}
                  x2={targetX}
                  y2={targetY}
                  stroke={isHighlighted ? '#3B82F6' : '#E5E7EB'}
                  strokeWidth={isHighlighted ? 2 : 1}
                  opacity={isHighlighted ? 1 : 0.3}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {filteredNodes.slice(0, 100).map((node, i) => {
              const cols = Math.ceil(Math.sqrt(filteredNodes.length));
              const x = ((i % cols) + 1) * (800 / (cols + 1));
              const y = (Math.floor(i / cols) + 1) * (400 / (Math.ceil(filteredNodes.length / cols) + 1));
              
              const isSelected = selectedNode === node.id;
              const isConnected = connectedNodes.includes(node.id);
              const radius = Math.min(20, 8 + node.count * 2);

              return (
                <g
                  key={node.id}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => handleNodeClick(node.id)}
                  className="cursor-pointer"
                >
                  <circle
                    r={radius}
                    fill={NODE_COLORS[node.type]}
                    stroke={isSelected ? '#1F2937' : 'white'}
                    strokeWidth={isSelected ? 3 : 2}
                    opacity={selectedNode && !isSelected && !isConnected ? 0.3 : 1}
                  />
                  <text
                    textAnchor="middle"
                    dy="0.35em"
                    fill="white"
                    fontSize={10}
                    fontWeight="bold"
                  >
                    {node.count}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Legend */}
        <div className="border-t border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <span className="font-medium">Legend:</span>
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{type}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 ml-4">
              <div className="w-4 h-4 rounded-full bg-gray-400" />
              <span>Size = frequency</span>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Node Details */}
      {selectedNode && (
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">
            Selected: {graph.nodes.find(n => n.id === selectedNode)?.value}
          </h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Type:</span>
              <span className="ml-2 font-medium">
                {graph.nodes.find(n => n.id === selectedNode)?.type}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Appearances:</span>
              <span className="ml-2 font-medium">
                {graph.nodes.find(n => n.id === selectedNode)?.count}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Connections:</span>
              <span className="ml-2 font-medium">
                {connectedNodes.length}
              </span>
            </div>
          </div>
          {connectedNodes.length > 0 && (
            <div className="mt-3">
              <span className="text-gray-500 text-sm">Connected to:</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {connectedNodes.slice(0, 10).map(connId => {
                  const node = graph.nodes.find(n => n.id === connId);
                  if (!node) return null;
                  return (
                    <span
                      key={connId}
                      className="px-2 py-1 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: NODE_COLORS[node.type] }}
                    >
                      {node.value}
                    </span>
                  );
                })}
                {connectedNodes.length > 10 && (
                  <span className="text-xs text-gray-500">
                    +{connectedNodes.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Entity List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <h4 className="font-medium text-gray-900">Top Entities</h4>
        </div>
        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium text-gray-700">Entity</th>
                <th className="text-left p-2 font-medium text-gray-700">Type</th>
                <th className="text-right p-2 font-medium text-gray-700">Count</th>
                <th className="text-right p-2 font-medium text-gray-700">Connections</th>
              </tr>
            </thead>
            <tbody>
              {graph.nodes.slice(0, 20).map(node => (
                <tr
                  key={node.id}
                  onClick={() => handleNodeClick(node.id)}
                  className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                    selectedNode === node.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="p-2">
                    <span className="mr-2">{NODE_ICONS[node.type]}</span>
                    {node.value}
                  </td>
                  <td className="p-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: NODE_COLORS[node.type] }}
                    >
                      {node.type}
                    </span>
                  </td>
                  <td className="p-2 text-right font-medium">{node.count}</td>
                  <td className="p-2 text-right text-gray-500">
                    {node.connections.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default CorrelationGraphView;
