'use client';

import { HealthCard } from './health-card';
import { CDCCard } from './cdc-card';
import { StatsCard } from './stats-card';
import { RecentJobsCard } from './recent-jobs-card';
import { UserActivityCard } from './user-activity-card';
import { SavedSearchesCard } from './saved-searches-card';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/settings';
import { Table2, Search, GitBranch, Settings, Zap, Shield, BarChart3 } from 'lucide-react';
import type { ViewType } from '@/types/api';

export function DashboardView() {
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">
          Welcome to API Dashboard
        </h2>
        <p className="text-muted-foreground">
          Monitor your API status, browse tables, search data, and manage pipeline jobs.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <HealthCard />
        <CDCCard />
        <StatsCard />
      </div>

      {/* User Activity & Saved Searches Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <UserActivityCard />
        <SavedSearchesCard />
      </div>

      {/* Recent Jobs & Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentJobsCard />
        <QuickActionsCard />
      </div>

      {/* Features Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <FeatureCard
          icon={<Zap className="h-6 w-6" />}
          title="Fast Search"
          description="Full-text search across all tables with real-time results and advanced filtering capabilities."
        />
        <FeatureCard
          icon={<Shield className="h-6 w-6" />}
          title="Secure Export"
          description="Export data in multiple formats including JSON, CSV, and PDF with confidential watermarks."
        />
        <FeatureCard
          icon={<BarChart3 className="h-6 w-6" />}
          title="Real-time Monitoring"
          description="Live status updates for health, CDC, and pipeline jobs with automatic refresh."
        />
      </div>
    </div>
  );
}

function QuickActionsCard() {
  const { setCurrentView } = useAppStore();

  const actions = [
    { title: 'Browse Tables', description: 'View schemas & records', icon: <Table2 className="h-5 w-5" />, view: 'tables' as ViewType },
    { title: 'Search Data', description: 'Search all tables', icon: <Search className="h-5 w-5" />, view: 'search' as ViewType },
    { title: 'Pipeline Jobs', description: 'Manage pipelines', icon: <GitBranch className="h-5 w-5" />, view: 'pipeline' as ViewType },
    { title: 'Settings', description: 'Configure API', icon: <Settings className="h-5 w-5" />, view: 'settings' as ViewType },
  ];

  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="font-semibold mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Button
            key={action.view}
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-4 text-left"
            onClick={() => setCurrentView(action.view)}
          >
            <div className="flex items-center gap-2">
              {action.icon}
              <span className="font-medium">{action.title}</span>
            </div>
            <span className="text-xs text-muted-foreground">{action.description}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
