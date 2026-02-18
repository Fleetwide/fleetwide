import { NotFoundError, ValidationError } from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import type { SessionRepository } from '../../ports/repositories/SessionRepository';

export class FinalizeSession {
  constructor(
    private sessionRepo: SessionRepository,
    private orchestrator: SessionOrchestrator,
  ) {}

  async execute(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (session.status !== 'running') {
      throw new ValidationError(
        `Session must be in running state to finalize (current: ${session.status})`,
      );
    }

    return this.orchestrator.finalizeSession(sessionId);
  }
}
