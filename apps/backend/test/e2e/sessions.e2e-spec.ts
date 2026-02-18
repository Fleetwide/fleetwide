import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Database } from '@fleetwide/database';
import { createTestApp, type TestMocks } from '../helpers/create-test-app';
import { cleanDatabase } from '../helpers/db';
import { seed } from '../factories';
import { TOKENS } from '../../src/core/injection-tokens';

describe('Sessions (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let mocks: TestMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
    db = app.get(TOKENS.DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    vi.clearAllMocks();
  });

  describe('POST /api/sessions', () => {
    it('creates session with valid workspace', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);

      const response = await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workspaceId: workspace.id,
          prompt: 'Fix the bug in auth module',
        })
        .expect(201);

      expect(response.body.data.sessionId).toBeDefined();
      expect(response.body.data.containerId).toBe('mock-container-id');
      expect(response.body.data.status).toBe('running');
      expect(mocks.sessionOrchestrator.startSession).toHaveBeenCalled();
    });

    it('returns validation error for missing prompt', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);

      await request(app.getHttpServer())
        .post('/api/sessions')
        .send({ workspaceId: workspace.id })
        .expect(400);
    });

    it('returns 404 for non-existent workspace', async () => {
      await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workspaceId: 'non-existent',
          prompt: 'Do something',
        })
        .expect(404);
    });

    it('returns validation error for non-active workspace', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      // Update workspace to archived status directly in DB
      const { workspaces } = await import('@fleetwide/database');
      const { eq } = await import('drizzle-orm');
      await db
        .update(workspaces)
        .set({ status: 'archived' })
        .where(eq(workspaces.id, workspace.id));

      await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workspaceId: workspace.id,
          prompt: 'Do something',
        })
        .expect(400);
    });
  });

  describe('GET /api/sessions', () => {
    it('returns all sessions', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      await seed.session(db, { workspaceId: workspace.id });
      await seed.session(db, { workspaceId: workspace.id });

      const response = await request(app.getHttpServer())
        .get('/api/sessions')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('filters by workspaceId', async () => {
      const { workspace: ws1 } = await seed.workspaceWithRepos(db);
      const { workspace: ws2 } = await seed.workspaceWithRepos(db);
      await seed.session(db, { workspaceId: ws1.id });
      await seed.session(db, { workspaceId: ws2.id });

      const response = await request(app.getHttpServer())
        .get(`/api/sessions?workspaceId=${ws1.id}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].workspaceId).toBe(ws1.id);
    });

    it('filters by status', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      await seed.session(db, { workspaceId: workspace.id, status: 'running' });
      await seed.session(db, {
        workspaceId: workspace.id,
        status: 'completed',
      });

      const response = await request(app.getHttpServer())
        .get('/api/sessions?status=running')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('running');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('returns session with containerAlive status', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, { workspaceId: workspace.id });

      const response = await request(app.getHttpServer())
        .get(`/api/sessions/${session.id}`)
        .expect(200);

      expect(response.body.data.id).toBe(session.id);
      expect(response.body.data.containerAlive).toBe(true);
      expect(mocks.containerService.getStatus).toHaveBeenCalled();
    });

    it('returns 404 for non-existent session', async () => {
      await request(app.getHttpServer())
        .get('/api/sessions/non-existent')
        .expect(404);
    });
  });

  describe('POST /api/sessions/:id/exec', () => {
    it('executes command in session', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, { workspaceId: workspace.id });

      const response = await request(app.getHttpServer())
        .post(`/api/sessions/${session.id}/exec`)
        .send({ cmd: ['ls', '-la'] })
        .expect(200);

      expect(mocks.sessionOrchestrator.exec).toHaveBeenCalledWith(
        session.id,
        ['ls', '-la'],
      );
    });

    it('returns 404 for non-existent session', async () => {
      await request(app.getHttpServer())
        .post('/api/sessions/non-existent/exec')
        .send({ cmd: ['ls'] })
        .expect(404);
    });

    it('returns validation error for empty cmd array', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, { workspaceId: workspace.id });

      await request(app.getHttpServer())
        .post(`/api/sessions/${session.id}/exec`)
        .send({ cmd: [] })
        .expect(400);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('destroys session', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, { workspaceId: workspace.id });

      await request(app.getHttpServer())
        .delete(`/api/sessions/${session.id}`)
        .expect(200);

      expect(mocks.sessionOrchestrator.destroyContainer).toHaveBeenCalledWith(
        session.id,
        'user',
      );
    });

    it('returns 404 for non-existent session', async () => {
      await request(app.getHttpServer())
        .delete('/api/sessions/non-existent')
        .expect(404);
    });
  });

  describe('GET /api/sessions/:id/messages', () => {
    it('returns messages array', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        messages: [{ role: 'user', content: 'Hello' }] as any,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/sessions/${session.id}/messages`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].content).toBe('Hello');
    });

    it('returns 404 for non-existent session', async () => {
      await request(app.getHttpServer())
        .get('/api/sessions/non-existent/messages')
        .expect(404);
    });
  });

  describe('GET /api/sessions/:id/logs', () => {
    it('returns setup logs', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        setupLogs: [{ step: 'clone', status: 'done' }] as any,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/sessions/${session.id}/logs`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    it('returns 404 for non-existent session', async () => {
      await request(app.getHttpServer())
        .get('/api/sessions/non-existent/logs')
        .expect(404);
    });
  });

  describe('GET /api/sessions/:id/diff', () => {
    it('returns diff summary', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        diffSummary: { filesChanged: 3, insertions: 10, deletions: 2 } as any,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/sessions/${session.id}/diff`)
        .expect(200);

      expect(response.body.data.filesChanged).toBe(3);
    });

    it('returns 404 for non-existent session', async () => {
      await request(app.getHttpServer())
        .get('/api/sessions/non-existent/diff')
        .expect(404);
    });
  });

  describe('GET /api/sessions/:id/branch', () => {
    it('returns branch info when branch is pushed', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        branchName: 'feature/test-branch',
        branchPushed: true,
        prUrl: 'https://github.com/org/repo/pull/1',
        prNumber: 1,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/sessions/${session.id}/branch`)
        .expect(200);

      expect(response.body.data.branchName).toBe('feature/test-branch');
      expect(response.body.data.branchPushed).toBe(true);
      expect(response.body.data.prUrl).toBe(
        'https://github.com/org/repo/pull/1',
      );
      expect(response.body.data.checkoutCommand).toContain(
        'feature/test-branch',
      );
    });

    it('returns null branch when no branch exists', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, { workspaceId: workspace.id });

      const response = await request(app.getHttpServer())
        .get(`/api/sessions/${session.id}/branch`)
        .expect(200);

      expect(response.body.data.branchName).toBeNull();
      expect(response.body.data.branchPushed).toBe(false);
    });

    it('returns 404 for non-existent session', async () => {
      await request(app.getHttpServer())
        .get('/api/sessions/non-existent/branch')
        .expect(404);
    });
  });

  describe('POST /api/sessions/:id/approve', () => {
    it('approves session with pushed branch', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        status: 'preview',
        branchPushed: true,
        branchName: 'feature/test',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/sessions/${session.id}/approve`)
        .expect(200);

      expect(response.body.data.approved).toBe(true);
      expect(mocks.sessionOrchestrator.approveSession).toHaveBeenCalled();
    });

    it('returns validation error when no branch pushed', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        status: 'preview',
        branchPushed: false,
      });

      await request(app.getHttpServer())
        .post(`/api/sessions/${session.id}/approve`)
        .expect(400);
    });

    it('returns validation error for invalid session status', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        status: 'running',
        branchPushed: true,
      });

      await request(app.getHttpServer())
        .post(`/api/sessions/${session.id}/approve`)
        .expect(400);
    });
  });

  describe('POST /api/sessions/:id/reject', () => {
    it('rejects session', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        status: 'preview',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/sessions/${session.id}/reject`)
        .expect(200);

      expect(response.body.data.rejected).toBe(true);
      expect(mocks.sessionOrchestrator.rejectSession).toHaveBeenCalled();
    });

    it('returns validation error for invalid session status', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const session = await seed.session(db, {
        workspaceId: workspace.id,
        status: 'running',
      });

      await request(app.getHttpServer())
        .post(`/api/sessions/${session.id}/reject`)
        .expect(400);
    });
  });
});
