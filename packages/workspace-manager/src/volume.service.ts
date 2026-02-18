import type Docker from 'dockerode';
import { createLogger } from '@fleetwide/core';

const logger = createLogger({ name: 'volume-service' });

export class VolumeService {
  constructor(private docker: Docker) {}

  async ensureVolume(name: string): Promise<void> {
    try {
      await this.docker.getVolume(name).inspect();
    } catch {
      await this.docker.createVolume({
        Name: name,
        Labels: { 'fleetwide.managed': 'true' },
      });
      logger.info({ volume: name }, 'Volume created');
    }
  }

  getBindMounts(opts: {
    workspaceId: string;
    repos: Array<{ id: string; name: string; hostPath: string }>;
  }): string[] {
    const binds: string[] = [];

    // Repo source code — bind mount from host (read-write)
    for (const repo of opts.repos) {
      binds.push(`${repo.hostPath}:/workspace/${repo.name}:rw`);
    }

    // Dependency cache — named volume (persistent across sessions)
    binds.push(`fleetwide-deps-${opts.workspaceId}:/root/.cache:rw`);

    return binds;
  }

  async removeWorkspaceVolumes(workspaceId: string): Promise<void> {
    const volumeName = `fleetwide-deps-${workspaceId}`;
    try {
      await this.docker.getVolume(volumeName).remove();
      logger.info({ volume: volumeName }, 'Volume removed');
    } catch (err: unknown) {
      if (isDockerError(err) && err.statusCode === 404) {
        return;
      }
      throw err;
    }
  }

  async listManagedVolumes(): Promise<Array<{ name: string }>> {
    const result = await this.docker.listVolumes({
      filters: { label: ['fleetwide.managed=true'] },
    });

    return (result.Volumes ?? []).map((v) => ({ name: v.Name }));
  }

  async pruneUnused(): Promise<number> {
    const volumes = await this.listManagedVolumes();
    let pruned = 0;

    for (const vol of volumes) {
      try {
        await this.docker.getVolume(vol.name).remove();
        pruned++;
        logger.info({ volume: vol.name }, 'Pruned unused volume');
      } catch {
        // Volume in use — skip
      }
    }

    return pruned;
  }
}

function isDockerError(err: unknown): err is { statusCode: number } {
  return typeof err === 'object' && err !== null && 'statusCode' in err;
}
