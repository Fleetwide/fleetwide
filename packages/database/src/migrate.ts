import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './connection.js';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://fleetwide:fleetwide_dev@localhost:5432/fleetwide';

const db = createDatabase(databaseUrl);

await migrate(db, { migrationsFolder: './drizzle' });

console.log('Migrations complete.');
process.exit(0);
