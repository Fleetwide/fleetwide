import { Module } from '@nestjs/common';
import type { Database } from '@fleetwide/database';
import type { GitHubAppService } from '@fleetwide/repo-manager';
import type { SessionOrchestrator, ContainerService } from '@fleetwide/workspace-manager';
import { TOKENS } from '../core/injection-tokens';
import { SessionsController } from '../interfaces/http/sessions.controller';
import { SessionRepository } from '../ports/repositories/SessionRepository';
import { WorkspaceRepository } from '../ports/repositories/WorkspaceRepository';
import { GitHubPullRequestService } from '../ports/services/GitHubPullRequestService';
import { AgentRunnerService } from '../ports/services/AgentRunnerService';
import { DrizzleSessionRepository } from '../infrastructure/repositories/DrizzleSessionRepository';
import { OctokitPullRequestService } from '../infrastructure/services/OctokitPullRequestService';
import { AgentEngineRunnerService } from '../infrastructure/services/AgentEngineRunnerService';
import { StartSession } from '../application/sessions/StartSession';
import { FinalizeSession } from '../application/sessions/FinalizeSession';
import { ApproveSession } from '../application/sessions/ApproveSession';
import { RejectSession } from '../application/sessions/RejectSession';
import { ExecInSession } from '../application/sessions/ExecInSession';
import { DestroySession } from '../application/sessions/DestroySession';
import { RunAgent } from '../application/sessions/RunAgent';
import { SessionQueries } from '../application/sessions/SessionQueries';
import { SessionsGateway } from '../interfaces/ws/sessions.gateway';
import { WorkspacesModule } from './workspaces.module';
import { WsModule } from './ws.module';

@Module({
  imports: [WorkspacesModule, WsModule],
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
      provide: FinalizeSession,
      inject: [SessionRepository, TOKENS.SESSION_ORCHESTRATOR],
      useFactory: (repo: SessionRepository, orch: SessionOrchestrator) =>
        new FinalizeSession(repo, orch),
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
    // Agent runner
    {
      provide: AgentRunnerService,
      inject: [TOKENS.SESSION_ORCHESTRATOR, SessionsGateway, TOKENS.ANTHROPIC_API_KEY],
      useFactory: (
        orch: SessionOrchestrator,
        gateway: SessionsGateway,
        apiKey: string,
      ) => new AgentEngineRunnerService(orch, gateway, apiKey),
    },
    {
      provide: RunAgent,
      inject: [SessionRepository, AgentRunnerService, TOKENS.SESSION_ORCHESTRATOR],
      useFactory: (
        repo: SessionRepository,
        agentRunner: AgentRunnerService,
        orch: SessionOrchestrator,
      ) => new RunAgent(repo, agentRunner, orch),
    },
  ],
})
export class SessionsModule {}
