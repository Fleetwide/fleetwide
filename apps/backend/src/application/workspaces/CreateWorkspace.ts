import {
  validate,
  createWorkspaceSchema,
  generateId,
  ValidationError,
} from '@fleetwide/core';
import type { WorkspaceRepository } from '../../ports/repositories/WorkspaceRepository';
import type { UnitOfWork } from '../../ports/uow/UnitOfWork';

export class CreateWorkspace {
  constructor(
    private workspaceRepo: WorkspaceRepository,
    private uow: UnitOfWork,
  ) {}

  async execute(body: unknown) {
    const result = validate(createWorkspaceSchema, body);
    if (!result.success) {
      throw new ValidationError('Invalid workspace data', result.errors);
    }

    const { repositoryIds, ...workspaceData } = result.data;

    const { missing } = await this.workspaceRepo.verifyReposExist(repositoryIds);
    if (missing.length > 0) {
      throw new ValidationError('Some repositories not found', { missing });
    }

    const workspaceId = generateId();

    return this.uow.run(async () => {
      const workspace = await this.workspaceRepo.create({
        id: workspaceId,
        ...workspaceData,
        status: 'active',
      });

      for (const repoId of repositoryIds) {
        await this.workspaceRepo.addRepo(workspaceId, repoId);
      }

      const enriched = await this.workspaceRepo.findById(workspaceId);
      return enriched ?? { ...workspace, repositories: [] };
    });
  }
}
