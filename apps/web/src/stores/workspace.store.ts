import { create } from 'zustand';
import * as api from '../services/api-client.js';

interface WorkspaceState {
  workspaces: api.WorkspaceWithRepos[];
  current: api.WorkspaceWithRepos | null;
  isLoading: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<void>;
  fetchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (data: api.CreateWorkspaceRequest) => Promise<api.Workspace>;
  updateWorkspace: (id: string, data: api.UpdateWorkspaceRequest) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  addRepo: (workspaceId: string, repositoryId: string) => Promise<void>;
  removeRepo: (workspaceId: string, repoId: string) => Promise<void>;
  clearError: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  current: null,
  isLoading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.getWorkspaces();
      set({ workspaces: result.data, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to fetch workspaces' });
    }
  },

  fetchWorkspace: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.getWorkspace(id);
      set({ current: result.data, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to fetch workspace' });
    }
  },

  createWorkspace: async (data: api.CreateWorkspaceRequest) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.createWorkspace(data);
      set({ isLoading: false });
      return result.data;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to create workspace' });
      throw e;
    }
  },

  updateWorkspace: async (id: string, data: api.UpdateWorkspaceRequest) => {
    try {
      const result = await api.updateWorkspace(id, data);
      set({
        current: result.data,
        workspaces: get().workspaces.map((w) => (w.id === id ? result.data : w)),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to update workspace' });
    }
  },

  deleteWorkspace: async (id: string) => {
    try {
      await api.deleteWorkspace(id);
      set({ workspaces: get().workspaces.filter((w) => w.id !== id) });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete workspace' });
    }
  },

  addRepo: async (workspaceId: string, repositoryId: string) => {
    try {
      await api.addRepoToWorkspace(workspaceId, repositoryId);
      await get().fetchWorkspace(workspaceId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to add repository' });
    }
  },

  removeRepo: async (workspaceId: string, repoId: string) => {
    try {
      await api.removeRepoFromWorkspace(workspaceId, repoId);
      if (get().current?.id === workspaceId) {
        set({
          current: {
            ...get().current!,
            repositories: get().current!.repositories.filter((r) => r.id !== repoId),
          },
        });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to remove repository' });
    }
  },

  clearError: () => set({ error: null }),
}));
