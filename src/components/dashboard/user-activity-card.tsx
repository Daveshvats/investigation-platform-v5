'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSettingsStore } from '@/store/settings';
import { useAppStore } from '@/store/settings';
import { 
  Clock, 
  Search, 
  Table2, 
  FileText, 
  TrendingUp,
  ArrowRight,
  LogIn
} from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'search' | 'table' | 'export' | 'login';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'user-activity-log';

// Module-level cache to avoid recreating arrays
let cachedActivities: ActivityItem[] | null = null;
let cachedJsonString: string | null = null;

// Get activity from localStorage with caching
const getStoredActivities = (): ActivityItem[] => {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    
    // Return cached result if JSON string hasn't changed
    if (stored === cachedJsonString && cachedActivities) {
      return cachedActivities;
    }
    
    // Parse and cache new result
    cachedJsonString = stored;
    cachedActivities = stored ? JSON.parse(stored) : [];
    return cachedActivities;
  } catch {
    cachedJsonString = null;
    cachedActivities = [];
    return cachedActivities;
  }
};

// Save activity to localStorage - exported for use in other components
export function addActivity(activity: { type: 'search' | 'table' | 'export' | 'login'; description: string; metadata?: Record<string, unknown> }) {
  if (typeof window === 'undefined') return;
  try {
    const stored = getStoredActivities();
    const newActivity: ActivityItem = {
      ...activity,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
    };
    // Keep only last 50 activities
    const updated = [newActivity, ...stored].slice(0, 50);
    
    // Update cache directly
    cachedActivities = updated;
    cachedJsonString = JSON.stringify(updated);
    localStorage.setItem(STORAGE_KEY, cachedJsonString);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('activity-updated'));
  } catch (e) {
    console.error('Failed to save activity:', e);
  }
}

const getActivityIcon = (type: ActivityItem['type']) => {
  switch (type) {
    case 'search':
      return <Search className="h-4 w-4 text-blue-500" />;
    case 'table':
      return <Table2 className="h-4 w-4 text-green-500" />;
    case 'export':
      return <FileText className="h-4 w-4 text-orange-500" />;
    case 'login':
      return <LogIn className="h-4 w-4 text-purple-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
};

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export function UserActivityCard() {
  const { user } = useSettingsStore();
  const { setCurrentView } = useAppStore();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const mountedRef = useRef(false);

  // Subscribe to activity updates
  useEffect(() => {
    const handleActivityUpdate = () => {
      setActivities(getStoredActivities());
    };

    // Load initial data on mount
    handleActivityUpdate();
    mountedRef.current = true;

    window.addEventListener('activity-updated', handleActivityUpdate);
    
    return () => {
      window.removeEventListener('activity-updated', handleActivityUpdate);
    };
  }, []);

  // Calculate stats
  const today = new Date();
  const todaysActivities = activities.filter(a => 
    new Date(a.timestamp).toDateString() === today.toDateString()
  );
  const todaysSearches = todaysActivities.filter(a => a.type === 'search').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {user ? `${user.name || user.username}'s Activity` : 'Recent Activity'}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {todaysSearches} searches today
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-6">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No activity yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Start searching to track your activity
            </p>
            {!user && (
              <Button 
                variant="outline" 
                size="sm"
                className="mt-3"
                onClick={() => setCurrentView('settings')}
              >
                Sign In
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activities.slice(0, 5).map((activity) => (
              <div 
                key={activity.id} 
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-shrink-0 p-2 rounded-full bg-muted">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{activity.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{activities.length}</div>
            <div className="text-xs text-muted-foreground">Actions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">
              {activities.filter(a => a.type === 'search').length}
            </div>
            <div className="text-xs text-muted-foreground">Searches</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-500">
              {activities.filter(a => a.type === 'export').length}
            </div>
            <div className="text-xs text-muted-foreground">Exports</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}