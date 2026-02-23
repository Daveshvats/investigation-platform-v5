'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { SettingsSheet } from '@/components/settings/settings-sheet';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { TablesView } from '@/components/tables/tables-view';
import { SearchView } from '@/components/search/search-view';
import { UnifiedSearchView } from '@/components/search/unified-search-view';
import { RobustSearchView } from '@/components/search/robust-search-view';
import { PipelineView } from '@/components/pipeline/pipeline-view';
import { SettingsView } from '@/components/settings/settings-view';
import { InvestigationView } from '@/components/investigation/investigation-view';
import { useAppStore, useSettingsStore } from '@/store/settings';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';

function AppContent() {
  const { currentView } = useAppStore();

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'tables':
        return <TablesView />;
      case 'search':
        return <SearchView />;
      case 'ai-search':
        return <UnifiedSearchView />;
      case 'robust-search':
        return <RobustSearchView />;
      case 'pipeline':
        return <PipelineView />;
      case 'settings':
        return <SettingsView />;
      case 'investigation':
        return <InvestigationView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <MainLayout>
      {renderView()}
      <SettingsSheet />
    </MainLayout>
  );
}

export default function Home() {
  const { theme } = useSettingsStore();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme={theme}
        enableSystem
        disableTransitionOnChange
      >
        <AppContent />
        <Toaster position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
