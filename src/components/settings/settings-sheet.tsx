'use client';

import { useSettingsStore, useAppStore } from '@/store/settings';
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
import { useHealthCheck } from '@/hooks/useApi';
import { useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsSheet() {
  const { settingsOpen, toggleSettings } = useAppStore();
  const {
    baseUrl,
    bearerToken,
    allowSelfSigned,
    setBaseUrl,
    setBearerToken,
    setAllowSelfSigned,
  } = useSettingsStore();

  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localToken, setLocalToken] = useState(bearerToken);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const { refetch } = useHealthCheck();

  const handleSave = () => {
    setBaseUrl(localBaseUrl);
    setBearerToken(localToken);
    toast.success('Settings saved successfully');
    toggleSettings();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    // Temporarily update the settings for testing
    setBaseUrl(localBaseUrl);
    setBearerToken(localToken);

    try {
      const result = await refetch();
      if (result.isSuccess) {
        setTestResult('success');
        toast.success('Connection successful!');
      } else {
        setTestResult('error');
        toast.error('Connection failed. Please check your settings.');
      }
    } catch {
      setTestResult('error');
      toast.error('Connection failed. Please check your settings.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sheet open={settingsOpen} onOpenChange={toggleSettings}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure your API connection settings.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              placeholder="http://localhost:8080"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The base URL of your API server (e.g., http://localhost:8080)
            </p>
          </div>

          {/* Bearer Token */}
          <div className="space-y-2">
            <Label htmlFor="bearerToken">Bearer Token</Label>
            <div className="relative">
              <Input
                id="bearerToken"
                type={showToken ? 'text' : 'password'}
                placeholder="Enter your bearer token"
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Optional authentication token for API requests
            </p>
          </div>

          {/* Self-Signed Certificates */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="selfSigned">Allow Self-Signed Certificates</Label>
              <p className="text-xs text-muted-foreground">
                Enable this option if using self-signed SSL certificates
              </p>
            </div>
            <Switch
              id="selfSigned"
              checked={allowSelfSigned}
              onCheckedChange={setAllowSelfSigned}
            />
          </div>

          {/* Connection Test */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing}
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
            {testResult && (
              <div className="flex items-center gap-2">
                {testResult === 'success' ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm text-green-500">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    <span className="text-sm text-destructive">Failed</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={toggleSettings} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex-1">
              Save Changes
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
