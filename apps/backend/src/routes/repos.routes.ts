import { Hono } from 'hono';
import { validate, paginationSchema, repoFilterSchema } from '@fleetwide/core';
import type { Services } from '../services.js';
import type { AppConfig } from '../config.js';

export function repoRoutes(services: Services, _config: AppConfig) {
  const router = new Hono();

  // GET / — list all repos (paginated)
  router.get('/', async (c) => {
    const filterResult = validate(repoFilterSchema, {
      status: c.req.query('status'),
      search: c.req.query('search'),
    });
    const paginationResult = validate(paginationSchema, {
      page: c.req.query('page'),
      limit: c.req.query('limit'),
      sortBy: c.req.query('sortBy'),
      sortOrder: c.req.query('sortOrder'),
    });

    const filter = filterResult.success ? filterResult.data : undefined;
    const pagination = paginationResult.success ? paginationResult.data : undefined;

    const result = await services.repoRegistry.list(filter, pagination);
    return c.json(result);
  });

  // GET /:id — get repo details
  router.get('/:id', async (c) => {
    const id = c.req.param('id');
    const repo = await services.repoRegistry.getById(id);
    if (!repo) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'Repository not found' } },
        404,
      );
    }
    return c.json({ data: repo });
  });

  // DELETE /:id — remove repo from Fleetwide
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const repo = await services.repoRegistry.getById(id);
    if (!repo) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'Repository not found' } },
        404,
      );
    }
    await services.repoRegistry.remove(id);
    return c.json({ success: true });
  });

  // POST /:id/sync — re-sync (pull) a repo
  router.post('/:id/sync', async (c) => {
    const id = c.req.param('id');
    const repo = await services.repoRegistry.getById(id);
    if (!repo) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'Repository not found' } },
        404,
      );
    }

    try {
      await services.repoRegistry.updateStatus(id, 'syncing');
      const result = await services.gitService.pull(repo.path);
      await services.repoRegistry.updateStatus(id, 'synced');
      return c.json({
        data: {
          repositoryId: id,
          status: 'success',
          updated: result.updated,
          commitHash: result.commitHash,
        },
      });
    } catch (error) {
      await services.repoRegistry.updateStatus(id, 'error');
      const message = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          error: { code: 'SYNC_FAILED', message },
        },
        500,
      );
    }
  });

  return router;
}
