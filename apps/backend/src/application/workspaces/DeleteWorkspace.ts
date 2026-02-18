import { NotFoundError } from '@fleetwide/core';
import type { VolumeService } from '@fleetwide/workspace-manager';
import type { WorkspaceRepository } from '../../ports/repositories/WorkspaceRepository';

export class DeleteWorkspace {
  constructor(
    private workspaceRepo: WorkspaceRepository,
    private volumeService: VolumeService,
  ) {}

  async execute(id: string) {
    const existing = await this.workspaceRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Workspace not found');
    }

    await this.workspaceRepo.delete(id);
    await this.volumeService.removeWorkspaceVolumes(id).catch(() => {});
  }
}
