import { eq, inArray } from 'drizzle-orm';
import {
  createLogger,
  type WorkspaceSessionStatus,
  type SessionMessage,
  type DiffSummary,
  type SetupLogEntry,
} from '@fleetwide/core';
import {
  type Database,
  workspaces,
  workspaceRepos,
  sessions,
  repositories,
} from '@fleetwide/database';
import type { ContainerService } from './container.service.js';
import type { VolumeService } from './volume.service.js';
import { GitInContainer } from './git-in-container.js';

const logger = createLogger({ name: 'session-orchestrator' });

const GIT_USER_NAME = 'Fleetwide Bot';
const GIT_USER_EMAIL = 'bot@fleetwide.dev';
const MAX_PUSH_RETRIES = 3;

export class SessionOrchestrator {
  private gitInContainer: GitInContainer;

  constructor(
    private containerService: ContainerService,
    private volumeService: VolumeService,
    private db: Database,
  ) {
    this.gitInContainer = new GitInContainer(containerService);
  }

  async startSession(opts: {
    workspaceId: string;
    sessionId: string;
    prompt: string;
    providerId?: string;
    model?: string;
    systemPrompt?: string;
    idleTimeoutMinutes?: number;
    onStatusChange?: (status: WorkspaceSessionStatus) => void;
  }): Promise<{ containerId: string; containerName: string }> {
    const {
      workspaceId,
      sessionId,
      prompt,
      providerId = 'claude',
      model,
      systemPrompt,
      idleTimeoutMinutes = 30,
      onStatusChange,
    } = opts;

    // 1. Load workspace definition
    const [workspace] = await this.db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    // 2. Load repos associated with workspace
    const wsRepos = await this.db
      .select()
      .from(workspaceRepos)
      .where(eq(workspaceRepos.workspaceId, workspaceId));

    const repoIds = wsRepos.map((wr) => wr.repositoryId);
    const repos =
      repoIds.length > 0
        ? await this.db.select().from(repositories).where(inArray(repositories.id, repoIds))
        : [];

    // 3. Create session record in DB
    await this.db.insert(sessions).values({
      id: sessionId,
      workspaceId,
      status: 'starting',
      prompt,
      providerId,
      model,
      systemPrompt,
      idleTimeoutMinutes,
      startedAt: new Date(),
    });

    const emitStatus = async (status: WorkspaceSessionStatus) => {
      await this.updateSessionStatus(sessionId, status);
      onStatusChange?.(status);
    };

    try {
      // 4. Ensure dependency cache volume exists
      await this.volumeService.ensureVolume(`fleetwide-deps-${workspaceId}`);

      // 5. Get bind mounts
      const repoBindInfo = repos.map((r) => ({
        id: r.id,
        name: r.name,
        hostPath: r.path,
      }));
      const binds = this.volumeService.getBindMounts({
        workspaceId,
        repos: repoBindInfo,
      });

      // 6. Create and start container
      const env: Record<string, string> = {
        ...(workspace.environmentVariables as Record<string, string>),
        FLEETWIDE_SESSION_ID: sessionId,
        FLEETWIDE_WORKSPACE_ID: workspaceId,
      };

      const { containerId, containerName } = await this.containerService.createAndStart({
        sessionId,
        image: workspace.image,
        env,
        binds,
        memorySizeMb: workspace.memorySizeMb,
        cpuCount: workspace.cpuCount,
        labels: {
          'fleetwide.workspace-id': workspaceId,
        },
      });

      // Update session with container info
      await this.db
        .update(sessions)
        .set({ containerId, containerName })
        .where(eq(sessions.id, sessionId));

      await emitStatus('starting');

      // 7. Configure git identity
      await this.gitInContainer.configureGit(containerId, {
        name: GIT_USER_NAME,
        email: GIT_USER_EMAIL,
      });

      // 8. For each repo: checkout default branch, pull, create working branch
      const branchName = `fleetwide/session-${sessionId}`;
      for (const repo of repos) {
        await this.gitInContainer.checkoutAndPull(containerId, repo.name, repo.defaultBranch);
        await this.gitInContainer.createBranch(containerId, repo.name, branchName);
      }

      await this.db
        .update(sessions)
        .set({ branchName })
        .where(eq(sessions.id, sessionId));

      // 9. Run setup commands
      await emitStatus('setup');
      const setupLogs: SetupLogEntry[] = [];

      for (const cmd of (workspace.setupCommands as string[]) ?? []) {
        const result = await this.containerService.exec(containerId, ['/bin/sh', '-c', cmd]);
        setupLogs.push({
          command: cmd,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        });

        if (result.exitCode !== 0) {
          logger.warn({ cmd, exitCode: result.exitCode, stderr: result.stderr }, 'Setup command failed');
        }
      }

      await this.db
        .update(sessions)
        .set({ setupLogs, lastActivityAt: new Date() })
        .where(eq(sessions.id, sessionId));

      // 10. Ready for agent
      await emitStatus('running');

      return { containerId, containerName };
    } catch (err) {
      await emitStatus('failed');
      throw err;
    }
  }

