export abstract class GitHubPullRequestService {
  abstract createPullRequest(opts: {
    repoFullName: string;
    branchName: string;
    baseBranch: string;
    title: string;
    body: string;
  }): Promise<{ prUrl: string; prNumber: number }>;

  abstract deleteBranch(repoFullName: string, branchName: string): Promise<void>;
}
