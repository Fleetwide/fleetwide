import { NotFoundError, ValidationError } from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import type { SessionRepository } from '../../ports/repositories/SessionRepository';

export class ExecInSession {
  constructor(
    private sessionRepo: SessionRepository,
    private orchestrator: SessionOrchestrator,
  ) {}

  async execute(id: string, cmd: string[]) {
    if (!cmd || !Array.isArray(cmd) || cmd.length === 0) {
      throw new ValidationError('cmd must be a non-empty array of strings');
    }

    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (!session.containerId) {
      throw new ValidationError('Session container is no longer available');
    }

    return this.orchestrator.exec(id, cmd);
  }
}
