import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, type TestMocks } from '../helpers/create-test-app';

describe('GitHub (e2e)', () => {
  let app: INestApplication;
  let mocks: TestMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/github/status', () => {
    it('returns unconfigured status when no config exists', async () => {
      mocks.githubAppService.getStoredConfig.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/api/github/status')
        .expect(200);

      expect(response.body.configured).toBe(false);
      expect(response.body.appSlug).toBeNull();
      expect(response.body.installationsCount).toBe(0);
    });

    it('returns configured status with app details', async () => {
      mocks.githubAppService.getStoredConfig.mockResolvedValue({
        appSlug: 'my-app',
        htmlUrl: 'https://github.com/apps/my-app',
      });
      mocks.githubAppService.getInstallationsCount.mockResolvedValue(3);

      const response = await request(app.getHttpServer())
        .get('/api/github/status')
        .expect(200);

      expect(response.body.configured).toBe(true);
      expect(response.body.appSlug).toBe('my-app');
      expect(response.body.installationsCount).toBe(3);
    });
  });

  describe('GET /api/github/manifest/start', () => {
    it('returns manifest creation URL', async () => {
      mocks.githubAppService.getManifestCreationUrl.mockReturnValue(
        'https://github.com/settings/apps/new?manifest=test',
      );

      const response = await request(app.getHttpServer())
        .get('/api/github/manifest/start')
        .expect(200);

      expect(response.body.url).toContain('github.com');
      expect(mocks.githubAppService.getManifestCreationUrl).toHaveBeenCalled();
    });
  });

  describe('GET /api/github/manifest/callback', () => {
    it('exchanges code and redirects to frontend', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/github/manifest/callback?code=test-code')
        .expect(302);

      expect(response.headers.location).toContain('/settings/github');
      expect(
        mocks.githubAppService.exchangeManifestCode,
      ).toHaveBeenCalledWith('test-code');
    });

    it('returns 400 when code is missing', async () => {
      await request(app.getHttpServer())
        .get('/api/github/manifest/callback')
        .expect(400);
    });
  });

  describe('DELETE /api/github/config', () => {
    it('disconnects GitHub app', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/github/config')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mocks.githubAppService.disconnect).toHaveBeenCalled();
    });
  });

  describe('GET /api/github/install-url', () => {
    it('returns installation URL', async () => {
      mocks.githubAppService.getInstallUrl.mockResolvedValue(
        'https://github.com/apps/test/installations/new',
      );

      const response = await request(app.getHttpServer())
        .get('/api/github/install-url')
        .expect(200);

      expect(response.body.url).toContain('installations/new');
    });
  });

  describe('GET /api/github/installations', () => {
    it('returns list of installations', async () => {
      const mockInstallations = [
        { id: '1', accountLogin: 'org1' },
        { id: '2', accountLogin: 'org2' },
      ];
      mocks.githubAppService.getInstallations.mockResolvedValue(
        mockInstallations,
      );

      const response = await request(app.getHttpServer())
        .get('/api/github/installations')
        .expect(200);

      expect(response.body.installations).toHaveLength(2);
    });
  });

  describe('GET /api/github/installations/callback', () => {
    it('handles installation callback and redirects', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/github/installations/callback?installation_id=12345')
        .expect(302);

      expect(response.headers.location).toContain('/import');
      expect(mocks.githubAppService.initialize).toHaveBeenCalled();
      expect(
        mocks.githubAppService.handleInstallationCallback,
      ).toHaveBeenCalledWith(12345);
    });

    it('returns 400 for missing installation_id', async () => {
      await request(app.getHttpServer())
        .get('/api/github/installations/callback')
        .expect(400);
    });
  });

  describe('DELETE /api/github/installations/:id', () => {
    it('removes installation', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/github/installations/inst-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(
        mocks.githubAppService.removeInstallation,
      ).toHaveBeenCalledWith('inst-1');
    });
  });

  describe('GET /api/github/repos', () => {
    it('returns discovered repos from all installations', async () => {
      const mockRepos = [
        { name: 'repo-1', fullName: 'org/repo-1' },
        { name: 'repo-2', fullName: 'org/repo-2' },
      ];
      mocks.githubDiscoveryService.discoverAllRepos.mockResolvedValue(
        mockRepos,
      );

      const response = await request(app.getHttpServer())
        .get('/api/github/repos')
        .expect(200);

      expect(response.body.repos).toHaveLength(2);
      expect(mocks.githubAppService.initialize).toHaveBeenCalled();
    });
  });

  describe('GET /api/github/repos/:installationId', () => {
    it('returns repos for specific installation', async () => {
      const mockRepos = [{ name: 'repo-1', fullName: 'org/repo-1' }];
      mocks.githubDiscoveryService.discoverRepos.mockResolvedValue(mockRepos);

      const response = await request(app.getHttpServer())
        .get('/api/github/repos/12345')
        .expect(200);

      expect(response.body.repos).toHaveLength(1);
      expect(
        mocks.githubDiscoveryService.discoverRepos,
      ).toHaveBeenCalledWith(12345);
    });
  });

  describe('POST /api/github/repos/import', () => {
    it('imports repos', async () => {
      mocks.githubImportService.importRepos.mockResolvedValue([
        { name: 'repo-1', status: 'imported' },
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/github/repos/import')
        .send({
          installationId: 12345,
          repos: [{ name: 'repo-1', fullName: 'org/repo-1' }],
        })
        .expect(201);

      expect(response.body.results).toHaveLength(1);
      expect(mocks.githubAppService.initialize).toHaveBeenCalled();
    });
  });
});
