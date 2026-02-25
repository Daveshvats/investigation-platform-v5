'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSettingsStore } from '@/store/settings';
import { useHealthCheck } from '@/hooks/useApi';
import { LoginForm } from '@/components/auth/login-form';
import { UserInfo } from '@/components/auth/user-info';
import {
  Settings,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Key,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AuthType } from '@/types/api';

export function SettingsView() {
  const {
    baseUrl,
    authType,
    authToken,
    allowSelfSigned,
    theme,
    user,
    setBaseUrl,
    setAuthType,
    setAuthToken,
    setAllowSelfSigned,
    setTheme,
  } = useSettingsStore();

  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localAuthType, setLocalAuthType] = useState<AuthType>(authType);
  const [localToken, setLocalToken] = useState(authToken);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const { refetch } = useHealthCheck();

  // Check if user is logged in (via login form)
  const isLoggedIn = authType === 'bearer' && authToken && user;

  const handleSave = () => {
    setBaseUrl(localBaseUrl);
    setAuthType(localAuthType);
    setAuthToken(localToken);
    toast.success('Settings saved successfully');
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    // Temporarily update settings for testing
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
        toast.error('Connection failed. Please check your settings.');
      }
    } catch {
      setTestResult('error');
      toast.error('Connection failed. Please check your settings.');
    } finally {
      setTesting(false);
    }
  };

  const handleReset = () => {
    setLocalBaseUrl('http://localhost:5000');
    setLocalAuthType('api-key');
    setLocalToken('');
    setAllowSelfSigned(false);
    setTheme('system');
    toast.success('Settings reset to defaults');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h2>
        <p className="text-muted-foreground">
          Configure your API connection and application preferences.
        </p>
      </div>

      {/* Authentication Section */}
      {isLoggedIn ? (
        <UserInfo />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Authentication</h3>
          </div>
          
          {/* Login Form */}
          <LoginForm />
        </div>
      )}

      {/* API Connection */}
      <Card>
        <CardHeader>
          <CardTitle>API Connection</CardTitle>
          <CardDescription>
            Configure the connection to your API server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              placeholder="http://localhost:5000"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <Label>Authentication Method</Label>
            <RadioGroup
              value={localAuthType}
              onValueChange={(value) => setLocalAuthType(value as AuthType)}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="api-key" id="settings-api-key" />
                <Label htmlFor="settings-api-key" className="flex items-center gap-1.5 cursor-pointer">
                  <Key className="h-4 w-4" />
                  API Key
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bearer" id="settings-bearer" />
                <Label htmlFor="settings-bearer" className="flex items-center gap-1.5 cursor-pointer">
                  <User className="h-4 w-4" />
                  Bearer Token
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {localAuthType === 'api-key' 
                ? 'API keys (X-API-Key header) are used for automation and AI agents with higher rate limits (5,000 req/min)'
                : 'Bearer tokens (Authorization header) are used for web application user sessions (1,000 req/min)'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="token">
              {localAuthType === 'api-key' ? 'API Key' : 'Bearer Token'}
            </Label>
            <div className="relative">
              <Input
                id="token"
                type={showToken ? 'text' : 'password'}
                placeholder={localAuthType === 'api-key' ? 'lsd_live_xxx' : 'Enter bearer token'}
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {localAuthType === 'api-key' && (
              <p className="text-xs text-muted-foreground">
                Or sign in above to use your account credentials instead
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow Self-Signed Certificates</Label>
              <p className="text-xs text-muted-foreground">
                Enable if using a development server with self-signed certificates
              </p>
            </div>
            <Switch
              checked={allowSelfSigned}
              onCheckedChange={setAllowSelfSigned}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleTestConnection} variant="outline" disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : testResult === 'success' ? (
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
              ) : testResult === 'error' ? (
                <XCircle className="h-4 w-4 mr-2 text-red-500" />
              ) : null}
              Test Connection
            </Button>
            <Button onClick={handleSave}>Save Settings</Button>
          </div>
        </CardContent>
      </Card>

      {/* Authentication Info */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Details</CardTitle>
          <CardDescription>
            How authentication works with the L.S.D API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-4 font-medium border-b pb-2">
              <div>Method</div>
              <div>Header</div>
              <div>Rate Limit</div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" />
                API Key
              </div>
              <div><code className="text-xs bg-muted px-1 rounded">X-API-Key: lsd_live_xxx</code></div>
              <div>5,000 req/min</div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Bearer Token
              </div>
              <div><code className="text-xs bg-muted px-1 rounded">Authorization: Bearer xxx</code></div>
              <div>1,000 req/min</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize the look and feel of the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">
                Select your preferred color theme
              </p>
            </div>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <Button
                  key={t}
                  variant={theme === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
