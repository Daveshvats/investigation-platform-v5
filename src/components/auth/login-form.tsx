'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useLogin, useRegister } from '@/hooks/useApi';
import {
  Loader2,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';

export function LoginForm() {
  const [isRegister, setIsRegister] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!identifier.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      if (isRegister) {
        await registerMutation.mutateAsync({
          identifier,
          password,
          name: name || undefined,
        });
        toast.success('Account created successfully!');
      } else {
        await loginMutation.mutateAsync({
          identifier,
          password,
          rememberMe,
        });
        toast.success('Login successful!');
      }
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Authentication failed';
      toast.error(message);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isRegister ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
          {isRegister ? 'Create Account' : 'Sign In'}
        </CardTitle>
        <CardDescription>
          {isRegister 
            ? 'Create a new account to access the API'
            : 'Sign in with your credentials to access the API'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div className="space-y-2">
              <Label htmlFor="name">Name (Optional)</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="identifier">Email or Username</Label>
            <Input
              id="identifier"
              type="text"
              placeholder="user@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {!isRegister && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                Remember me for 30 days
              </Label>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : isRegister ? (
              <UserPlus className="h-4 w-4 mr-2" />
            ) : (
              <LogIn className="h-4 w-4 mr-2" />
            )}
            {isRegister ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {isRegister ? (
            <>
              Already have an account?{' '}
              <Button variant="link" className="p-0 h-auto" onClick={() => setIsRegister(false)}>
                Sign in
              </Button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <Button variant="link" className="p-0 h-auto" onClick={() => setIsRegister(true)}>
                Create one
              </Button>
            </>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Key className="h-4 w-4" />
            <span>
              You can also use an API Key in Settings for automation/AI agents
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
