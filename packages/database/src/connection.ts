import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });
  return db;
}

export function createDatabaseClient(connectionString: string) {
  return postgres(connectionString);
}

export type Database = ReturnType<typeof createDatabase>;
