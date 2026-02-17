/**
 * Repository types for fleet management.
 *
 * Repositories are git repos cloned to local disk. The platform tracks
 * their sync status, metadata, and provides git operations.
 */

import type { ID, Timestamps } from './common.js';

// ---------------------------------------------------------------------------
// Repository status
// ---------------------------------------------------------------------------

export type RepoStatus = 'synced' | 'syncing' | 'error' | 'uninitialized';

// ---------------------------------------------------------------------------
// Repository metadata (auto-detected)
// ---------------------------------------------------------------------------

export interface RepoMetadata {
  /** Language breakdown: language name → percentage (0-100) */
  languages: Record<string, number>;
  /** Total file count (tracked by git) */
  fileCount: number;
  /** Latest commit SHA */
  lastCommitHash: string;
  /** Latest commit date */
  lastCommitDate: Date;
  /** Repo size in bytes (approximate) */
  sizeBytes?: number;
}

// ---------------------------------------------------------------------------
// Repository (persisted)
// ---------------------------------------------------------------------------

export interface Repository extends Timestamps {
  id: ID;
  name: string;
  /** Local disk path where the repo is cloned */
  path: string;
  /** Git remote URL (if cloned from remote) */
  remoteUrl?: string;
  /** Default branch name */
  defaultBranch: string;
  status: RepoStatus;
  metadata?: RepoMetadata;
}

// ---------------------------------------------------------------------------
// Repository operations
// ---------------------------------------------------------------------------

export interface RepoFilter {
  status?: RepoStatus;
  search?: string;
}

export interface SyncResult {
  repositoryId: ID;
  status: 'success' | 'error';
  message?: string;
  updatedFiles?: number;
  duration: number;
}

export interface RepoSyncStatus {
  repositoryId: ID;
  lastSyncAt?: Date;
  nextSyncAt?: Date;
  isOutdated: boolean;
  behindCommits?: number;
}

// ---------------------------------------------------------------------------
// File browsing
// ---------------------------------------------------------------------------

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: Date;
}

// ---------------------------------------------------------------------------
// Git operations
// ---------------------------------------------------------------------------

export interface GitStatus {
  branch: string;
  isClean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface GitLogEntry {
  hash: string;
  hashShort: string;
  author: string;
  date: Date;
  message: string;
}

export interface GitDiff {
  files: GitDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface GitDiffFile {
  path: string;
  additions: number;
  deletions: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  content?: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  lastCommitHash?: string;
}
