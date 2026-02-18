import { validate, updateWorkspaceSchema, NotFoundError, ValidationError } from '@fleetwide/core';
import type { WorkspaceRepository } from '../../ports/repositories/WorkspaceRepository';

export class UpdateWorkspace {
  constructor(private workspaceRepo: WorkspaceRepository) {}

  async execute(id: string, body: unknown) {
    const result = validate(updateWorkspaceSchema, body);
    if (!result.success) {
      throw new ValidationError('Invalid workspace data', result.errors);
    }

    const existing = await this.workspaceRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Workspace not found');
    }

    await this.workspaceRepo.update(id, result.data);
    return this.workspaceRepo.findById(id);
  }
}
