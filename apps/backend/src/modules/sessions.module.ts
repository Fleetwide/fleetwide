import { Module } from '@nestjs/common';
import type { Database } from '@fleetwide/database';
import type { GitHubAppService } from '@fleetwide/repo-manager';
import type { SessionOrchestrator, ContainerService } from '@fleetwide/workspace-manager';
import { TOKENS } from '../core/injection-tokens';
import { SessionsController } from '../interfaces/http/sessions.controller';
import { SessionRepository } from '../ports/repositories/SessionRepository';
import { WorkspaceRepository } from '../ports/repositories/WorkspaceRepository';
import { GitHubPullRequestService } from '../ports/services/GitHubPullRequestService';
import { DrizzleSessionRepository } from '../infrastructure/repositories/DrizzleSessionRepository';
import { OctokitPullRequestService } from '../infrastructure/services/OctokitPullRequestService';
import { StartSession } from '../application/sessions/StartSession';
import { ApproveSession } from '../application/sessions/ApproveSession';
import { RejectSession } from '../application/sessions/RejectSession';
import { ExecInSession } from '../application/sessions/ExecInSession';
import { DestroySession } from '../application/sessions/DestroySession';
import { SessionQueries } from '../application/sessions/SessionQueries';
import { WorkspacesModule } from './workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [SessionsController],
  providers: [
    // Port → implementation bindings
    {
      provide: SessionRepository,
      inject: [TOKENS.DATABASE],
      useFactory: (db: Database) => new DrizzleSessionRepository(db),
    },
    {
      provide: GitHubPullRequestService,
      inject: [TOKENS.GITHUB_APP_SERVICE, TOKENS.DATABASE],
      useFactory: (appService: GitHubAppService, db: Database) =>
        new OctokitPullRequestService(appService, db),
    },
    // Use-case factories
    {
      provide: StartSession,
      inject: [WorkspaceRepository, TOKENS.SESSION_ORCHESTRATOR],
      useFactory: (repo: WorkspaceRepository, orch: SessionOrchestrator) =>
        new StartSession(repo, orch),
    },
    {
      provide: ApproveSession,
      inject: [SessionRepository, GitHubPullRequestService, TOKENS.SESSION_ORCHESTRATOR],
      useFactory: (
        repo: SessionRepository,
        prService: GitHubPullRequestService,
        orch: SessionOrchestrator,
      ) => new ApproveSession(repo, prService, orch),
    },
    {
      provide: RejectSession,
      inject: [SessionRepository, GitHubPullRequestService, TOKENS.SESSION_ORCHESTRATOR],
      useFactory: (
        repo: SessionRepository,
        prService: GitHubPullRequestService,
        orch: SessionOrchestrator,
      ) => new RejectSession(repo, prService, orch),
    },
    {
      provide: ExecInSession,
      inject: [SessionRepository, TOKENS.SESSION_ORCHESTRATOR],
      useFactory: (repo: SessionRepository, orch: SessionOrchestrator) =>
        new ExecInSession(repo, orch),
    },
    {
      provide: DestroySession,
      inject: [SessionRepository, TOKENS.SESSION_ORCHESTRATOR],
      useFactory: (repo: SessionRepository, orch: SessionOrchestrator) =>
        new DestroySession(repo, orch),
    },
    {
      provide: SessionQueries,
      inject: [SessionRepository, TOKENS.CONTAINER_SERVICE],
      useFactory: (repo: SessionRepository, cs: ContainerService) =>
        new SessionQueries(repo, cs),
    },
  ],
})
export class SessionsModule {}
