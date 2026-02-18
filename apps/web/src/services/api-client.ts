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

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export type WorkspaceStatus = 'active' | 'error' | 'archived';

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  image: string;
  setupCommands: string[];
  environmentVariables: Record<string, string>;
  memorySizeMb: number;
  cpuCount: number;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceWithRepos extends Workspace {
  repositories: Repository[];
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
  image: string;
  repositoryIds: string[];
  setupCommands?: string[];
  environmentVariables?: Record<string, string>;
  memorySizeMb?: number;
  cpuCount?: number;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  image?: string;
  setupCommands?: string[];
  environmentVariables?: Record<string, string>;
  memorySizeMb?: number;
  cpuCount?: number;
}

export async function getWorkspaces() {
  return request<{ data: WorkspaceWithRepos[] }>('/workspaces');
}

export async function getWorkspace(id: string) {
  return request<{ data: WorkspaceWithRepos }>(`/workspaces/${id}`);
}

export async function createWorkspace(data: CreateWorkspaceRequest) {
  return request<{ data: Workspace }>('/workspaces', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWorkspace(id: string, data: UpdateWorkspaceRequest) {
  return request<{ data: WorkspaceWithRepos }>(`/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkspace(id: string) {
  return request<{ success: boolean }>(`/workspaces/${id}`, { method: 'DELETE' });
}

export async function addRepoToWorkspace(workspaceId: string, repositoryId: string) {
  return request<{ success: boolean }>(`/workspaces/${workspaceId}/repos`, {
    method: 'POST',
    body: JSON.stringify({ repositoryId }),
  });
}

export async function removeRepoFromWorkspace(workspaceId: string, repoId: string) {
  return request<{ success: boolean }>(`/workspaces/${workspaceId}/repos/${repoId}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type SessionStatus =
  | 'starting'
  | 'setup'
  | 'running'
  | 'finalizing'
  | 'preview'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed'
  | 'expired';

export interface SetupLogEntry {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface DiffFile {
  path: string;
  repoName: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  insertions: number;
  deletions: number;
}

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: DiffFile[];
}

export interface AgentEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'status_change' | 'cost_update';
  timestamp: number;
  data: unknown;
}

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  events?: AgentEvent[];
}

export interface Session {
  id: string;
  workspaceId: string;
  containerId: string | null;
  containerName: string | null;
  status: SessionStatus;
  prompt: string;
  providerId: string;
  model: string | null;
  systemPrompt: string | null;
  branchName: string | null;
  branchPushed: boolean | null;
  prUrl: string | null;
  prNumber: number | null;
  diffSummary: DiffSummary | null;
  messages: SessionMessage[];
  setupLogs: SetupLogEntry[];
  containerAlive?: boolean;
  idleTimeoutMinutes: number;
  lastActivityAt: string | null;
  containerDestroyedAt: string | null;
  costUsd: string;
  tokenCount: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface StartSessionRequest {
  workspaceId: string;
  prompt: string;
  providerId?: string;
  model?: string;
  systemPrompt?: string;
}

export interface ContainerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface BranchInfo {
  branchName: string | null;
  branchPushed: boolean;
  checkoutCommand: string | null;
  prUrl?: string;
  prNumber?: number;
}

export async function getSessions(filter?: { workspaceId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filter?.workspaceId) params.set('workspaceId', filter.workspaceId);
  if (filter?.status) params.set('status', filter.status);
  const qs = params.toString();
  return request<{ data: Session[] }>(`/sessions${qs ? `?${qs}` : ''}`);
}

export async function getSession(id: string) {
  return request<{ data: Session }>(`/sessions/${id}`);
}

export async function startSession(data: StartSessionRequest) {
  return request<{ data: Session }>('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function runAgent(sessionId: string) {
  return request<{ data: { started: boolean; sessionId: string } }>(`/sessions/${sessionId}/run`, {
    method: 'POST',
  });
}

export async function abortAgent(sessionId: string) {
  return request<{ data: { aborted: boolean; sessionId: string } }>(
    `/sessions/${sessionId}/abort`,
    { method: 'POST' },
  );
}

export async function finalizeSession(sessionId: string) {
  return request<{ data: unknown }>(`/sessions/${sessionId}/finalize`, { method: 'POST' });
}

export async function approveSession(sessionId: string) {
  return request<{ data: { approved: boolean; pullRequests?: unknown[] } }>(
    `/sessions/${sessionId}/approve`,
    { method: 'POST' },
  );
}

export async function rejectSession(sessionId: string) {
  return request<{ data: { rejected: boolean } }>(`/sessions/${sessionId}/reject`, {
    method: 'POST',
  });
}

export async function execInSession(sessionId: string, cmd: string[]) {
  return request<{ data: ContainerExecResult }>(`/sessions/${sessionId}/exec`, {
    method: 'POST',
    body: JSON.stringify({ cmd }),
  });
}

export async function destroySession(sessionId: string) {
  return request<{ success: boolean }>(`/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function getSessionMessages(sessionId: string) {
  return request<{ data: SessionMessage[] }>(`/sessions/${sessionId}/messages`);
}

export async function getSessionLogs(sessionId: string) {
  return request<{ data: SetupLogEntry[] }>(`/sessions/${sessionId}/logs`);
}

export async function getSessionDiff(sessionId: string) {
  return request<{ data: DiffSummary | null }>(`/sessions/${sessionId}/diff`);
}

export async function getSessionBranch(sessionId: string) {
  return request<{ data: BranchInfo }>(`/sessions/${sessionId}/branch`);
}
