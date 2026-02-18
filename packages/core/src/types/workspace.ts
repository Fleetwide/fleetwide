/**
 * Workspace types for Docker-based agent execution environments.
 *
 * A workspace is a persistent definition (Docker image + repos + setup commands + env vars).
 * Each agent session spins up a fresh container from that definition.
 */

import type { SessionMessage } from './agent.js';

// ---------------------------------------------------------------------------
// Workspace (persistent definition)
// ---------------------------------------------------------------------------

export type WorkspaceStatus = 'active' | 'error' | 'archived';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  // Container definition
  image: string;
  setupCommands: string[];
  environmentVariables: Record<string, string>;
  // Resource limits
  memorySizeMb: number;
  cpuCount: number;
  // Repos
  repositoryIds: string[];
  // Metadata
  status: WorkspaceStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Workspace session (ephemeral container, persistent data)
// ---------------------------------------------------------------------------

export type WorkspaceSessionStatus =
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

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: Array<{
    path: string;
    repoName: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    insertions: number;
    deletions: number;
  }>;
}

export interface WorkspaceSession {
  id: string;
  workspaceId: string;
  containerId?: string;
  containerName: string;
  status: WorkspaceSessionStatus;
  // Agent details
  prompt: string;
  providerId: string;
  model?: string;
  systemPrompt?: string;
  // Branch-push-preview workflow
  branchName?: string;
  branchPushed: boolean;
  prUrl?: string;
  prNumber?: number;
  diffSummary?: DiffSummary;
  // Persisted session data (survives container destruction)
  messages: SessionMessage[];
  setupLogs: SetupLogEntry[];
  // Container lifecycle
  containerAlive: boolean;
  idleTimeoutMinutes: number;
  lastActivityAt?: Date;
  containerDestroyedAt?: Date;
  // Cost tracking
  costUsd: number;
  tokenCount: number;
  startedAt: Date;
  completedAt?: Date;
}

// ---------------------------------------------------------------------------
// Container execution
// ---------------------------------------------------------------------------

export interface ContainerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}
