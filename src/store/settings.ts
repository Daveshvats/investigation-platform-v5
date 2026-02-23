import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SettingsState, AppState, ViewType } from '@/types/api';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: 'http://localhost:8080',
      bearerToken: '',
      allowSelfSigned: false,
      theme: 'system',
      setBaseUrl: (url) => set({ baseUrl: url }),
      setBearerToken: (token) => set({ bearerToken: token }),
      setAllowSelfSigned: (allow) => set({ allowSelfSigned: allow }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'api-dashboard-settings',
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
