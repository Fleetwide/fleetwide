import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/error-handler.js';
import { healthRoutes } from './routes/health.routes.js';
import { githubRoutes } from './routes/github.routes.js';
import { repoRoutes } from './routes/repos.routes.js';
import type { Services } from './services.js';
import type { AppConfig } from './config.js';

export function createApp(services: Services, config: AppConfig) {
  const app = new Hono();

  // Middleware
  app.use('*', cors({ origin: config.frontendUrl }));
  app.use('*', logger());
  app.onError(errorHandler);

  // Routes
  app.route('/api', healthRoutes());
  app.route('/api/github', githubRoutes(services, config));
  app.route('/api/repos', repoRoutes(services, config));

  return app;
}
