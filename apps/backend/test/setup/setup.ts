import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_FILE = resolve(__dirname, '../../.test-db-url');

try {
  const url = readFileSync(URL_FILE, 'utf-8').trim();
  process.env.DATABASE_URL = url;
} catch {
  throw new Error(
    'Could not read test database URL. Make sure global-setup.ts ran successfully.',
  );
}
