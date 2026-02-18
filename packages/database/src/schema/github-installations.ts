import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * GitHub App installations.
 *
 * Each row represents a GitHub App installation on an org or user account.
 * Created when a user installs the Fleetwide GitHub App on their org
 * and the installation callback is processed.
 */
export const githubInstallations = pgTable('github_installations', {
  id: text('id').primaryKey(),
  installationId: integer('installation_id').notNull().unique(),
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type').notNull(),
  accountAvatarUrl: text('account_avatar_url'),
  permissions: jsonb('permissions').$type<Record<string, string>>(),
  repositorySelection: text('repository_selection').notNull(),
  suspendedAt: timestamp('suspended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type GitHubInstallationRow = typeof githubInstallations.$inferSelect;
export type GitHubInstallationInsert = typeof githubInstallations.$inferInsert;
