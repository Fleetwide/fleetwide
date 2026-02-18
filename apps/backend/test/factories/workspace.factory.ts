import { Factory } from 'fishery';
import type { WorkspaceInsert } from '@fleetwide/database';

export const workspaceFactory = Factory.define<WorkspaceInsert>(
  ({ sequence }) => ({
    id: `ws-${sequence}`,
    name: `Test Workspace ${sequence}`,
    image: 'ubuntu:22.04',
    status: 'active' as const,
  }),
);
