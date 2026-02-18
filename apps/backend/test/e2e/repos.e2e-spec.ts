import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Database } from '@fleetwide/database';
import { createTestApp, type TestMocks } from '../helpers/create-test-app';
import { cleanDatabase } from '../helpers/db';
import { seed } from '../factories';
import { TOKENS } from '../../src/core/injection-tokens';

describe('Repos (e2e)', () => {
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

  describe('GET /api/repos', () => {
    it('returns empty list when no repos exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/repos')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('returns repos with pagination defaults', async () => {
      await seed.repository(db);
      await seed.repository(db);

      const response = await request(app.getHttpServer())
        .get('/api/repos')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(20);
    });

    it('filters by status', async () => {
      await seed.repository(db, { status: 'synced' });
      await seed.repository(db, { status: 'error' });

      const response = await request(app.getHttpServer())
        .get('/api/repos?status=synced')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('synced');
    });

    it('filters by search term', async () => {
      await seed.repository(db, { name: 'alpha-service' });
      await seed.repository(db, { name: 'beta-service' });

      const response = await request(app.getHttpServer())
        .get('/api/repos?search=alpha')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('alpha-service');
    });

    it('respects pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await seed.repository(db);
      }

      const response = await request(app.getHttpServer())
        .get('/api/repos?page=2&limit=2')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.page).toBe(2);
      expect(response.body.limit).toBe(2);
      expect(response.body.total).toBe(5);
      expect(response.body.totalPages).toBe(3);
    });
  });

  describe('GET /api/repos/:id', () => {
    it('returns repo by id', async () => {
      const repo = await seed.repository(db, { name: 'my-repo' });

      const response = await request(app.getHttpServer())
        .get(`/api/repos/${repo.id}`)
        .expect(200);

      expect(response.body.data.id).toBe(repo.id);
      expect(response.body.data.name).toBe('my-repo');
    });

    it('returns 404 for non-existent repo', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/repos/non-existent')
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/repos/:id', () => {
    it('deletes repo and returns success', async () => {
      const repo = await seed.repository(db);

      await request(app.getHttpServer())
        .delete(`/api/repos/${repo.id}`)
        .expect(200);

      // Verify repo is gone
      await request(app.getHttpServer())
        .get(`/api/repos/${repo.id}`)
        .expect(404);
    });

    it('returns 404 for non-existent repo', async () => {
      await request(app.getHttpServer())
        .delete('/api/repos/non-existent')
        .expect(404);
    });
  });

  describe('POST /api/repos/:id/sync', () => {
    it('syncs repo and returns result', async () => {
      const repo = await seed.repository(db);

      const response = await request(app.getHttpServer())
        .post(`/api/repos/${repo.id}/sync`)
        .expect(200);

      expect(response.body.data.repositoryId).toBe(repo.id);
      expect(response.body.data.status).toBe('success');
      expect(mocks.gitService.pull).toHaveBeenCalled();
    });

    it('returns 404 for non-existent repo', async () => {
      await request(app.getHttpServer())
        .post('/api/repos/non-existent/sync')
        .expect(404);
    });
  });
});
