'use client';

import { useSettingsStore, useAppStore } from '@/store/settings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useHealthCheck } from '@/hooks/useApi';
import {
  Settings,
  Moon,
  Sun,
  Monitor,
  Menu,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';

export function Header() {
  const { theme, setTheme } = useSettingsStore();
  const { currentView, toggleSidebar, toggleSettings } = useAppStore();
  const { data: health, isLoading, refetch, isError } = useHealthCheck();

  const getStatusIcon = () => {
    if (isLoading) {
      return <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
    if (isError || !health) {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    switch (health.status) {
      case 'healthy':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'down':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    if (isLoading) return 'Checking...';
    if (isError || !health) return 'Disconnected';
    return health.status.charAt(0).toUpperCase() + health.status.slice(1);
  };

  const getStatusColor = () => {
    if (isLoading) return 'secondary';
    if (isError || !health) return 'destructive';
    switch (health.status) {
      case 'healthy':
        return 'default';
      case 'degraded':
        return 'secondary';
      case 'down':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'dark':
        return <Moon className="h-4 w-4" />;
      case 'system':
        return <Monitor className="h-4 w-4" />;
    }
  };

  const getPageTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return 'Dashboard';
      case 'tables':
        return 'Tables Browser';
      case 'search':
        return 'Search';
      case 'pipeline':
        return 'Pipeline Jobs';
      case 'settings':
        return 'Settings';
      default:
        return 'API Dashboard';
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-4">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            {getStatusIcon()}
            <Badge variant={getStatusColor() as 'default' | 'secondary' | 'destructive'}>
              {getStatusText()}
            </Badge>
          </Button>
        </div>

        {/* Theme Toggle */}
        <Button variant="ghost" size="icon" onClick={cycleTheme}>
          {getThemeIcon()}
        </Button>

        {/* Settings Button */}
        <Button variant="ghost" size="icon" onClick={toggleSettings}>
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
