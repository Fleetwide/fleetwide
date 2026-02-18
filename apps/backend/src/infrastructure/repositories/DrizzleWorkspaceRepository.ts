import { eq, inArray } from 'drizzle-orm';
import { generateId } from '@fleetwide/core';
import {
  workspaces,
  workspaceRepos,
  repositories,
  type Database,
} from '@fleetwide/database';
import {
  WorkspaceRepository,
  type CreateWorkspaceData,
  type UpdateWorkspaceData,
  type WorkspaceWithRepos,
} from '../../ports/repositories/WorkspaceRepository';

export class DrizzleWorkspaceRepository extends WorkspaceRepository {
  constructor(private db: Database) {
    super();
  }

  async create(data: CreateWorkspaceData) {
    const now = new Date();
    await this.db.insert(workspaces).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    });

    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, data.id));

    return workspace;
  }

  async findAll(): Promise<WorkspaceWithRepos[]> {
    const allWorkspaces = await this.db.select().from(workspaces);
    return Promise.all(
      allWorkspaces.map(async (ws) => {
        const repos = await this.getLinkedRepos(ws.id);
        return { ...ws, repositories: repos };
      }),
    );
  }

  async findById(id: string): Promise<WorkspaceWithRepos | null> {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id));

    if (!workspace) return null;

    const repos = await this.getLinkedRepos(id);
    return { ...workspace, repositories: repos };
  }

  async update(id: string, data: UpdateWorkspaceData) {
    await this.db
      .update(workspaces)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspaces.id, id));

    const [updated] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id));

    return updated;
  }

  async delete(id: string) {
    await this.db
      .delete(workspaceRepos)
      .where(eq(workspaceRepos.workspaceId, id));

    await this.db.delete(workspaces).where(eq(workspaces.id, id));
  }

  async verifyReposExist(repoIds: string[]) {
    if (repoIds.length === 0) return { found: [], missing: [] };

    const repos = await this.db
      .select({ id: repositories.id })
      .from(repositories)
      .where(inArray(repositories.id, repoIds));

    const foundSet = new Set(repos.map((r) => r.id));
    return {
      found: repoIds.filter((id) => foundSet.has(id)),
      missing: repoIds.filter((id) => !foundSet.has(id)),
    };
  }

  async addRepo(workspaceId: string, repositoryId: string) {
    await this.db.insert(workspaceRepos).values({
      id: generateId(),
      workspaceId,
      repositoryId,
    });

    await this.db
      .update(workspaces)
      .set({ updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
  }

  async removeRepo(workspaceId: string, repositoryId: string) {
    const links = await this.db
      .select()
      .from(workspaceRepos)
      .where(eq(workspaceRepos.workspaceId, workspaceId));

    const target = links.find((l) => l.repositoryId === repositoryId);
    if (!target) return;

    await this.db
      .delete(workspaceRepos)
      .where(eq(workspaceRepos.id, target.id));

    await this.db
      .update(workspaces)
      .set({ updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
  }

  private async getLinkedRepos(workspaceId: string) {
    const links = await this.db
      .select()
      .from(workspaceRepos)
      .where(eq(workspaceRepos.workspaceId, workspaceId));

    const repoIds = links.map((l) => l.repositoryId);
    if (repoIds.length === 0) return [];

    return this.db
      .select()
      .from(repositories)
      .where(inArray(repositories.id, repoIds));
  }
}
