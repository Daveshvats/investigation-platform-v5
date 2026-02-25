'use client';

import { useAppStore, useSettingsStore } from '@/store/settings';
import { useLogout } from '@/hooks/useApi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  Table2,
  Search,
  GitBranch,
  Settings,
  ChevronLeft,
  ChevronRight,
  Database,
  Network,
  LogIn,
  LogOut,
  Loader2,
} from 'lucide-react';
import type { ViewType } from '@/types/api';

const mainNavItems: { id: ViewType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tables', label: 'Database Tables', icon: Table2 },
];

const searchNavItems: { id: ViewType; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'search', label: 'Quick Search', icon: Search, description: 'Simple database search' },
  { id: 'robust-search', label: 'Deep Search', icon: Network, description: 'Full pagination + correlation' },
];

const analysisNavItems: { id: ViewType; label: string; icon: React.ElementType }[] = [
  { id: 'pipeline', label: 'Pipeline Jobs', icon: GitBranch },
];

export function Sidebar() {
  const { currentView, setCurrentView, sidebarOpen, toggleSidebar } = useAppStore();
  const { user, authType, authToken } = useSettingsStore();
  const logoutMutation = useLogout();

  const isLoggedIn = authType === 'bearer' && authToken && user;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // Error handled in mutation
    }
  };

  return (
    <div
      className={cn(
        'relative flex flex-col border-r bg-background transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          {sidebarOpen && (
            <span className="font-semibold text-lg">Investigation</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        {/* Main Section */}
        <div className="px-2">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <Button
                key={item.id}
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-3 mb-1',
                  !sidebarOpen && 'justify-center px-2'
                )}
                onClick={() => setCurrentView(item.id)}
              >
                <Icon className="h-4 w-4" />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
              </Button>
            );
          })}
        </div>

        {sidebarOpen && (
          <div className="px-4 py-2">
            <Separator />
          </div>
        )}

        {/* Search Section */}
        {sidebarOpen && (
          <div className="px-4 mb-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Search
            </p>
          </div>
        )}
        <div className="px-2">
          {searchNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <Button
                key={item.id}
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-3 mb-1',
                  !sidebarOpen && 'justify-center px-2'
                )}
                onClick={() => setCurrentView(item.id)}
              >
                <Icon className="h-4 w-4" />
                {sidebarOpen && (
                  <div className="flex flex-col items-start">
                    <span className="text-sm">{item.label}</span>
                    {item.description && (
                      <span className="text-[10px] text-muted-foreground">{item.description}</span>
                    )}
                  </div>
                )}
              </Button>
            );
          })}
        </div>

        {sidebarOpen && (
          <div className="px-4 py-2">
            <Separator />
          </div>
        )}

        {/* Analysis Section */}
        {sidebarOpen && (
          <div className="px-4 mb-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Analysis
            </p>
          </div>
        )}
        <div className="px-2">
          {analysisNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <Button
                key={item.id}
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-3 mb-1',
                  !sidebarOpen && 'justify-center px-2'
                )}
                onClick={() => setCurrentView(item.id)}
              >
                <Icon className="h-4 w-4" />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      {/* User Section / Login */}
      <div className="border-t p-2 space-y-1">
        {isLoggedIn && user ? (
          <div className="flex items-center gap-2 p-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {getInitials(user.name || user.username || 'U')}
              </AvatarFallback>
            </Avatar>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{user.name || user.username}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        ) : (
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start gap-3',
              !sidebarOpen && 'justify-center px-2'
            )}
            onClick={() => setCurrentView('settings')}
          >
            <LogIn className="h-4 w-4" />
            {sidebarOpen && <span className="text-sm">Sign In</span>}
          </Button>
        )}
        
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-3',
            !sidebarOpen && 'justify-center px-2'
          )}
          onClick={() => setCurrentView('settings')}
        >
          <Settings className="h-4 w-4" />
          {sidebarOpen && <span className="text-sm">Settings</span>}
        </Button>
      </div>

      {/* Collapse Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-sm"
        onClick={toggleSidebar}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