  async exec(
    sessionId: string,
    cmd: string[],
    opts?: { workingDir?: string },
  ) {
    const session = await this.getSessionRow(sessionId);
    if (!session.containerId) throw new Error('Session container not available');

    const result = await this.containerService.exec(session.containerId, cmd, opts);

    // Update lastActivityAt
    await this.db
      .update(sessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(sessions.id, sessionId));

    return result;
  }

  async execStream(
    sessionId: string,
    cmd: string[],
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    opts?: { workingDir?: string },
  ): Promise<number> {
    const session = await this.getSessionRow(sessionId);
    if (!session.containerId) throw new Error('Session container not available');

    const exitCode = await this.containerService.execStream(
      session.containerId,
      cmd,
      onStdout,
      onStderr,
      opts,
    );

    await this.db
      .update(sessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(sessions.id, sessionId));

    return exitCode;
  }

  async persistMessage(sessionId: string, message: SessionMessage): Promise<void> {
    const session = await this.getSessionRow(sessionId);
    const currentMessages = (session.messages as SessionMessage[]) ?? [];
    await this.db
      .update(sessions)
      .set({
        messages: [...currentMessages, message],
        lastActivityAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));
  }

  async finalizeSession(
    sessionId: string,
    getAuthenticatedRemoteUrl?: (repoName: string) => Promise<string>,
  ): Promise<{
    branchName: string;
    diffSummary: DiffSummary;
    hasChanges: boolean;
  }> {
    const session = await this.getSessionRow(sessionId);
    if (!session.containerId) throw new Error('Session container not available');

    await this.updateSessionStatus(sessionId, 'finalizing');

    const wsRepos = await this.db
      .select()
      .from(workspaceRepos)
      .where(eq(workspaceRepos.workspaceId, session.workspaceId));
    const repoIds = wsRepos.map((wr) => wr.repositoryId);
    const repos =
      repoIds.length > 0
        ? await this.db.select().from(repositories).where(inArray(repositories.id, repoIds))
        : [];

    const branchName = session.branchName ?? `fleetwide/session-${sessionId}`;
    const allFiles: DiffSummary['files'] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;
    let anyChanges = false;

    for (const repo of repos) {
      const hasChanges = await this.gitInContainer.hasChanges(session.containerId, repo.name);
      if (!hasChanges) continue;

      anyChanges = true;

      // Commit changes
      await this.gitInContainer.commitAll(
        session.containerId,
        repo.name,
        `fleetwide: automated changes from session ${sessionId}`,
      );

      // Push branch
      const remoteUrl = getAuthenticatedRemoteUrl
        ? await getAuthenticatedRemoteUrl(repo.name)
        : repo.remoteUrl ?? `https://github.com/${repo.githubFullName}.git`;

      let pushed = false;
      for (let attempt = 0; attempt < MAX_PUSH_RETRIES; attempt++) {
        const pushResult = await this.gitInContainer.pushBranch(
          session.containerId,
          repo.name,
          branchName,
          remoteUrl,
        );
        if (pushResult.exitCode === 0) {
          pushed = true;
          break;
        }
        logger.warn(
          { repo: repo.name, attempt, stderr: pushResult.stderr },
          'Push failed, retrying...',
        );
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }

      if (!pushed) {
        await this.updateSessionStatus(sessionId, 'failed');
        throw new Error(`Failed to push branch for repo ${repo.name} after ${MAX_PUSH_RETRIES} retries`);
      }

      // Compute diff
      const diff = await this.gitInContainer.getDiffSummary(
        session.containerId,
        repo.name,
        repo.defaultBranch,
      );
      allFiles.push(...diff.files);
      totalInsertions += diff.insertions;
      totalDeletions += diff.deletions;
    }

    const diffSummary: DiffSummary = {
      filesChanged: allFiles.length,
      insertions: totalInsertions,
      deletions: totalDeletions,
      files: allFiles,
    };

    if (!anyChanges) {
      // No changes — complete the session and destroy container
      await this.db
        .update(sessions)
        .set({
          status: 'completed',
          diffSummary,
          completedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));

      await this.destroyContainer(sessionId, 'approved');

      return { branchName, diffSummary, hasChanges: false };
    }

    // Changes pushed — move to preview
    await this.db
      .update(sessions)
      .set({
        status: 'preview',
        branchPushed: true,
        diffSummary,
        lastActivityAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    return { branchName, diffSummary, hasChanges: true };
  }

  async approveSession(
    sessionId: string,
    createPr: (opts: {
      repoFullName: string;
      branchName: string;
      baseBranch: string;
      title: string;
      body: string;
    }) => Promise<{ prUrl: string; prNumber: number }>,
  ): Promise<Array<{ repoName: string; prUrl: string; prNumber: number }>> {
    const session = await this.getSessionRow(sessionId);

    const wsRepos = await this.db
      .select()
      .from(workspaceRepos)
      .where(eq(workspaceRepos.workspaceId, session.workspaceId));
    const repoIds = wsRepos.map((wr) => wr.repositoryId);
    const repos =
      repoIds.length > 0
        ? await this.db.select().from(repositories).where(inArray(repositories.id, repoIds))
        : [];

    const branchName = session.branchName!;
    const results: Array<{ repoName: string; prUrl: string; prNumber: number }> = [];

    for (const repo of repos) {
      if (!repo.githubFullName) continue;

      const { prUrl, prNumber } = await createPr({
        repoFullName: repo.githubFullName,
        branchName,
        baseBranch: repo.defaultBranch,
        title: `fleetwide: ${session.prompt.slice(0, 60)}`,
        body: `Automated changes from Fleetwide session \`${sessionId}\`.\n\nPrompt: ${session.prompt}`,
      });

      results.push({ repoName: repo.name, prUrl, prNumber });
    }

    // Update session with first PR URL (or last — keep it simple)
    const lastPr = results[results.length - 1];
    await this.db
      .update(sessions)
      .set({
        status: 'approved',
        prUrl: lastPr?.prUrl,
        prNumber: lastPr?.prNumber,
        completedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    // Destroy container if still alive
    if (session.containerId) {
      await this.destroyContainer(sessionId, 'approved').catch(() => {});
    }

    return results;
  }

  async rejectSession(
    sessionId: string,
    deleteRemoteBranch?: (repoFullName: string, branchName: string) => Promise<void>,
  ): Promise<void> {
    const session = await this.getSessionRow(sessionId);

    if (session.branchPushed && deleteRemoteBranch) {
      const wsRepos = await this.db
        .select()
        .from(workspaceRepos)
        .where(eq(workspaceRepos.workspaceId, session.workspaceId));
      const repoIds = wsRepos.map((wr) => wr.repositoryId);
      const repos =
        repoIds.length > 0
          ? await this.db.select().from(repositories).where(inArray(repositories.id, repoIds))
          : [];

      for (const repo of repos) {
        if (!repo.githubFullName || !session.branchName) continue;
        await deleteRemoteBranch(repo.githubFullName, session.branchName).catch((err) => {
          logger.warn({ repo: repo.name, err }, 'Failed to delete remote branch');
        });
      }
    }

    await this.db
      .update(sessions)
      .set({
        status: 'rejected',
        completedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    // Destroy container if still alive
    if (session.containerId) {
      await this.destroyContainer(sessionId, 'rejected').catch(() => {});
    }
  }

  async destroyContainer(
    sessionId: string,
    reason: 'user' | 'timeout' | 'approved' | 'rejected',
  ): Promise<void> {
    const session = await this.getSessionRow(sessionId);
    if (!session.containerId) return;

    await this.containerService.stop(session.containerId).catch(() => {});
    await this.containerService.remove(session.containerId).catch(() => {});

    const updates: Record<string, unknown> = {
      containerDestroyedAt: new Date(),
      containerId: null,
    };

    if (reason === 'timeout') {
      updates.status = 'expired';
    }

    await this.db.update(sessions).set(updates).where(eq(sessions.id, sessionId));

    logger.info({ sessionId, reason }, 'Container destroyed');
  }

  async getExpiredPreviewSessions(): Promise<Array<{ id: string }>> {
    const allPreviews = await this.db
      .select({ id: sessions.id, lastActivityAt: sessions.lastActivityAt, idleTimeoutMinutes: sessions.idleTimeoutMinutes })
      .from(sessions)
      .where(eq(sessions.status, 'preview'));

    const now = Date.now();
    return allPreviews.filter((s) => {
      if (!s.lastActivityAt) return false;
      const timeoutMs = s.idleTimeoutMinutes * 60 * 1000;
      return now - s.lastActivityAt.getTime() > timeoutMs;
    });
  }

  async getSession(sessionId: string) {
    return this.getSessionRow(sessionId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async getSessionRow(sessionId: string) {
    const [session] = await this.db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session;
  }

  private async updateSessionStatus(sessionId: string, status: WorkspaceSessionStatus) {
    await this.db.update(sessions).set({ status }).where(eq(sessions.id, sessionId));
    logger.info({ sessionId, status }, 'Session status changed');
  }
}
