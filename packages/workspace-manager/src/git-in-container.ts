import type { ContainerExecResult, DiffSummary } from '@fleetwide/core';
import { createLogger } from '@fleetwide/core';
import type { ContainerService } from './container.service.js';

const logger = createLogger({ name: 'git-in-container' });

export class GitInContainer {
  constructor(private containerService: ContainerService) {}

  async configureGit(
    containerId: string,
    opts: { name: string; email: string },
  ): Promise<void> {
    await this.containerService.exec(containerId, [
      'git',
      'config',
      '--global',
      'user.name',
      opts.name,
    ]);
    await this.containerService.exec(containerId, [
      'git',
      'config',
      '--global',
      'user.email',
      opts.email,
    ]);
  }

  async checkoutAndPull(
    containerId: string,
    repoName: string,
    defaultBranch: string,
  ): Promise<void> {
    const workDir = `/workspace/${repoName}`;
    await this.containerService.exec(containerId, ['git', 'checkout', defaultBranch], {
      workingDir: workDir,
    });
    await this.containerService.exec(containerId, ['git', 'pull'], {
      workingDir: workDir,
    });
  }

  async createBranch(
    containerId: string,
    repoName: string,
    branchName: string,
  ): Promise<void> {
    const workDir = `/workspace/${repoName}`;
    await this.containerService.exec(containerId, ['git', 'checkout', '-b', branchName], {
      workingDir: workDir,
    });
  }

  async hasChanges(containerId: string, repoName: string): Promise<boolean> {
    const workDir = `/workspace/${repoName}`;
    const result = await this.containerService.exec(
      containerId,
      ['git', 'status', '--porcelain'],
      { workingDir: workDir },
    );
    return result.stdout.trim().length > 0;
  }

  async commitAll(
    containerId: string,
    repoName: string,
    message: string,
  ): Promise<ContainerExecResult> {
    const workDir = `/workspace/${repoName}`;
    await this.containerService.exec(containerId, ['git', 'add', '-A'], {
      workingDir: workDir,
    });
    return this.containerService.exec(
      containerId,
      ['git', 'commit', '-m', message],
      { workingDir: workDir },
    );
  }

  async pushBranch(
    containerId: string,
    repoName: string,
    branchName: string,
    remoteUrl: string,
  ): Promise<ContainerExecResult> {
    const workDir = `/workspace/${repoName}`;
    return this.containerService.exec(
      containerId,
      ['git', 'push', remoteUrl, `HEAD:${branchName}`],
      { workingDir: workDir },
    );
  }

  async getDiffSummary(
    containerId: string,
    repoName: string,
    baseBranch: string,
  ): Promise<DiffSummary> {
    const workDir = `/workspace/${repoName}`;

    // Get numstat for insertions/deletions per file
    const numstat = await this.containerService.exec(
      containerId,
      ['git', 'diff', '--numstat', baseBranch],
      { workingDir: workDir },
    );

    // Get name-status for file status (added/modified/deleted/renamed)
    const nameStatus = await this.containerService.exec(
      containerId,
      ['git', 'diff', '--name-status', baseBranch],
      { workingDir: workDir },
    );

    const statusMap = new Map<string, 'added' | 'modified' | 'deleted' | 'renamed'>();
    for (const line of nameStatus.stdout.trim().split('\n')) {
      if (!line) continue;
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts[pathParts.length - 1]; // Handle renames (old\tnew)
      if (!filePath) continue;
      switch (status?.[0]) {
        case 'A':
          statusMap.set(filePath, 'added');
          break;
        case 'D':
          statusMap.set(filePath, 'deleted');
          break;
        case 'R':
          statusMap.set(filePath, 'renamed');
          break;
        default:
          statusMap.set(filePath, 'modified');
      }
    }

    let totalInsertions = 0;
    let totalDeletions = 0;
    const files: DiffSummary['files'] = [];

    for (const line of numstat.stdout.trim().split('\n')) {
      if (!line) continue;
      const [ins, del, path] = line.split('\t');
      if (!path) continue;
      const insertions = parseInt(ins ?? '0', 10) || 0;
      const deletions = parseInt(del ?? '0', 10) || 0;
      totalInsertions += insertions;
      totalDeletions += deletions;
      files.push({
        path,
        repoName,
        status: statusMap.get(path) ?? 'modified',
        insertions,
        deletions,
      });
    }

    return {
      filesChanged: files.length,
      insertions: totalInsertions,
      deletions: totalDeletions,
      files,
    };
  }

  async deleteRemoteBranch(
    containerId: string,
    repoName: string,
    branchName: string,
    remoteUrl: string,
  ): Promise<void> {
    const workDir = `/workspace/${repoName}`;
    const result = await this.containerService.exec(
      containerId,
      ['git', 'push', remoteUrl, '--delete', branchName],
      { workingDir: workDir },
    );
    if (result.exitCode !== 0) {
      logger.warn(
        { repoName, branchName, stderr: result.stderr },
        'Failed to delete remote branch',
      );
    }
  }
}
