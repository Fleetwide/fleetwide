/**
 * Schedule types for time-based agent automation.
 *
 * Schedules define recurring agent tasks using cron expressions.
 * They run against selected repositories on a timer.
 */

import type { ID, Timestamps } from './common.js';

// ---------------------------------------------------------------------------
// Schedule status
// ---------------------------------------------------------------------------

export type ScheduleStatus = 'enabled' | 'disabled' | 'error';

// ---------------------------------------------------------------------------
// Schedule (persisted)
// ---------------------------------------------------------------------------

export interface Schedule extends Timestamps {
  id: ID;
  name: string;
  description?: string;
  /** Cron expression (e.g., '0 9 * * MON-FRI') */
  cronExpression: string;
  /** IANA timezone (e.g., 'Europe/Amsterdam') */
  timezone: string;
  /** Target repositories — specific IDs or 'all' */
  repositoryIds: ID[] | 'all';
  /** Prompt to send to the agent */
  prompt: string;
  /** Provider to use (default: 'claude') */
  providerId: string;
  /** Model to use */
  model?: string;
  /** Whether this schedule is active */
  enabled: boolean;
  /** Last execution time */
  lastRunAt?: Date;
  /** Next scheduled execution time */
  nextRunAt?: Date;
  /** Total number of runs */
  runCount: number;
}

// ---------------------------------------------------------------------------
// Schedule run (execution history)
// ---------------------------------------------------------------------------

export type ScheduleRunStatus = 'running' | 'completed' | 'failed';

export interface ScheduleRun {
  id: ID;
  scheduleId: ID;
  status: ScheduleRunStatus;
  startedAt: Date;
  completedAt?: Date;
  /** Per-repository results */
  results?: ScheduleRunRepoResult[];
  error?: string;
}

export interface ScheduleRunRepoResult {
  repositoryId: ID;
  repositoryName: string;
  status: 'success' | 'error';
  message?: string;
  duration: number;
}

// ---------------------------------------------------------------------------
// Schedule CRUD inputs
// ---------------------------------------------------------------------------

export interface CreateScheduleInput {
  name: string;
  description?: string;
  cronExpression: string;
  timezone: string;
  repositoryIds: ID[] | 'all';
  prompt: string;
  providerId?: string;
  model?: string;
  enabled?: boolean;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  cronExpression?: string;
  timezone?: string;
  repositoryIds?: ID[] | 'all';
  prompt?: string;
  providerId?: string;
  model?: string;
}

export interface ScheduleFilter {
  enabled?: boolean;
  search?: string;
}
