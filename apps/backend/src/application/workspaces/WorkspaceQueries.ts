import { NotFoundError } from '@fleetwide/core';
import { WorkspaceRepository } from '../../ports/repositories/WorkspaceRepository';

export class WorkspaceQueries {
  constructor(private workspaceRepo: WorkspaceRepository) {}

  async list() {
    return this.workspaceRepo.findAll();
  }

  async getById(id: string) {
    const workspace = await this.workspaceRepo.findById(id);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }
    return workspace;
  }
}
