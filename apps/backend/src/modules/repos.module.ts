import { Module } from '@nestjs/common';
import type { RepoRegistry, GitService } from '@fleetwide/repo-manager';
import { TOKENS } from '../core/injection-tokens';
import { ReposController } from '../interfaces/http/repos.controller';
import { SyncRepo } from '../application/repos/SyncRepo';

@Module({
  controllers: [ReposController],
  providers: [
    {
      provide: SyncRepo,
      inject: [TOKENS.REPO_REGISTRY, TOKENS.GIT_SERVICE],
      useFactory: (registry: RepoRegistry, gitService: GitService) =>
        new SyncRepo(registry, gitService),
    },
  ],
})
export class ReposModule {}
