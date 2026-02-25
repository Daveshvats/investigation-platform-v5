'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTables } from '@/hooks/useApi';

const COLORS = [
  '#1F4E79',
  '#2E7D32',
  '#C62828',
  '#F57C00',
  '#7B1FA2',
  '#00838F',
  '#5D4037',
  '#455A64',
];

interface TableStatsChartProps {
  limit?: number;
}

export function TableStatsChart({ limit = 8 }: TableStatsChartProps) {
  const { data, isLoading } = useTables();

  const chartData = useMemo(() => {
    if (!data?.tables) return [];
    return data.tables
      .slice(0, limit)
      .map((table) => ({
        name: table.name.length > 12 ? table.name.slice(0, 12) + '...' : table.name,
        fullName: table.name,
        columns: table.columns,
        searchable: table.searchable.length,
      }));
  }, [data, limit]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Table Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #E0E0E0',
                borderRadius: '8px',
              }}
              formatter={(value: number, name: string) => [
                value,
                name === 'columns' ? 'Columns' : 'Searchable Fields',
              ]}
              labelFormatter={(label, payload) => {
                const item = payload?.[0]?.payload;
                return item?.fullName || label;
              }}
            />
            <Bar dataKey="columns" fill="#1F4E79" radius={[4, 4, 0, 0]} />
            <Bar dataKey="searchable" fill="#4CAF50" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface SearchableFieldsPieChartProps {
  limit?: number;
}

export function SearchableFieldsPieChart({ limit = 6 }: SearchableFieldsPieChartProps) {
  const { data, isLoading } = useTables();

  const chartData = useMemo(() => {
    if (!data?.tables) return [];
    return data.tables
      .filter((t) => t.searchable.length > 0)
      .slice(0, limit)
      .map((table) => ({
        name: table.name.length > 10 ? table.name.slice(0, 10) + '...' : table.name,
        fullName: table.name,
        value: table.searchable.length,
      }));
  }, [data, limit]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Searchable Fields</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
          No searchable fields found
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Searchable Fields by Table</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              label={({ name, value }) => `${name}: ${value}`}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [value, 'Fields']}
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #E0E0E0',
                borderRadius: '8px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
