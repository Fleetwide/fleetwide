import type { WorkspaceRow, WorkspaceInsert, RepositoryRow } from '@fleetwide/database';

export type WorkspaceWithRepos = WorkspaceRow & { repositories: RepositoryRow[] };

export type CreateWorkspaceData = Omit<WorkspaceInsert, 'createdAt' | 'updatedAt'>;

export type UpdateWorkspaceData = Partial<
  Pick<WorkspaceRow, 'name' | 'description' | 'image' | 'setupCommands' | 'environmentVariables' | 'memorySizeMb' | 'cpuCount' | 'status'>
>;

export abstract class WorkspaceRepository {
  abstract create(data: CreateWorkspaceData): Promise<WorkspaceRow>;
  abstract findAll(): Promise<WorkspaceWithRepos[]>;
  abstract findById(id: string): Promise<WorkspaceWithRepos | null>;
  abstract update(id: string, data: UpdateWorkspaceData): Promise<WorkspaceRow>;
  abstract delete(id: string): Promise<void>;
  abstract verifyReposExist(repoIds: string[]): Promise<{ found: string[]; missing: string[] }>;
  abstract addRepo(workspaceId: string, repositoryId: string): Promise<void>;
  abstract removeRepo(workspaceId: string, repositoryId: string): Promise<void>;
}
