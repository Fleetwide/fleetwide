import {
  repositories,
  workspaces,
  workspaceRepos,
  sessions,
  type Database,
  type RepositoryInsert,
  type WorkspaceInsert,
  type SessionInsert,
} from '@fleetwide/database';
import { repositoryFactory } from './repository.factory';
import { workspaceFactory } from './workspace.factory';
import { sessionFactory } from './session.factory';

export { repositoryFactory, workspaceFactory, sessionFactory };

export const seed = {
  async repository(db: Database, overrides?: Partial<RepositoryInsert>) {
    const data = repositoryFactory.build(overrides);
    const [row] = await db.insert(repositories).values(data).returning();
    return row;
  },

  async workspace(db: Database, overrides?: Partial<WorkspaceInsert>) {
    const data = workspaceFactory.build(overrides);
    const [row] = await db.insert(workspaces).values(data).returning();
    return row;
  },

  async workspaceWithRepos(db: Database, repoCount = 1) {
    const repos = [];
    for (let i = 0; i < repoCount; i++) {
      repos.push(await seed.repository(db));
    }

    const ws = await seed.workspace(db);

    for (const repo of repos) {
      await db.insert(workspaceRepos).values({
        id: `wr-${ws.id}-${repo.id}`,
        workspaceId: ws.id,
        repositoryId: repo.id,
      });
    }

    return { workspace: ws, repos };
  },

  async session(db: Database, overrides?: Partial<SessionInsert>) {
    const data = sessionFactory.build(overrides);
    const [row] = await db.insert(sessions).values(data).returning();
    return row;
  },
};
