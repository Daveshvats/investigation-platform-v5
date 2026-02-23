import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  table?: string;
  createdAt: string;
  lastUsed?: string;
}

interface SavedSearchesState {
  searches: SavedSearch[];
  addSearch: (search: Omit<SavedSearch, 'id' | 'createdAt'>) => void;
  removeSearch: (id: string) => void;
  updateLastUsed: (id: string) => void;
  clearAll: () => void;
}

export const useSavedSearchesStore = create<SavedSearchesState>()(
  persist(
    (set) => ({
      searches: [],
      addSearch: (search) =>
        set((state) => ({
          searches: [
            {
              ...search,
              id: `search_${Date.now()}`,
              createdAt: new Date().toISOString(),
            },
            ...state.searches,
          ].slice(0, 20), // Keep only last 20 searches
        })),
      removeSearch: (id) =>
        set((state) => ({
          searches: state.searches.filter((s) => s.id !== id),
        })),
      updateLastUsed: (id) =>
        set((state) => ({
          searches: state.searches.map((s) =>
            s.id === id ? { ...s, lastUsed: new Date().toISOString() } : s
          ),
        })),
      clearAll: () => set({ searches: [] }),
    }),
    {
      name: 'api-dashboard-saved-searches',
    }
  )
);

// Export history store
export interface ExportHistoryItem {
  id: string;
  type: 'json' | 'csv' | 'pdf';
  tableName: string;
  recordCount: number;
  timestamp: string;
}

interface ExportHistoryState {
  history: ExportHistoryItem[];
  addExport: (item: Omit<ExportHistoryItem, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
}

export const useExportHistoryStore = create<ExportHistoryState>()(
  persist(
    (set) => ({
      history: [],
      addExport: (item) =>
        set((state) => ({
          history: [
            {
              ...item,
              id: `export_${Date.now()}`,
              timestamp: new Date().toISOString(),
            },
            ...state.history,
          ].slice(0, 50), // Keep last 50 exports
        })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'api-dashboard-export-history',
    }
  )
);
