import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * GitHub App configuration (singleton — at most one row).
 *
 * Stores the credentials obtained from the GitHub App Manifest flow.
 * The private key and client secret are stored as-is for MVP;
 * encryption at rest is a future enhancement.
 */
export const githubAppConfig = pgTable('github_app_config', {
  id: text('id').primaryKey().default('default'),
  appId: text('app_id').notNull(),
  appSlug: text('app_slug').notNull(),
  privateKey: text('private_key').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret').notNull(),
  webhookSecret: text('webhook_secret'),
  htmlUrl: text('html_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type GitHubAppConfigRow = typeof githubAppConfig.$inferSelect;
export type GitHubAppConfigInsert = typeof githubAppConfig.$inferInsert;
