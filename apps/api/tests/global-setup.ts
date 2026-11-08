import pg from 'pg';
import { extractDatabaseName } from '../src/config/index.js';
import { resetDatabase } from '../src/db/reset.js';

export async function setup(): Promise<void> {
  const targetUrl =
    process.env.TEST_DATABASE_URL ||
    (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL?.includes('_test')
      ? process.env.DATABASE_URL
      : null) ||
    'postgres://housy_user:housy_password@localhost:5432/housy_test';

  const dbName = extractDatabaseName(targetUrl);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `FATAL: Test database name must end in "_test". Received database name: "${dbName}". Refusing to run tests against non-test database.`,
    );
  }

  const pool = new pg.Pool({
    connectionString: targetUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    const tableRes = await pool.query(
      "SELECT to_regclass('public.projects') AS table_exists",
    );
    const tableExists = Boolean(tableRes.rows[0]?.table_exists);

    let isEmpty = false;
    if (!tableExists) {
      isEmpty = true;
    } else {
      const countRes = await pool.query<{ count: string }>('SELECT count(*)::int AS count FROM projects');
      const count = Number(countRes.rows[0]?.count ?? 0);
      if (count === 0) {
        isEmpty = true;
      }
    }

    if (isEmpty) {
      console.info(`[vitest globalSetup] Test database "${dbName}" is empty. Running migrations and seed...`);
      await resetDatabase(targetUrl);
      console.info(`[vitest globalSetup] Test database "${dbName}" seeded successfully.`);
    }
  } finally {
    await pool.end();
  }
}

export default setup;
