import { NotFoundError } from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import type { SessionRepository } from '../../ports/repositories/SessionRepository';

export class DestroySession {
  constructor(
    private sessionRepo: SessionRepository,
    private orchestrator: SessionOrchestrator,
  ) {}

  async execute(id: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    await this.orchestrator.destroyContainer(id, 'user');
  }
}
