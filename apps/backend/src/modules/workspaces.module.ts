import { Module } from '@nestjs/common';
import type { Database } from '@fleetwide/database';
import type { VolumeService } from '@fleetwide/workspace-manager';
import { TOKENS } from '../core/injection-tokens';
import { WorkspacesController } from '../interfaces/http/workspaces.controller';
import { WorkspaceRepository } from '../ports/repositories/WorkspaceRepository';
import { UnitOfWork } from '../ports/uow/UnitOfWork';
import { DrizzleWorkspaceRepository } from '../infrastructure/repositories/DrizzleWorkspaceRepository';
import { DrizzleUnitOfWork } from '../infrastructure/uow/DrizzleUnitOfWork';
import { CreateWorkspace } from '../application/workspaces/CreateWorkspace';
import { UpdateWorkspace } from '../application/workspaces/UpdateWorkspace';
import { DeleteWorkspace } from '../application/workspaces/DeleteWorkspace';
import { ManageWorkspaceRepos } from '../application/workspaces/ManageWorkspaceRepos';
import { WorkspaceQueries } from '../application/workspaces/WorkspaceQueries';

@Module({
  controllers: [WorkspacesController],
  providers: [
    // Port → implementation bindings
    {
      provide: WorkspaceRepository,
      inject: [TOKENS.DATABASE],
      useFactory: (db: Database) => new DrizzleWorkspaceRepository(db),
    },
    {
      provide: UnitOfWork,
      inject: [TOKENS.DATABASE],
      useFactory: (db: Database) => new DrizzleUnitOfWork(db),
    },
    // Use-case factories
    {
      provide: CreateWorkspace,
      inject: [WorkspaceRepository, UnitOfWork],
      useFactory: (repo: WorkspaceRepository, uow: UnitOfWork) =>
        new CreateWorkspace(repo, uow),
    },
    {
      provide: UpdateWorkspace,
      inject: [WorkspaceRepository],
      useFactory: (repo: WorkspaceRepository) => new UpdateWorkspace(repo),
    },
    {
      provide: DeleteWorkspace,
      inject: [WorkspaceRepository, TOKENS.VOLUME_SERVICE],
      useFactory: (repo: WorkspaceRepository, vs: VolumeService) =>
        new DeleteWorkspace(repo, vs),
    },
    {
      provide: ManageWorkspaceRepos,
      inject: [WorkspaceRepository],
      useFactory: (repo: WorkspaceRepository) => new ManageWorkspaceRepos(repo),
    },
    {
      provide: WorkspaceQueries,
      inject: [WorkspaceRepository],
      useFactory: (repo: WorkspaceRepository) => new WorkspaceQueries(repo),
    },
  ],
  exports: [WorkspaceRepository],
})
export class WorkspacesModule {}
