import { createLogger } from '@fleetwide/core';
import type { GitHubAppService } from './github-app.service.js';
import type { GitHubDiscoveredRepo } from './github-discovery.service.js';
import type { GitService } from '../git.service.js';
import type { RepoRegistry } from '../repo-registry.js';

const logger = createLogger({ name: 'github-import' });

export interface ImportResult {
  githubId: number;
  fullName: string;
  status: 'success' | 'error';
  repositoryId?: string;
  error?: string;
}

export class GitHubImportService {
  constructor(
    private appService: GitHubAppService,
    private gitService: GitService,
    private repoRegistry: RepoRegistry,
  ) {}

  /**
   * Import selected repos from a GitHub installation.
   * Clones each repo to basePath/{org}/{repo-name} using an installation access token.
   */
  async importRepos(opts: {
    installationId: number;
    repos: GitHubDiscoveredRepo[];
    basePath: string;
  }): Promise<ImportResult[]> {
    const { installationId, repos, basePath } = opts;
    const results: ImportResult[] = [];

    // Get an installation token for authenticated cloning
    const octokit = await this.appService.getInstallationOctokit(installationId);
    const { data: tokenData } = await octokit.request(
      'POST /app/installations/{installation_id}/access_tokens',
      { installation_id: installationId },
    );
    const token = tokenData.token;

    for (const repo of repos) {
      try {
        // Check if already imported
        const existing = await this.repoRegistry.getByGithubId(repo.githubId);
        if (existing) {
          results.push({
            githubId: repo.githubId,
            fullName: repo.fullName,
            status: 'success',
            repositoryId: existing.id,
          });
          continue;
        }

        // Build authenticated clone URL
        const cloneUrl = repo.cloneUrl.replace(
          'https://github.com/',
          `https://x-access-token:${token}@github.com/`,
        );

        // Target path: basePath/org/repo-name
        const targetPath = `${basePath}/${repo.fullName}`;

        logger.info({ fullName: repo.fullName, targetPath }, 'Cloning repository');
        await this.gitService.clone(cloneUrl, targetPath);

        // Register in database
        const registered = await this.repoRegistry.register({
          name: repo.name,
          path: targetPath,
          remoteUrl: repo.cloneUrl,
          defaultBranch: repo.defaultBranch,
          source: 'github',
          githubId: repo.githubId,
          githubFullName: repo.fullName,
          githubInstallationId: await this.getInternalInstallationId(installationId),
          githubPrivate: repo.private,
          githubHtmlUrl: repo.htmlUrl,
        });

        // Mark as synced
        await this.repoRegistry.updateStatus(registered.id, 'synced');

        results.push({
          githubId: repo.githubId,
          fullName: repo.fullName,
          status: 'success',
          repositoryId: registered.id,
        });

        logger.info({ fullName: repo.fullName, id: registered.id }, 'Repository imported');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ fullName: repo.fullName, error: message }, 'Failed to import repository');
        results.push({
          githubId: repo.githubId,
          fullName: repo.fullName,
          status: 'error',
          error: message,
        });
      }
    }

    return results;
  }

  private async getInternalInstallationId(githubInstallationId: number): Promise<string> {
    const installations = await this.appService.getInstallations();
    const match = installations.find((i) => i.installationId === githubInstallationId);
    if (!match) throw new Error(`Installation ${githubInstallationId} not found`);
    return match.id;
  }
}
