import { Factory } from 'fishery';
import type { SessionInsert } from '@fleetwide/database';

export const sessionFactory = Factory.define<SessionInsert>(
  ({ sequence }) => ({
    id: `session-${sequence}`,
    workspaceId: '', // Must be set when building
    prompt: `Test prompt ${sequence}`,
    providerId: 'claude',
    status: 'running' as const,
    containerId: `container-${sequence}`,
    containerName: `container-name-${sequence}`,
  }),
);
