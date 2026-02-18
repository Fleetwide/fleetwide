import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('returns 200 with status ok and timestamp', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('returns a valid ISO date string as timestamp', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      const date = new Date(response.body.timestamp);
      expect(date.toISOString()).toBe(response.body.timestamp);
    });
  });
});
