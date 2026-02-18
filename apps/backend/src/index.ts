import { serve } from '@hono/node-server';
import { createLogger } from '@fleetwide/core';
import { loadConfig } from './config.js';
import { createServices } from './services.js';
import { createApp } from './app.js';

const config = loadConfig();
const logger = createLogger({ name: 'backend', level: config.logLevel as 'info' });

const services = createServices(config);
const app = createApp(services, config);

serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    logger.info(`Server running at http://${info.address}:${info.port}`);
  },
);
