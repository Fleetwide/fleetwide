import { Hono } from 'hono';
import type { Services } from '../services.js';
import type { AppConfig } from '../config.js';

export function githubRoutes(services: Services, config: AppConfig) {
  const router = new Hono();

  // GET /status — check if GitHub App is configured
  router.get('/status', async (c) => {
    const storedConfig = await services.githubAppService.getStoredConfig();
    return c.json({
      configured: !!storedConfig,
      appSlug: storedConfig?.appSlug ?? null,
      htmlUrl: storedConfig?.htmlUrl ?? null,
      installationsCount: storedConfig
        ? await services.githubAppService.getInstallationsCount()
        : 0,
    });
  });

  // GET /manifest/start — generate manifest and return the GitHub URL
  router.get('/manifest/start', (c) => {
    const callbackUrl = `${getBaseUrl(c, config)}/api/github/manifest/callback`;
    const url = services.githubAppService.getManifestCreationUrl(callbackUrl);
    return c.json({ url });
  });

  // GET /manifest/callback — GitHub redirects here after App creation
  router.get('/manifest/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) {
      return c.json({ error: { code: 'MISSING_CODE', message: 'Missing code parameter' } }, 400);
    }

    await services.githubAppService.exchangeManifestCode(code);
    return c.redirect(`${config.frontendUrl}/settings/github?setup=complete`);
  });

  // DELETE /config — disconnect GitHub App
  router.delete('/config', async (c) => {
    await services.githubAppService.disconnect();
    return c.json({ success: true });
  });

  // GET /install-url — get URL to install the app on an org
  router.get('/install-url', async (c) => {
    const url = await services.githubAppService.getInstallUrl();
    return c.json({ url });
  });

  // GET /installations — list all installations
  router.get('/installations', async (c) => {
    const installations = await services.githubAppService.getInstallations();
    return c.json({ installations });
  });

  // GET /installations/callback — GitHub redirects here after app installation
  router.get('/installations/callback', async (c) => {
    const installationId = Number(c.req.query('installation_id'));
    if (!installationId) {
      return c.json(
        { error: { code: 'MISSING_INSTALLATION_ID', message: 'Missing installation_id' } },
        400,
      );
    }

    await services.githubAppService.initialize();
    await services.githubAppService.handleInstallationCallback(installationId);
    return c.redirect(`${config.frontendUrl}/import`);
  });

  // DELETE /installations/:id — remove an installation
  router.delete('/installations/:id', async (c) => {
    const id = c.req.param('id');
    await services.githubAppService.removeInstallation(id);
    return c.json({ success: true });
  });

  // GET /repos — discover repos across all installations
  router.get('/repos', async (c) => {
    await services.githubAppService.initialize();
    const repos = await services.githubDiscovery.discoverAllRepos();
    return c.json({ repos });
  });

  // GET /repos/:installationId — discover repos for a specific installation
  router.get('/repos/:installationId', async (c) => {
    const installationId = Number(c.req.param('installationId'));
    await services.githubAppService.initialize();
    const repos = await services.githubDiscovery.discoverRepos(installationId);
    return c.json({ repos });
  });

  // POST /repos/import — import selected repos
  router.post('/repos/import', async (c) => {
    const body = await c.req.json();
    await services.githubAppService.initialize();
    const results = await services.githubImport.importRepos({
      installationId: body.installationId,
      repos: body.repos,
      basePath: config.reposBasePath,
    });
    return c.json({ results }, 201);
  });

  return router;
}

function getBaseUrl(c: { req: { header: (name: string) => string | undefined } }, config: AppConfig): string {
  const forwarded = c.req.header('x-forwarded-host');
  if (forwarded) {
    const proto = c.req.header('x-forwarded-proto') ?? 'https';
    return `${proto}://${forwarded}`;
  }
  return `http://localhost:${config.port}`;
}
