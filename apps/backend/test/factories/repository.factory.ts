import { Factory } from 'fishery';
import type { RepositoryInsert } from '@fleetwide/database';

export const repositoryFactory = Factory.define<RepositoryInsert>(
  ({ sequence }) => ({
    id: `repo-${sequence}`,
    name: `test-repo-${sequence}`,
    path: `/repos/test-repo-${sequence}`,
    source: 'manual_url' as const,
    status: 'synced' as const,
    defaultBranch: 'main',
  }),
);
