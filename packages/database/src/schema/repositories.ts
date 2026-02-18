import { pgTable, text, integer, boolean, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { githubInstallations } from './github-installations.js';

export const repoStatusEnum = pgEnum('repo_status', [
  'synced',
  'syncing',
  'error',
  'uninitialized',
]);

export const repoSourceEnum = pgEnum('repo_source', ['github', 'manual_url', 'local_path']);

/**
 * Repositories tracked by Fleetwide.
 *
 * Repos can be imported from GitHub (via the GitHub App) or added manually
 * by path or remote URL. GitHub-specific fields are populated when
 * source === 'github'.
 */
export const repositories = pgTable('repositories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  remoteUrl: text('remote_url'),
  defaultBranch: text('default_branch').notNull().default('main'),
  source: repoSourceEnum('source').notNull().default('manual_url'),
  status: repoStatusEnum('status').notNull().default('uninitialized'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  // GitHub-specific fields (populated when source === 'github')
  githubId: integer('github_id'),
  githubFullName: text('github_full_name'),
  githubInstallationId: text('github_installation_id').references(
    () => githubInstallations.id,
  ),
  githubPrivate: boolean('github_private'),
  githubHtmlUrl: text('github_html_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type RepositoryRow = typeof repositories.$inferSelect;
export type RepositoryInsert = typeof repositories.$inferInsert;
