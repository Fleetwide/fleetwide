import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  numeric,
} from 'drizzle-orm/pg-core';
import { repositories } from './repositories.js';

import type { SessionMessage, SetupLogEntry, DiffSummary } from '@fleetwide/core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const workspaceStatusEnum = pgEnum('workspace_status', ['active', 'error', 'archived']);

export const sessionStatusEnum = pgEnum('session_status', [
  'starting',
  'setup',
  'running',
  'finalizing',
  'preview',
  'approved',
  'rejected',
  'completed',
  'failed',
  'expired',
]);

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  // Container definition
  image: text('image').notNull(),
  setupCommands: jsonb('setup_commands').$type<string[]>().default([]),
  environmentVariables: jsonb('environment_variables').$type<Record<string, string>>().default({}),
  // Resource limits
  memorySizeMb: integer('memory_size_mb').notNull().default(512),
  cpuCount: integer('cpu_count').notNull().default(1),
  // State
  status: workspaceStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type WorkspaceInsert = typeof workspaces.$inferInsert;

// ---------------------------------------------------------------------------
// Workspace ↔ Repository (many-to-many)
// ---------------------------------------------------------------------------

export const workspaceRepos = pgTable('workspace_repos', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .references(() => workspaces.id)
    .notNull(),
  repositoryId: text('repository_id')
    .references(() => repositories.id)
    .notNull(),
  mountPath: text('mount_path'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type WorkspaceRepoRow = typeof workspaceRepos.$inferSelect;
export type WorkspaceRepoInsert = typeof workspaceRepos.$inferInsert;

// ---------------------------------------------------------------------------
// Sessions (agent sessions in workspace containers)
// ---------------------------------------------------------------------------

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .references(() => workspaces.id)
    .notNull(),
  // Container tracking
  containerId: text('container_id'),
  containerName: text('container_name'),
  status: sessionStatusEnum('status').notNull().default('starting'),
  // Agent details
  prompt: text('prompt').notNull(),
  providerId: text('provider_id').notNull().default('claude'),
  model: text('model'),
  systemPrompt: text('system_prompt'),
  messages: jsonb('messages').$type<SessionMessage[]>().default([]),
  // Branch-push-preview workflow
  branchName: text('branch_name'),
  branchPushed: boolean('branch_pushed').default(false),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),
  diffSummary: jsonb('diff_summary').$type<DiffSummary>(),
  // Persisted session data
  setupLogs: jsonb('setup_logs').$type<SetupLogEntry[]>().default([]),
  // Cost tracking
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).default('0'),
  tokenCount: integer('token_count').default(0),
  // Container lifecycle
  idleTimeoutMinutes: integer('idle_timeout_minutes').notNull().default(30),
  lastActivityAt: timestamp('last_activity_at'),
  containerDestroyedAt: timestamp('container_destroyed_at'),
  // Timestamps
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
