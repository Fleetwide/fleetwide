/**
 * Integration types for external system connectors.
 *
 * Integrations are in-process plugins that connect Fleetwide to external
 * systems like GitHub, Slack, CI/CD pipelines, and observability platforms.
 */

import type { ID, HealthStatus, Timestamps } from './common.js';

// ---------------------------------------------------------------------------
// Integration types
// ---------------------------------------------------------------------------

export type IntegrationType = 'github' | 'slack' | 'cicd' | 'observability' | 'custom';

export type IntegrationStatus = 'active' | 'inactive' | 'error' | 'configuring';

// ---------------------------------------------------------------------------
// Integration (persisted)
// ---------------------------------------------------------------------------

export interface Integration extends Timestamps {
  id: ID;
  type: IntegrationType;
  name: string;
  /** Plugin-specific configuration (encrypted at rest) */
  config: Record<string, unknown>;
  status: IntegrationStatus;
  /** Last health check result */
  lastHealthCheck?: HealthStatus;
  lastHealthCheckAt?: Date;
}

// ---------------------------------------------------------------------------
// Plugin interface types
// ---------------------------------------------------------------------------

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: IntegrationType;
  description: string;
  configFields: PluginConfigField[];
}

export interface PluginConfigField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'url' | 'boolean' | 'select';
  required: boolean;
  description?: string;
  options?: { label: string; value: string }[];
  default?: unknown;
}

// ---------------------------------------------------------------------------
// Webhook types
// ---------------------------------------------------------------------------

export interface WebhookRequest {
  headers: Record<string, string>;
  body: unknown;
  method: string;
  path: string;
  query: Record<string, string>;
}

export interface WebhookResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface WebhookLogEntry {
  id: ID;
  integrationId: ID;
  receivedAt: Date;
  method: string;
  path: string;
  status: number;
  processingTime: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export interface NotificationTarget {
  integrationType: IntegrationType;
  channel?: string;
  userId?: string;
}

export interface NotificationMessage {
  title: string;
  body: string;
  level: 'info' | 'warning' | 'error' | 'success';
  metadata?: Record<string, unknown>;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  url?: string;
  callbackId?: string;
}

// ---------------------------------------------------------------------------
// Platform events (sent to plugins)
// ---------------------------------------------------------------------------

export type PlatformEventType =
  | 'agent.started'
  | 'agent.completed'
  | 'agent.failed'
  | 'repo.synced'
  | 'repo.error'
  | 'schedule.triggered'
  | 'schedule.completed'
  | 'fleet.proposal_created'
  | 'fleet.proposal_approved'
  | 'fleet.proposal_rejected'
  | 'session.starting'
  | 'session.setup'
  | 'session.running'
  | 'session.finalizing'
  | 'session.preview_ready'
  | 'session.approved'
  | 'session.rejected'
  | 'session.completed'
  | 'session.failed'
  | 'session.expired'
  | 'session.message';

export interface PlatformEvent {
  type: PlatformEventType;
  timestamp: number;
  data: Record<string, unknown>;
}
