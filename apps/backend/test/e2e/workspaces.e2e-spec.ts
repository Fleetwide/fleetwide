import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Database } from '@fleetwide/database';
import { createTestApp, type TestMocks } from '../helpers/create-test-app';
import { cleanDatabase } from '../helpers/db';
import { seed } from '../factories';
import { TOKENS } from '../../src/core/injection-tokens';

describe('Workspaces (e2e)', () => {
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
  });

  describe('POST /api/workspaces', () => {
    it('creates workspace with valid data and linked repos', async () => {
      const repo = await seed.repository(db);

      const response = await request(app.getHttpServer())
        .post('/api/workspaces')
        .send({
          name: 'My Workspace',
          image: 'ubuntu:22.04',
          repositoryIds: [repo.id],
        })
        .expect(201);

      expect(response.body.data.name).toBe('My Workspace');
      expect(response.body.data.image).toBe('ubuntu:22.04');
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.repositories).toHaveLength(1);
      expect(response.body.data.repositories[0].id).toBe(repo.id);
    });

    it('returns validation error for missing name', async () => {
      const repo = await seed.repository(db);

      await request(app.getHttpServer())
        .post('/api/workspaces')
        .send({
          image: 'ubuntu:22.04',
          repositoryIds: [repo.id],
        })
        .expect(400);
    });

    it('returns validation error for missing image', async () => {
      const repo = await seed.repository(db);

      await request(app.getHttpServer())
        .post('/api/workspaces')
        .send({
          name: 'My Workspace',
          repositoryIds: [repo.id],
        })
        .expect(400);
    });

    it('returns validation error for empty repositoryIds', async () => {
      await request(app.getHttpServer())
        .post('/api/workspaces')
        .send({
          name: 'My Workspace',
          image: 'ubuntu:22.04',
          repositoryIds: [],
        })
        .expect(400);
    });

    it('returns validation error for non-existent repositoryIds', async () => {
      await request(app.getHttpServer())
        .post('/api/workspaces')
        .send({
          name: 'My Workspace',
          image: 'ubuntu:22.04',
          repositoryIds: ['non-existent'],
        })
        .expect(400);
    });
  });

  describe('GET /api/workspaces', () => {
    it('returns empty array when no workspaces exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    it('returns workspaces with their linked repos', async () => {
      const { workspace, repos } = await seed.workspaceWithRepos(db, 2);

      const response = await request(app.getHttpServer())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(workspace.id);
      expect(response.body.data[0].repositories).toHaveLength(2);
    });
  });

  describe('GET /api/workspaces/:id', () => {
    it('returns workspace with repos by id', async () => {
      const { workspace, repos } = await seed.workspaceWithRepos(db);

      const response = await request(app.getHttpServer())
        .get(`/api/workspaces/${workspace.id}`)
        .expect(200);

      expect(response.body.data.id).toBe(workspace.id);
      expect(response.body.data.repositories).toHaveLength(1);
      expect(response.body.data.repositories[0].id).toBe(repos[0].id);
    });

    it('returns 404 for non-existent workspace', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/workspaces/non-existent')
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/workspaces/:id', () => {
    it('updates workspace fields', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);

      const response = await request(app.getHttpServer())
        .patch(`/api/workspaces/${workspace.id}`)
        .send({ name: 'Updated Name', description: 'New description' })
        .expect(200);

      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.description).toBe('New description');
    });

    it('returns 404 for non-existent workspace', async () => {
      await request(app.getHttpServer())
        .patch('/api/workspaces/non-existent')
        .send({ name: 'Updated' })
        .expect(404);
    });

    it('returns validation error for invalid data', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);

      await request(app.getHttpServer())
        .patch(`/api/workspaces/${workspace.id}`)
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('DELETE /api/workspaces/:id', () => {
    it('deletes workspace and returns success', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);

      await request(app.getHttpServer())
        .delete(`/api/workspaces/${workspace.id}`)
        .expect(200);

      // Verify workspace is gone
      await request(app.getHttpServer())
        .get(`/api/workspaces/${workspace.id}`)
        .expect(404);
    });

    it('returns 404 for non-existent workspace', async () => {
      await request(app.getHttpServer())
        .delete('/api/workspaces/non-existent')
        .expect(404);
    });

    it('calls volume service cleanup', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);

      await request(app.getHttpServer())
        .delete(`/api/workspaces/${workspace.id}`)
        .expect(200);

      expect(mocks.volumeService.removeWorkspaceVolumes).toHaveBeenCalledWith(
        workspace.id,
      );
    });
  });

  describe('POST /api/workspaces/:id/repos', () => {
    it('links repo to workspace', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const extraRepo = await seed.repository(db);

      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspace.id}/repos`)
        .send({ repositoryId: extraRepo.id })
        .expect(201);

      // Verify repo is now linked
      const response = await request(app.getHttpServer())
        .get(`/api/workspaces/${workspace.id}`)
        .expect(200);

      expect(response.body.data.repositories).toHaveLength(2);
    });

    it('returns 404 for non-existent workspace', async () => {
      const repo = await seed.repository(db);

      await request(app.getHttpServer())
        .post('/api/workspaces/non-existent/repos')
        .send({ repositoryId: repo.id })
        .expect(404);
    });

    it('returns 404 for non-existent repo', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);

      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspace.id}/repos`)
        .send({ repositoryId: 'non-existent' })
        .expect(404);
    });
  });

  describe('DELETE /api/workspaces/:id/repos/:repoId', () => {
    it('unlinks repo from workspace', async () => {
      const { workspace, repos } = await seed.workspaceWithRepos(db, 2);

      await request(app.getHttpServer())
        .delete(`/api/workspaces/${workspace.id}/repos/${repos[0].id}`)
        .expect(200);

      // Verify repo is unlinked
      const response = await request(app.getHttpServer())
        .get(`/api/workspaces/${workspace.id}`)
        .expect(200);

      expect(response.body.data.repositories).toHaveLength(1);
      expect(response.body.data.repositories[0].id).toBe(repos[1].id);
    });

    it('returns 404 for non-existent workspace', async () => {
      await request(app.getHttpServer())
        .delete('/api/workspaces/non-existent/repos/some-repo')
        .expect(404);
    });

    it('returns 404 for repo not linked to workspace', async () => {
      const { workspace } = await seed.workspaceWithRepos(db);
      const unlinkedRepo = await seed.repository(db);

      await request(app.getHttpServer())
        .delete(`/api/workspaces/${workspace.id}/repos/${unlinkedRepo.id}`)
        .expect(404);
    });
  });
});
