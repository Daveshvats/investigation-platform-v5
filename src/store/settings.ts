import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SettingsState, AppState, ViewType, UserInfo } from '@/types/api';

/**
 * Secure Storage Implementation
 * 
 * Security Notes:
 * 1. API Keys: Tokens NOT persisted - require re-entry each session
 * 2. User Session: Only non-sensitive settings persisted to localStorage
 * 3. For production: Backend should set JWT tokens in httpOnly cookies
 * 
 * Migration from v2 to v3:
 * - Tokens are no longer persisted to storage
 * - Users will need to re-enter credentials after browser restart
 */

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: 'http://localhost:5000',
      authType: 'api-key',
      authToken: '',
      bearerToken: '', // Kept for backward compatibility
      allowSelfSigned: false,
      theme: 'system',
      user: null,
      
      setBaseUrl: (url) => set({ baseUrl: url }),
      setAuthType: (type) => set({ authType: type }),
      setAuthToken: (token) => set({ authToken: token }),
      setBearerToken: (token) => set({ bearerToken: token, authToken: token }),
      setAllowSelfSigned: (allow) => set({ allowSelfSigned: allow }),
      setTheme: (theme) => set({ theme }),
      setUser: (user: UserInfo | null) => set({ user }),
      
      logout: () => {
        // Clear sensitive data from sessionStorage
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('auth-token');
          sessionStorage.removeItem('bearer-token');
        }
        set({ 
          user: null, 
          authToken: '', 
          bearerToken: '',
          authType: 'api-key'
        });
      },
    }),
    {
      name: 'api-dashboard-settings',
      storage: createJSONStorage(() => localStorage),
      version: 3, // Bump version for new security model
      partialize: (state) => ({
        // Only persist non-sensitive settings
        baseUrl: state.baseUrl,
        authType: state.authType,
        allowSelfSigned: state.allowSelfSigned,
        theme: state.theme,
        // Explicitly NOT persisting tokens or user info
      }),
      migrate: (persistedState, version) => {
        // Clear old data if version is older (security update)
        if (version < 3) {
          console.log('Security update: Clearing old cached credentials');
          return {
            baseUrl: 'http://localhost:5000',
            authType: 'api-key',
            authToken: '',
            bearerToken: '',
            allowSelfSigned: false,
            theme: 'system',
            user: null,
          };
        }
        return persistedState as SettingsState;
      },
    }
  )
);

export const useAppStore = create<AppState>()((set) => ({
  currentView: 'dashboard',
  selectedTable: null,
  selectedRecords: [],
  sidebarOpen: true,
  settingsOpen: false,
  setCurrentView: (view: ViewType) => set({ currentView: view, selectedTable: null }),
  setSelectedTable: (table: string | null) => set({ selectedTable: table }),
  setSelectedRecords: (records: Record<string, unknown>[]) => set({ selectedRecords: records }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
}));

/**
 * Security utility functions
 */
export const securityUtils = {
  // Check if running in secure context
  isSecureContext: () => {
    if (typeof window === 'undefined') return false;
    return window.isSecureContext;
  },

  // Clear all stored credentials
  clearAllCredentials: () => {
    if (typeof window === 'undefined') return;
    
    // Clear localStorage settings
    localStorage.removeItem('api-dashboard-settings');
    
    // Clear sessionStorage
    sessionStorage.clear();
    
    // Reset store
    useSettingsStore.getState().logout();
  },

  // Get security recommendations
  getSecurityRecommendations: () => {
    const recommendations: string[] = [];
    
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      recommendations.push('Use HTTPS for secure communication');
    }
    
    if (useSettingsStore.getState().authToken) {
      recommendations.push('Token will be cleared when browser closes (session-based)');
    }
    
    return recommendations;
  },
};
