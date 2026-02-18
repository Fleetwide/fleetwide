import { NotFoundError, ValidationError } from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import type { SessionRepository } from '../../ports/repositories/SessionRepository';
import type { GitHubPullRequestService } from '../../ports/services/GitHubPullRequestService';

export class RejectSession {
  constructor(
    private sessionRepo: SessionRepository,
    private prService: GitHubPullRequestService,
    private orchestrator: SessionOrchestrator,
  ) {}

  async execute(id: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const validStatuses = ['preview', 'expired'];
    if (!validStatuses.includes(session.status)) {
      throw new ValidationError(
        `Session must be in preview or expired status to reject (current: ${session.status})`,
      );
    }

    await this.orchestrator.rejectSession(
      id,
      async (repoFullName, branchName) => {
        await this.prService.deleteBranch(repoFullName, branchName);
      },
    );

    return { rejected: true };
  }
}
