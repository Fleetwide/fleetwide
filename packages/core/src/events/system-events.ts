/**
 * System event definitions.
 *
 * These events represent platform-level occurrences that integrations
 * and other services can subscribe to.
 */

import type { PlatformEvent, PlatformEventType } from '../types/integration.js';

// ---------------------------------------------------------------------------
// Event factory functions
// ---------------------------------------------------------------------------

export function createPlatformEvent(
  type: PlatformEventType,
  data: Record<string, unknown>,
): PlatformEvent {
  return {
    type,
    timestamp: Date.now(),
    data,
  };
}

// ---------------------------------------------------------------------------
// Typed event constructors
// ---------------------------------------------------------------------------

export function agentStartedEvent(sessionId: string, repositoryId?: string): PlatformEvent {
  return createPlatformEvent('agent.started', { sessionId, repositoryId });
}

export function agentCompletedEvent(
  sessionId: string,
  repositoryId?: string,
  costUsd?: number,
): PlatformEvent {
  return createPlatformEvent('agent.completed', { sessionId, repositoryId, costUsd });
}

export function agentFailedEvent(
  sessionId: string,
  error: string,
  repositoryId?: string,
): PlatformEvent {
  return createPlatformEvent('agent.failed', { sessionId, error, repositoryId });
}

export function repoSyncedEvent(repositoryId: string, updatedFiles?: number): PlatformEvent {
  return createPlatformEvent('repo.synced', { repositoryId, updatedFiles });
}

export function repoErrorEvent(repositoryId: string, error: string): PlatformEvent {
  return createPlatformEvent('repo.error', { repositoryId, error });
}

export function scheduleTriggeredEvent(scheduleId: string, runId: string): PlatformEvent {
  return createPlatformEvent('schedule.triggered', { scheduleId, runId });
}

export function scheduleCompletedEvent(
  scheduleId: string,
  runId: string,
  repoCount: number,
): PlatformEvent {
  return createPlatformEvent('schedule.completed', { scheduleId, runId, repoCount });
}

export function fleetProposalCreatedEvent(proposalId: string, repoCount: number): PlatformEvent {
  return createPlatformEvent('fleet.proposal_created', { proposalId, repoCount });
}

export function fleetProposalApprovedEvent(proposalId: string): PlatformEvent {
  return createPlatformEvent('fleet.proposal_approved', { proposalId });
}

export function fleetProposalRejectedEvent(proposalId: string, reason?: string): PlatformEvent {
  return createPlatformEvent('fleet.proposal_rejected', { proposalId, reason });
}

// ---------------------------------------------------------------------------
// Session lifecycle event constructors
// ---------------------------------------------------------------------------

export function sessionStartingEvent(sessionId: string, workspaceId: string): PlatformEvent {
  return createPlatformEvent('session.starting', { sessionId, workspaceId });
}

export function sessionSetupEvent(sessionId: string, workspaceId: string): PlatformEvent {
  return createPlatformEvent('session.setup', { sessionId, workspaceId });
}

export function sessionRunningEvent(sessionId: string, workspaceId: string): PlatformEvent {
  return createPlatformEvent('session.running', { sessionId, workspaceId });
}

export function sessionFinalizingEvent(sessionId: string): PlatformEvent {
  return createPlatformEvent('session.finalizing', { sessionId });
}

export function sessionPreviewReadyEvent(
  sessionId: string,
  branchName: string,
): PlatformEvent {
  return createPlatformEvent('session.preview_ready', { sessionId, branchName });
}

export function sessionApprovedEvent(
  sessionId: string,
  prUrl?: string,
  prNumber?: number,
): PlatformEvent {
  return createPlatformEvent('session.approved', { sessionId, prUrl, prNumber });
}

export function sessionRejectedEvent(sessionId: string): PlatformEvent {
  return createPlatformEvent('session.rejected', { sessionId });
}

export function sessionCompletedEvent(sessionId: string): PlatformEvent {
  return createPlatformEvent('session.completed', { sessionId });
}

export function sessionFailedEvent(sessionId: string, error: string): PlatformEvent {
  return createPlatformEvent('session.failed', { sessionId, error });
}

export function sessionExpiredEvent(sessionId: string): PlatformEvent {
  return createPlatformEvent('session.expired', { sessionId });
}

export function sessionMessageEvent(
  sessionId: string,
  role: 'user' | 'assistant',
): PlatformEvent {
  return createPlatformEvent('session.message', { sessionId, role });
}

// ---------------------------------------------------------------------------
// Event type guard
// ---------------------------------------------------------------------------

export function isPlatformEvent(event: unknown): event is PlatformEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    'timestamp' in event &&
    'data' in event
  );
}
