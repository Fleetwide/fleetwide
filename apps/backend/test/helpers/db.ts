import { sql } from 'drizzle-orm';
import type { Database } from '@fleetwide/database';

const TABLES = [
  'sessions',
  'workspace_repos',
  'workspaces',
  'repositories',
  'github_installations',
  'github_app_config',
];

export async function cleanDatabase(db: Database): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`));
}
