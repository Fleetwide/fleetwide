import type { SessionRow } from '@fleetwide/database';

export abstract class SessionRepository {
  abstract findById(id: string): Promise<SessionRow | null>;
  abstract findAll(filter?: { workspaceId?: string; status?: string }): Promise<SessionRow[]>;
  abstract resolveInstallationId(repoFullName: string): Promise<number>;
}
