import { NotFoundError, ValidationError } from '@fleetwide/core';
import type { WorkspaceRepository } from '../../ports/repositories/WorkspaceRepository';

export class ManageWorkspaceRepos {
  constructor(private workspaceRepo: WorkspaceRepository) {}

  async addRepo(workspaceId: string, repositoryId: string) {
    if (!repositoryId) {
      throw new ValidationError('repositoryId is required');
    }

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const { missing } = await this.workspaceRepo.verifyReposExist([repositoryId]);
    if (missing.length > 0) {
      throw new NotFoundError('Repository not found');
    }

    await this.workspaceRepo.addRepo(workspaceId, repositoryId);
  }

  async removeRepo(workspaceId: string, repositoryId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const linked = workspace.repositories.some((r) => r.id === repositoryId);
    if (!linked) {
      throw new NotFoundError('Repository not linked to this workspace');
    }

    await this.workspaceRepo.removeRepo(workspaceId, repositoryId);
  }
}
