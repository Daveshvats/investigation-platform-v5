'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useLogout, useCurrentUser } from '@/hooks/useApi';
import { useSettingsStore } from '@/store/settings';
import { Loader2, LogOut, User, Shield } from 'lucide-react';
import { toast } from 'sonner';

export function UserInfo() {
  const { user, authType, authToken } = useSettingsStore();
  const logoutMutation = useLogout();
  const { data: currentUser, isLoading } = useCurrentUser();

  // Use stored user or fetch from API
  const displayUser = user || currentUser;

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success('Logged out successfully');
    } catch {
      toast.error('Logout failed');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!displayUser) {
    return null;
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Account
        </CardTitle>
        <CardDescription>
          You are signed in with your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback>
              {getInitials(displayUser.name || displayUser.username || 'U')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{displayUser.name || displayUser.username}</div>
            <div className="text-sm text-muted-foreground truncate">{displayUser.email}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {displayUser.role}
              </Badge>
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Bearer Token
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Auth type: <code className="bg-muted px-1 rounded">{authType}</code>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" />
            )}
            Sign Out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
