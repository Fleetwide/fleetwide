import { create } from 'zustand';
import * as api from '../services/api-client.js';

interface GitHubState {
  configured: boolean;
  appSlug: string | null;
  htmlUrl: string | null;
  installations: api.Installation[];
  discoveredRepos: api.DiscoveredRepo[];
  isLoading: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  startConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  fetchInstallations: () => Promise<void>;
  startInstall: () => Promise<void>;
  discoverRepos: () => Promise<void>;
  removeInstallation: (id: string) => Promise<void>;
  importRepos: (installationId: number, repos: api.DiscoveredRepo[]) => Promise<api.ImportResult[]>;
  clearError: () => void;
}

export const useGitHubStore = create<GitHubState>((set, get) => ({
  configured: false,
  appSlug: null,
  htmlUrl: null,
  installations: [],
  discoveredRepos: [],
  isLoading: false,
  error: null,

  fetchStatus: async () => {
    try {
      const status = await api.getGitHubStatus();
      set({
        configured: status.configured,
        appSlug: status.appSlug,
        htmlUrl: status.htmlUrl,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch GitHub status' });
    }
  },

  startConnect: async () => {
    set({ isLoading: true, error: null });
    try {
      const { actionUrl, manifest } = await api.getManifestStartData();
      // GitHub requires the manifest to be submitted via POST form
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = actionUrl;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'manifest';
      input.value = manifest;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to start connection' });
    }
  },

  disconnect: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.disconnectGitHub();
      set({ configured: false, appSlug: null, htmlUrl: null, installations: [], isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to disconnect' });
    }
  },

  fetchInstallations: async () => {
    try {
      const { installations } = await api.getInstallations();
      set({ installations });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch installations' });
    }
  },

  startInstall: async () => {
    set({ isLoading: true, error: null });
    try {
      const { url } = await api.getInstallUrl();
      window.location.href = url;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to get install URL' });
    }
  },

  discoverRepos: async () => {
    set({ isLoading: true, error: null });
    try {
      const { repos } = await api.discoverRepos();
      set({ discoveredRepos: repos, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to discover repos' });
    }
  },

  removeInstallation: async (id: string) => {
    try {
      await api.removeInstallation(id);
      set({ installations: get().installations.filter((i) => i.id !== id) });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to remove installation' });
    }
  },

  importRepos: async (installationId: number, repos: api.DiscoveredRepo[]) => {
    set({ isLoading: true, error: null });
    try {
      const { results } = await api.importRepos(installationId, repos);
      set({ isLoading: false });
      return results;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to import repos' });
      return [];
    }
  },

  clearError: () => set({ error: null }),
}));
