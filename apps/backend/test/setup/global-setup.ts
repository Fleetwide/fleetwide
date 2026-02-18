import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_FILE = resolve(__dirname, '../../.test-db-url');
const MIGRATIONS_FOLDER = resolve(__dirname, '../../../../packages/database/drizzle');

let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;

export async function setup() {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('fleetwide_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const connectionUri = container.getConnectionUri();

  // Run Drizzle migrations
  const migrationClient = postgres(connectionUri, { max: 1 });
  const db = drizzle(migrationClient);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await migrationClient.end();

  // Write connection URL for worker processes to read
  writeFileSync(URL_FILE, connectionUri, 'utf-8');
}

export async function teardown() {
  try {
    unlinkSync(URL_FILE);
  } catch {}

  if (container) {
    await container.stop();
  }
}
