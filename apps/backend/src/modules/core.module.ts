import {
  Module,
  Global,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase } from '@fleetwide/database';
import {
  GitService,
  RepoRegistry,
  GitHubAppService,
  GitHubDiscoveryService,
  GitHubImportService,
} from '@fleetwide/repo-manager';
import {
  createDockerClient,
  ContainerService,
  VolumeService,
  SessionOrchestrator,
  IdleTimeoutManager,
} from '@fleetwide/workspace-manager';
import { TOKENS } from '../core/injection-tokens';

@Global()
@Module({
  providers: [
    {
      provide: TOKENS.DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url =
          config.get<string>('DATABASE_URL') ??
          'postgresql://fleetwide:fleetwide_dev@localhost:5432/fleetwide';
        return createDatabase(url);
      },
    },
    {
      provide: TOKENS.DOCKER_CLIENT,
      useFactory: () => createDockerClient(),
    },
    {
      provide: TOKENS.GIT_SERVICE,
      useFactory: () => new GitService(),
    },
    {
      provide: TOKENS.REPO_REGISTRY,
      inject: [TOKENS.DATABASE],
      useFactory: (db: ReturnType<typeof createDatabase>) =>
        new RepoRegistry(db),
    },
    {
      provide: TOKENS.GITHUB_APP_SERVICE,
      inject: [TOKENS.DATABASE],
      useFactory: (db: ReturnType<typeof createDatabase>) =>
        new GitHubAppService(db),
    },
    {
      provide: TOKENS.GITHUB_DISCOVERY_SERVICE,
      inject: [TOKENS.GITHUB_APP_SERVICE, TOKENS.DATABASE],
      useFactory: (
        appService: GitHubAppService,
        db: ReturnType<typeof createDatabase>,
      ) => new GitHubDiscoveryService(appService, db),
    },
    {
      provide: TOKENS.GITHUB_IMPORT_SERVICE,
      inject: [TOKENS.GITHUB_APP_SERVICE, TOKENS.GIT_SERVICE, TOKENS.REPO_REGISTRY],
      useFactory: (
        appService: GitHubAppService,
        gitService: GitService,
        repoRegistry: RepoRegistry,
      ) => new GitHubImportService(appService, gitService, repoRegistry),
    },
    {
      provide: TOKENS.CONTAINER_SERVICE,
      inject: [TOKENS.DOCKER_CLIENT],
      useFactory: (docker: ReturnType<typeof createDockerClient>) =>
        new ContainerService(docker),
    },
    {
      provide: TOKENS.VOLUME_SERVICE,
      inject: [TOKENS.DOCKER_CLIENT],
      useFactory: (docker: ReturnType<typeof createDockerClient>) =>
        new VolumeService(docker),
    },
    {
      provide: TOKENS.SESSION_ORCHESTRATOR,
      inject: [TOKENS.CONTAINER_SERVICE, TOKENS.VOLUME_SERVICE, TOKENS.DATABASE],
      useFactory: (
        containerService: ContainerService,
        volumeService: VolumeService,
        db: ReturnType<typeof createDatabase>,
      ) => new SessionOrchestrator(containerService, volumeService, db),
    },
    {
      provide: TOKENS.IDLE_TIMEOUT_MANAGER,
      inject: [TOKENS.SESSION_ORCHESTRATOR],
      useFactory: (orchestrator: SessionOrchestrator) =>
        new IdleTimeoutManager(orchestrator),
    },
    {
      provide: TOKENS.ANTHROPIC_API_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('ANTHROPIC_API_KEY') ?? '',
    },
  ],
  exports: [
    TOKENS.DATABASE,
    TOKENS.DOCKER_CLIENT,
    TOKENS.GIT_SERVICE,
    TOKENS.REPO_REGISTRY,
    TOKENS.GITHUB_APP_SERVICE,
    TOKENS.GITHUB_DISCOVERY_SERVICE,
    TOKENS.GITHUB_IMPORT_SERVICE,
    TOKENS.CONTAINER_SERVICE,
    TOKENS.VOLUME_SERVICE,
    TOKENS.SESSION_ORCHESTRATOR,
    TOKENS.IDLE_TIMEOUT_MANAGER,
    TOKENS.ANTHROPIC_API_KEY,
  ],
})
export class CoreModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(TOKENS.IDLE_TIMEOUT_MANAGER)
    private idleTimeoutManager: IdleTimeoutManager,
    @Inject(TOKENS.CONTAINER_SERVICE)
    private containerService: ContainerService,
  ) {}

  onApplicationBootstrap() {
    this.idleTimeoutManager.start();

    this.containerService.pruneOrphaned().then((count) => {
      if (count > 0) console.log(`Pruned ${count} orphaned containers`);
    }).catch((err) => {
      console.warn('Failed to prune orphaned containers:', err);
    });
  }

  onApplicationShutdown() {
    this.idleTimeoutManager.stop();
  }
}
