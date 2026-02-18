import simpleGit, { type SimpleGit } from 'simple-git';
import type { GitStatus } from '@fleetwide/core';

export class GitService {
  /** Clone a repo to target path. Supports authenticated URLs for private repos. */
  async clone(remoteUrl: string, targetPath: string): Promise<void> {
    const git = simpleGit();
    await git.clone(remoteUrl, targetPath);
  }

  /** Pull latest changes from the remote. */
  async pull(repoPath: string): Promise<{ updated: boolean; commitHash: string }> {
    const git = this.getGit(repoPath);
    const before = await git.revparse(['HEAD']);
    await git.pull();
    const after = await git.revparse(['HEAD']);
    return {
      updated: before !== after,
      commitHash: after.trim(),
    };
  }

  /** Get the current git status of a repo. */
  async status(repoPath: string): Promise<GitStatus> {
    const git = this.getGit(repoPath);
    const status = await git.status();
    return {
      branch: status.current ?? 'HEAD',
      isClean: status.isClean(),
      staged: status.staged,
      modified: status.modified,
      untracked: status.not_added,
      ahead: status.ahead,
      behind: status.behind,
    };
  }

  /** Get the current HEAD commit hash. */
  async getHeadCommit(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    const hash = await git.revparse(['HEAD']);
    return hash.trim();
  }

  /** Get the default branch name from the remote. */
  async getDefaultBranch(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    try {
      const result = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']);
      return result.trim().replace('origin/', '');
    } catch {
      return 'main';
    }
  }

  private getGit(repoPath: string): SimpleGit {
    return simpleGit(repoPath);
  }
}
