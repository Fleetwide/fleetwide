import { eq, desc } from 'drizzle-orm';
import { validate, sessionStatusSchema, ValidationError } from '@fleetwide/core';
import {
  sessions,
  repositories,
  githubInstallations,
  type Database,
  type SessionRow,
} from '@fleetwide/database';
import { SessionRepository } from '../../ports/repositories/SessionRepository';

export class DrizzleSessionRepository extends SessionRepository {
  constructor(private db: Database) {
    super();
  }

  async findById(id: string): Promise<SessionRow | null> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id));

    return session ?? null;
  }

  async findAll(filter?: { workspaceId?: string; status?: string }): Promise<SessionRow[]> {
    let query = this.db.select().from(sessions).$dynamic();

    if (filter?.workspaceId) {
      query = query.where(eq(sessions.workspaceId, filter.workspaceId));
    }

    if (filter?.status) {
      const statusResult = validate(sessionStatusSchema, filter.status);
      if (statusResult.success) {
        query = query.where(eq(sessions.status, statusResult.data));
      }
    }

    return query.orderBy(desc(sessions.startedAt));
  }

  async resolveInstallationId(repoFullName: string): Promise<number> {
    const [repo] = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.githubFullName, repoFullName));

    if (!repo?.githubInstallationId) {
      throw new ValidationError(
        `No GitHub installation found for repo: ${repoFullName}`,
      );
    }

    const [installation] = await this.db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.id, repo.githubInstallationId));

    if (!installation) {
      throw new ValidationError(
        `GitHub installation record not found for repo: ${repoFullName}`,
      );
    }

    return installation.installationId;
  }
}
