'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/store/settings';
import { useHealthCheck } from '@/hooks/useApi';
import {
  Settings,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

export function SettingsView() {
  const {
    baseUrl,
    bearerToken,
    allowSelfSigned,
    theme,
    setBaseUrl,
    setBearerToken,
    setAllowSelfSigned,
    setTheme,
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
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    // Temporarily update settings for testing
    const originalUrl = baseUrl;
    const originalToken = bearerToken;
    setBaseUrl(localBaseUrl);
    setBearerToken(localToken);

    try {
      const result = await refetch();
      if (result.isSuccess && result.data?.status === 'healthy') {
        setTestResult('success');
        toast.success('Connection successful!');
      } else {
        setTestResult('error');
        toast.error('Connection failed. Please check your settings.');
        // Restore original settings on failure
        setBaseUrl(originalUrl);
        setBearerToken(originalToken);
      }
    } catch {
      setTestResult('error');
      toast.error('Connection failed. Please check your settings.');
      // Restore original settings on failure
      setBaseUrl(originalUrl);
      setBearerToken(originalToken);
    } finally {
      setTesting(false);
    }
  };

  const handleReset = () => {
    setLocalBaseUrl('http://localhost:8080');
    setLocalToken('');
    setAllowSelfSigned(false);
    setTheme('system');
    toast.success('Settings reset to defaults');
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h2>
        <p className="text-muted-foreground">
          Configure your API connection and application preferences.
        </p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        {/* Connection Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>
              Configure the API server connection settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                The base URL of your API server (e.g., http://localhost:8080 or https://api.example.com)
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
                  Enable this option if using self-signed SSL certificates (not recommended for production)
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
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
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
          </CardContent>
        </Card>

        {/* Appearance Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Customize the application appearance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Theme</Label>
              <div className="flex gap-2">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <Button
                    key={t}
                    variant={theme === t ? 'default' : 'outline'}
                    onClick={() => setTheme(t)}
                    className="capitalize"
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
