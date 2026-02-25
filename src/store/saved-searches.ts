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
  updateLastUsed: (query: string) => void;
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
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
            ...state.searches,
          ],
        })),
      removeSearch: (id) =>
        set((state) => ({
          searches: state.searches.filter((s) => s.id !== id),
        })),
      updateLastUsed: (query) =>
        set((state) => ({
          searches: state.searches.map((s) =>
            s.query === query
              ? { ...s, lastUsed: new Date().toISOString() }
              : s
          ),
        })),
      clearAll: () => set({ searches: [] }),
    }),
    {
      name: 'saved-searches',
    }
  )
);
