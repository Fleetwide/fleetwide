import { NotFoundError, ValidationError } from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import type { SessionRepository } from '../../ports/repositories/SessionRepository';
import type { GitHubPullRequestService } from '../../ports/services/GitHubPullRequestService';

export class ApproveSession {
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

    if (!session.branchPushed) {
      throw new ValidationError('No branch has been pushed for this session');
    }

    const validStatuses = ['preview', 'expired'];
    if (!validStatuses.includes(session.status)) {
      throw new ValidationError(
        `Session must be in preview or expired status to approve (current: ${session.status})`,
      );
    }

    const results = await this.orchestrator.approveSession(
      id,
      async ({ repoFullName, branchName, baseBranch, title, body }) => {
        return this.prService.createPullRequest({
          repoFullName,
          branchName,
          baseBranch,
          title,
          body,
        });
      },
    );

    return { approved: true, pullRequests: results };
  }
}
