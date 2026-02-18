import { create } from 'zustand';
import * as api from '../services/api-client.js';

interface ReposState {
  repos: api.Repository[];
  isLoading: boolean;
  error: string | null;

  fetchRepos: () => Promise<void>;
  deleteRepo: (id: string) => Promise<void>;
  syncRepo: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useReposStore = create<ReposState>((set, get) => ({
  repos: [],
  isLoading: false,
  error: null,

  fetchRepos: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.getRepos();
      set({ repos: result.data, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to fetch repos' });
    }
  },

  deleteRepo: async (id: string) => {
    try {
      await api.deleteRepo(id);
      set({ repos: get().repos.filter((r) => r.id !== id) });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete repo' });
    }
  },

  syncRepo: async (id: string) => {
    try {
      set({ repos: get().repos.map((r) => (r.id === id ? { ...r, status: 'syncing' } : r)) });
      await api.syncRepo(id);
      set({ repos: get().repos.map((r) => (r.id === id ? { ...r, status: 'synced' } : r)) });
    } catch (e) {
      set({
        repos: get().repos.map((r) => (r.id === id ? { ...r, status: 'error' } : r)),
        error: e instanceof Error ? e.message : 'Failed to sync repo',
      });
    }
  },

  clearError: () => set({ error: null }),
}));
