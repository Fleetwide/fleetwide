import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/modules/app.module';
import { FleetwideExceptionFilter } from '../../src/filters/fleetwide-exception.filter';
import { TOKENS } from '../../src/core/injection-tokens';
import { vi } from 'vitest';

function createMocks() {
  return {
    dockerClient: {},
    gitService: {
      pull: vi.fn().mockResolvedValue({ updated: true, commitHash: 'abc123' }),
      clone: vi.fn().mockResolvedValue(undefined),
    },
    containerService: {
      getStatus: vi.fn().mockResolvedValue('running'),
      pruneOrphaned: vi.fn().mockResolvedValue(0),
    },
    volumeService: {
      removeWorkspaceVolumes: vi.fn().mockResolvedValue(undefined),
    },
    sessionOrchestrator: {
      startSession: vi.fn().mockResolvedValue({
        containerId: 'mock-container-id',
        containerName: 'mock-container-name',
      }),
      finalizeSession: vi.fn().mockResolvedValue({
        branchName: 'fleetwide/session-mock',
        diffSummary: { filesChanged: 1, insertions: 5, deletions: 2, files: [] },
        hasChanges: true,
      }),
      approveSession: vi.fn().mockResolvedValue([]),
      rejectSession: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
      destroyContainer: vi.fn().mockResolvedValue(undefined),
    },
    idleTimeoutManager: {
      start: vi.fn(),
      stop: vi.fn(),
    },
    githubAppService: {
      getStoredConfig: vi.fn().mockResolvedValue(null),
      getInstallationsCount: vi.fn().mockResolvedValue(0),
      getManifestCreationUrl: vi.fn().mockReturnValue('https://github.com/settings/apps/new'),
      exchangeManifestCode: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getInstallUrl: vi.fn().mockResolvedValue('https://github.com/apps/test/installations/new'),
      getInstallations: vi.fn().mockResolvedValue([]),
      initialize: vi.fn().mockResolvedValue(undefined),
      handleInstallationCallback: vi.fn().mockResolvedValue(undefined),
      removeInstallation: vi.fn().mockResolvedValue(undefined),
    },
    githubDiscoveryService: {
      discoverAllRepos: vi.fn().mockResolvedValue([]),
      discoverRepos: vi.fn().mockResolvedValue([]),
    },
    githubImportService: {
      importRepos: vi.fn().mockResolvedValue([]),
    },
  };
}

export type TestMocks = ReturnType<typeof createMocks>;

export async function createTestApp(): Promise<{
  app: INestApplication;
  mocks: TestMocks;
}> {
  const mocks = createMocks();

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(TOKENS.DOCKER_CLIENT)
    .useValue(mocks.dockerClient)
    .overrideProvider(TOKENS.GIT_SERVICE)
    .useValue(mocks.gitService)
    .overrideProvider(TOKENS.CONTAINER_SERVICE)
    .useValue(mocks.containerService)
    .overrideProvider(TOKENS.VOLUME_SERVICE)
    .useValue(mocks.volumeService)
    .overrideProvider(TOKENS.SESSION_ORCHESTRATOR)
    .useValue(mocks.sessionOrchestrator)
    .overrideProvider(TOKENS.IDLE_TIMEOUT_MANAGER)
    .useValue(mocks.idleTimeoutManager)
    .overrideProvider(TOKENS.GITHUB_APP_SERVICE)
    .useValue(mocks.githubAppService)
    .overrideProvider(TOKENS.GITHUB_DISCOVERY_SERVICE)
    .useValue(mocks.githubDiscoveryService)
    .overrideProvider(TOKENS.GITHUB_IMPORT_SERVICE)
    .useValue(mocks.githubImportService)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new FleetwideExceptionFilter());
  await app.init();

  return { app, mocks };
}
