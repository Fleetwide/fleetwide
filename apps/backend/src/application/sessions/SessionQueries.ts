import { NotFoundError } from '@fleetwide/core';
import type { ContainerService } from '@fleetwide/workspace-manager';
import { SessionRepository } from '../../ports/repositories/SessionRepository';

export class SessionQueries {
  constructor(
    private sessionRepo: SessionRepository,
    private containerService: ContainerService,
  ) {}

  async list(filter?: { workspaceId?: string; status?: string }) {
    return this.sessionRepo.findAll(filter);
  }

  async getById(id: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    let containerAlive = false;
    if (session.containerId) {
      const status = await this.containerService
        .getStatus(session.containerId)
        .catch(() => 'not_found' as const);
      containerAlive = status === 'running';
    }

    return { ...session, containerAlive };
  }

  async getMessages(id: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    return session.messages ?? [];
  }

  async getLogs(id: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    return session.setupLogs ?? [];
  }

  async getDiff(id: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    return session.diffSummary ?? null;
  }

  async getBranch(id: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (!session.branchName) {
      return {
        branchName: null,
        branchPushed: false,
        checkoutCommand: null,
      };
    }

    return {
      branchName: session.branchName,
      branchPushed: session.branchPushed,
      checkoutCommand: session.branchPushed
        ? `git fetch && git checkout ${session.branchName}`
        : null,
      prUrl: session.prUrl,
      prNumber: session.prNumber,
    };
  }
}
