/**
 * Zod validation schemas for all core types.
 *
 * These schemas are used for API request validation, config validation,
 * and runtime type checking across all packages.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Common schemas
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ---------------------------------------------------------------------------
// Agent schemas
// ---------------------------------------------------------------------------

export const agentStatusSchema = z.enum([
  'idle',
  'running',
  'paused',
  'completed',
  'failed',
  'aborted',
]);

export const agentPermissionsSchema = z.object({
  allowFileRead: z.boolean().default(true),
  allowFileWrite: z.boolean().default(false),
  allowBashExecution: z.boolean().default(false),
  allowNetworkAccess: z.boolean().default(false),
  restrictedPaths: z.array(z.string()).optional(),
});

export const agentConfigSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  workingDirectory: z.string().min(1),
  permissions: agentPermissionsSchema,
});

export const runAgentSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  repositoryId: z.string().optional(),
  providerId: z.string().default('claude'),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Repository schemas
// ---------------------------------------------------------------------------

export const repoStatusSchema = z.enum(['synced', 'syncing', 'error', 'uninitialized']);

export const registerRepoSchema = z
  .object({
    name: z.string().min(1, 'Repository name is required'),
    path: z.string().optional(),
    remoteUrl: z
      .string()
      .url('Must be a valid URL')
      .optional()
      .or(z.string().regex(/^git@/, 'Must be a valid git SSH URL').optional()),
    defaultBranch: z.string().default('main'),
  })
  .refine((data) => data.path || data.remoteUrl, {
    message: 'Either path or remoteUrl must be provided',
  });

export const updateRepoSchema = z.object({
  name: z.string().min(1).optional(),
  defaultBranch: z.string().optional(),
});

export const repoFilterSchema = z.object({
  status: repoStatusSchema.optional(),
  search: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Schedule schemas
// ---------------------------------------------------------------------------

/**
 * Basic cron expression validation.
 * Allows standard 5-field cron (minute hour day month weekday).
 */
export const cronExpressionSchema = z
  .string()
  .min(9, 'Invalid cron expression')
  .regex(/^[\d*,\-\/]+\s+[\d*,\-\/]+\s+[\d*,\-\/]+\s+[\d*,\-\/A-Z]+\s+[\d*,\-\/A-Z]+$/i, {
    message: 'Invalid cron expression format',
  });

export const timezoneSchema = z.string().min(1, 'Timezone is required');

export const createScheduleSchema = z.object({
  name: z.string().min(1, 'Schedule name is required'),
  description: z.string().optional(),
  cronExpression: cronExpressionSchema,
  timezone: timezoneSchema,
  repositoryIds: z.union([z.array(z.string()).min(1), z.literal('all')]),
  prompt: z.string().min(1, 'Prompt is required'),
  providerId: z.string().default('claude'),
  model: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const updateScheduleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  cronExpression: cronExpressionSchema.optional(),
  timezone: timezoneSchema.optional(),
  repositoryIds: z.union([z.array(z.string()).min(1), z.literal('all')]).optional(),
  prompt: z.string().min(1).optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
});

export const scheduleFilterSchema = z.object({
  enabled: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required'),
  permissions: z.array(z.string()).default([]),
  expiresAt: z.coerce.date().optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// ---------------------------------------------------------------------------
// Integration schemas
// ---------------------------------------------------------------------------

export const integrationTypeSchema = z.enum([
  'github',
  'slack',
  'cicd',
  'observability',
  'custom',
]);

export const configureIntegrationSchema = z.object({
  name: z.string().min(1, 'Integration name is required'),
  type: integrationTypeSchema,
  config: z.record(z.unknown()),
});

// ---------------------------------------------------------------------------
// Workspace schemas
// ---------------------------------------------------------------------------

export const workspaceStatusSchema = z.enum(['active', 'error', 'archived']);

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  image: z.string().min(1),
  repositoryIds: z.array(z.string()).min(1),
  setupCommands: z.array(z.string()).default([]),
  environmentVariables: z.record(z.string()).default({}),
  memorySizeMb: z.number().int().min(128).max(8192).default(512),
  cpuCount: z.number().int().min(1).max(8).default(1),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  image: z.string().min(1).optional(),
  setupCommands: z.array(z.string()).optional(),
  environmentVariables: z.record(z.string()).optional(),
  memorySizeMb: z.number().int().min(128).max(8192).optional(),
  cpuCount: z.number().int().min(1).max(8).optional(),
});

export const runAgentInWorkspaceSchema = z.object({
  workspaceId: z.string(),
  prompt: z.string().min(1),
  providerId: z.string().default('claude'),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
});

export const sessionStatusSchema = z.enum([
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
// WebSocket message schemas
// ---------------------------------------------------------------------------

export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), sessionId: z.string() }),
  z.object({ type: z.literal('send_message'), sessionId: z.string(), content: z.string() }),
  z.object({ type: z.literal('abort'), sessionId: z.string() }),
  z.object({ type: z.literal('ping') }),
]);

export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

// ---------------------------------------------------------------------------
// Utility: validate and return typed result
// ---------------------------------------------------------------------------

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: z.ZodIssue[] };

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}
