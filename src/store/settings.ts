import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SettingsState, AppState, ViewType, UserInfo } from '@/types/api';

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
      setBearerToken: (token) => set({ bearerToken: token, authToken: token }), // Sync for backward compatibility
      setAllowSelfSigned: (allow) => set({ allowSelfSigned: allow }),
      setTheme: (theme) => set({ theme }),
      setUser: (user: UserInfo | null) => set({ user }),
      logout: () => set({ 
        user: null, 
        authToken: '', 
        bearerToken: '',
        authType: 'api-key'
      }),
    }),
    {
      name: 'api-dashboard-settings',
      storage: createJSONStorage(() => localStorage),
      version: 2, // Bump version to clear old cached data
      migrate: (persistedState, version) => {
        // Clear old data if version is older
        if (version < 2) {
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
