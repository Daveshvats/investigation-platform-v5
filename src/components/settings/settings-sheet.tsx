'use client';

import { useSettingsStore, useAppStore } from '@/store/settings';
import { useHealthCheck, useLogout } from '@/hooks/useApi';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Key,
  User,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AuthType } from '@/types/api';

export function SettingsSheet() {
  const {
    baseUrl,
    authType,
    authToken,
    user,
    allowSelfSigned,
    setBaseUrl,
    setAuthType,
    setAuthToken,
    setAllowSelfSigned,
  } = useSettingsStore();
  const { settingsOpen, toggleSettings } = useAppStore();

  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localAuthType, setLocalAuthType] = useState<AuthType>(authType);
  const [localToken, setLocalToken] = useState(authToken);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const { refetch } = useHealthCheck();
  const logoutMutation = useLogout();

  const isLoggedIn = authType === 'bearer' && authToken && user;

  const handleSave = () => {
    setBaseUrl(localBaseUrl);
    setAuthType(localAuthType);
    setAuthToken(localToken);
    toast.success('Settings saved');
    toggleSettings();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    setBaseUrl(localBaseUrl);
    setAuthType(localAuthType);
    setAuthToken(localToken);

    try {
      const result = await refetch();
      if (result.isSuccess && result.data?.status === 'UP') {
        setTestResult('success');
        toast.success('Connection successful!');
      } else {
        setTestResult('error');
        toast.error('Connection failed');
      }
    } catch {
      setTestResult('error');
      toast.error('Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success('Logged out successfully');
    } catch {
      toast.error('Logout failed');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sheet open={settingsOpen} onOpenChange={toggleSettings}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Quick Settings</SheetTitle>
          <SheetDescription>
            Configure API connection settings
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* User info if logged in */}
          {isLoggedIn && user && (
            <>
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {getInitials(user.name || user.username || 'U')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{user.name || user.username}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Separator />
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="quick-url">API URL</Label>
            <Input
              id="quick-url"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              placeholder="http://localhost:5000"
            />
          </div>

          <div className="space-y-3">
            <Label>Authentication Method</Label>
            <RadioGroup
              value={localAuthType}
              onValueChange={(value) => setLocalAuthType(value as AuthType)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="api-key" id="api-key" />
                <Label htmlFor="api-key" className="flex items-center gap-1 cursor-pointer">
                  <Key className="h-3.5 w-3.5" />
                  API Key
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bearer" id="bearer" />
                <Label htmlFor="bearer" className="flex items-center gap-1 cursor-pointer">
                  <User className="h-3.5 w-3.5" />
                  Bearer Token
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-token">
              {localAuthType === 'api-key' ? 'API Key' : 'Bearer Token'}
            </Label>
            <div className="relative">
              <Input
                id="quick-token"
                type={showToken ? 'text' : 'password'}
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                placeholder={localAuthType === 'api-key' ? 'lsd_live_xxx' : 'Optional'}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {localAuthType === 'api-key' 
                ? 'For automation/AI agents (5,000 req/min)'
                : 'For user sessions (1,000 req/min)'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="quick-ssl">Allow Self-Signed SSL</Label>
            <Switch
              id="quick-ssl"
              checked={allowSelfSigned}
              onCheckedChange={setAllowSelfSigned}
            />
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : testResult === 'success' ? (
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
              ) : testResult === 'error' ? (
                <XCircle className="h-4 w-4 mr-2 text-red-500" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Test
            </Button>
            <Button className="flex-1" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
