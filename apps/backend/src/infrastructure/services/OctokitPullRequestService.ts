import type { Database } from '@fleetwide/database';
import type { GitHubAppService } from '@fleetwide/repo-manager';
import { eq } from 'drizzle-orm';
import { ValidationError } from '@fleetwide/core';
import { repositories, githubInstallations } from '@fleetwide/database';
import { GitHubPullRequestService } from '../../ports/services/GitHubPullRequestService';

export class OctokitPullRequestService extends GitHubPullRequestService {
  constructor(
    private appService: GitHubAppService,
    private db: Database,
  ) {
    super();
  }

  async createPullRequest(opts: {
    repoFullName: string;
    branchName: string;
    baseBranch: string;
    title: string;
    body: string;
  }) {
    const installationId = await this.resolveInstallationId(opts.repoFullName);
    await this.appService.initialize();
    const octokit = await this.appService.getInstallationOctokit(installationId);
    const [owner, repo] = opts.repoFullName.split('/');

    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: opts.title,
      body: opts.body,
      head: opts.branchName,
      base: opts.baseBranch,
    });

    return { prUrl: pr.html_url, prNumber: pr.number };
  }

  async deleteBranch(repoFullName: string, branchName: string) {
    const installationId = await this.resolveInstallationId(repoFullName);
    await this.appService.initialize();
    const octokit = await this.appService.getInstallationOctokit(installationId);
    const [owner, repo] = repoFullName.split('/');

    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
  }

  private async resolveInstallationId(repoFullName: string): Promise<number> {
    const [repo] = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.githubFullName, repoFullName));

    if (!repo?.githubInstallationId) {
      throw new ValidationError(
        `No GitHub installation found for repo: ${repoFullName}`,
      );
    }

    const [installation] = await this.db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.id, repo.githubInstallationId));

    if (!installation) {
      throw new ValidationError(
        `GitHub installation record not found for repo: ${repoFullName}`,
      );
    }

    return installation.installationId;
  }
}
