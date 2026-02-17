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
