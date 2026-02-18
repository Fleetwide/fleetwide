const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    const message = body?.error?.message ?? `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

// GitHub App Status & Manifest Flow
export async function getGitHubStatus() {
  return request<{
    configured: boolean;
    appSlug: string | null;
    htmlUrl: string | null;
    installationsCount: number;
  }>('/github/status');
}

export async function getManifestStartUrl() {
  return request<{ url: string }>('/github/manifest/start');
}

export async function disconnectGitHub() {
  return request<{ success: boolean }>('/github/config', { method: 'DELETE' });
}

// Installations
export interface Installation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl: string | null;
  repositorySelection: string;
  createdAt: string;
}

export async function getInstallations() {
  return request<{ installations: Installation[] }>('/github/installations');
}

export async function getInstallUrl() {
  return request<{ url: string }>('/github/install-url');
}

export async function removeInstallation(id: string) {
  return request<{ success: boolean }>(`/github/installations/${id}`, { method: 'DELETE' });
}

// Repo Discovery
export interface DiscoveredRepo {
  githubId: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  language: string | null;
  description: string | null;
  updatedAt: string;
  alreadyImported: boolean;
}

export async function discoverRepos() {
  return request<{ repos: DiscoveredRepo[] }>('/github/repos');
}

// Import
export interface ImportResult {
  githubId: number;
  fullName: string;
  status: 'success' | 'error';
  repositoryId?: string;
  error?: string;
}

export async function importRepos(installationId: number, repos: DiscoveredRepo[]) {
  return request<{ results: ImportResult[] }>('/github/repos/import', {
    method: 'POST',
    body: JSON.stringify({ installationId, repos }),
  });
}

// Repositories
export interface Repository {
  id: string;
  name: string;
  path: string;
  remoteUrl: string | null;
  defaultBranch: string;
  source: string;
  status: string;
  metadata: Record<string, unknown> | null;
  githubId: number | null;
  githubFullName: string | null;
  githubPrivate: boolean | null;
  githubHtmlUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getRepos() {
  return request<{
    data: Repository[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>('/repos');
}

export async function deleteRepo(id: string) {
  return request<{ success: boolean }>(`/repos/${id}`, { method: 'DELETE' });
}

export async function syncRepo(id: string) {
  return request<{ data: { repositoryId: string; status: string; updated: boolean } }>(
    `/repos/${id}/sync`,
    { method: 'POST' },
  );
}
