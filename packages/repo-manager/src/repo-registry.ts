import { eq, like, and, sql } from 'drizzle-orm';
import { generateId } from '@fleetwide/core';
import { type Database, repositories, type RepositoryRow } from '@fleetwide/database';
import type { RepoFilter, PaginationParams, PaginatedResult } from '@fleetwide/core';

export interface RegisterRepoInput {
  name: string;
  path: string;
  remoteUrl?: string;
  defaultBranch?: string;
  source?: 'github' | 'manual_url' | 'local_path';
  githubId?: number;
  githubFullName?: string;
  githubInstallationId?: string;
  githubPrivate?: boolean;
  githubHtmlUrl?: string;
}

export class RepoRegistry {
  constructor(private db: Database) {}

  async register(data: RegisterRepoInput): Promise<RepositoryRow> {
    const id = generateId();
    const [row] = await this.db
      .insert(repositories)
      .values({
        id,
        name: data.name,
        path: data.path,
        remoteUrl: data.remoteUrl,
        defaultBranch: data.defaultBranch ?? 'main',
        source: data.source ?? 'manual_url',
        status: 'uninitialized',
        githubId: data.githubId,
        githubFullName: data.githubFullName,
        githubInstallationId: data.githubInstallationId,
        githubPrivate: data.githubPrivate,
        githubHtmlUrl: data.githubHtmlUrl,
      })
      .returning();
    return row!;
  }

  async list(
    filter?: RepoFilter,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<RepositoryRow>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filter?.status) {
      conditions.push(eq(repositories.status, filter.status));
    }
    if (filter?.search) {
      conditions.push(like(repositories.name, `%${filter.search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(repositories)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(repositories.createdAt),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(repositories)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string): Promise<RepositoryRow | null> {
    const [row] = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.id, id))
      .limit(1);
    return row ?? null;
  }

  async getByGithubId(githubId: number): Promise<RepositoryRow | null> {
    const [row] = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.githubId, githubId))
      .limit(1);
    return row ?? null;
  }

  async updateStatus(
    id: string,
    status: 'synced' | 'syncing' | 'error' | 'uninitialized',
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const values: Record<string, unknown> = { status, updatedAt: new Date() };
    if (metadata) {
      values.metadata = metadata;
    }
    await this.db.update(repositories).set(values).where(eq(repositories.id, id));
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(repositories).where(eq(repositories.id, id));
  }
}
