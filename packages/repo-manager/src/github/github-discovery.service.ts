import type { Database } from '@fleetwide/database';
import { repositories } from '@fleetwide/database';
import { eq } from 'drizzle-orm';
import type { GitHubAppService } from './github-app.service.js';

export interface GitHubDiscoveredRepo {
  githubId: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  language: string | null;
  description: string | null;
  updatedAt: string;
  alreadyImported: boolean;
}

export class GitHubDiscoveryService {
  constructor(
    private appService: GitHubAppService,
    private db: Database,
  ) {}

  /** Discover repos accessible via a specific installation. */
  async discoverRepos(installationId: number): Promise<GitHubDiscoveredRepo[]> {
    const octokit = await this.appService.getInstallationOctokit(installationId);

    // Paginate through all accessible repos
    const repos: GitHubDiscoveredRepo[] = [];
    const iterator = octokit.paginate.iterator(octokit.rest.apps.listReposAccessibleToInstallation, {
      per_page: 100,
    });

    // Collect GitHub IDs of already-imported repos
    const imported = await this.getImportedGithubIds();

    for await (const response of iterator) {
      for (const repo of response.data) {
        repos.push({
          githubId: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch,
          htmlUrl: repo.html_url,
          cloneUrl: repo.clone_url,
          language: repo.language ?? null,
          description: repo.description ?? null,
          updatedAt: repo.updated_at ?? new Date().toISOString(),
          alreadyImported: imported.has(repo.id),
        });
      }
    }

    return repos;
  }

  /** Discover repos across all installations. */
  async discoverAllRepos(): Promise<GitHubDiscoveredRepo[]> {
    const installations = await this.appService.getInstallations();
    const allRepos: GitHubDiscoveredRepo[] = [];
    const seen = new Set<number>();

    for (const installation of installations) {
      const repos = await this.discoverRepos(installation.installationId);
      for (const repo of repos) {
        if (!seen.has(repo.githubId)) {
          seen.add(repo.githubId);
          allRepos.push(repo);
        }
      }
    }

    return allRepos;
  }

  private async getImportedGithubIds(): Promise<Set<number>> {
    const rows = await this.db
      .select({ githubId: repositories.githubId })
      .from(repositories)
      .where(eq(repositories.source, 'github'));

    const ids = new Set<number>();
    for (const row of rows) {
      if (row.githubId !== null) {
        ids.add(row.githubId);
      }
    }
    return ids;
  }
}
