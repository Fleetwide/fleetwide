import { createDatabase, type Database } from '@fleetwide/database';
import {
  GitHubAppService,
  GitHubDiscoveryService,
  GitHubImportService,
  GitService,
  RepoRegistry,
} from '@fleetwide/repo-manager';
import type { AppConfig } from './config.js';

export interface Services {
  db: Database;
  gitService: GitService;
  repoRegistry: RepoRegistry;
  githubAppService: GitHubAppService;
  githubDiscovery: GitHubDiscoveryService;
  githubImport: GitHubImportService;
}

export function createServices(config: AppConfig): Services {
  const db = createDatabase(config.databaseUrl);

  const gitService = new GitService();
  const repoRegistry = new RepoRegistry(db);
  const githubAppService = new GitHubAppService(db);
  const githubDiscovery = new GitHubDiscoveryService(githubAppService, db);
  const githubImport = new GitHubImportService(githubAppService, gitService, repoRegistry);

  return {
    db,
    gitService,
    repoRegistry,
    githubAppService,
    githubDiscovery,
    githubImport,
  };
}
