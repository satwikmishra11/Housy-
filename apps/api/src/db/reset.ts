import { runner } from 'node-pg-migrate';
import path from 'node:path';
import fs from 'node:fs';
import { config, extractDatabaseName } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runSeed } from './seed.js';
import { pool } from './index.js';

const migrationsDir = fs.existsSync(path.resolve(process.cwd(), 'migrations'))
  ? path.resolve(process.cwd(), 'migrations')
  : path.resolve(process.cwd(), 'apps/api/migrations');

export async function resetDatabase(customDatabaseUrl?: string): Promise<void> {
  const isTest = config.NODE_ENV === 'test' || process.env.NODE_ENV === 'test';
  const targetUrl =
    customDatabaseUrl ||
    (isTest
      ? (process.env.TEST_DATABASE_URL || config.TEST_DATABASE_URL || config.DATABASE_URL)
      : config.DATABASE_URL);

  const dbName = extractDatabaseName(targetUrl);
  if (isTest && !dbName.endsWith('_test')) {
    throw new Error(
      `FATAL: Refusing to reset test database "${dbName}". Database name must end in "_test".`,
    );
  }

  logger.info({ db: targetUrl.replace(/:[^:@]+@/, ':***@') }, 'Running migrations up...');

  // 1. Run migrations up
  await runner({
    databaseUrl: targetUrl,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    verbose: false,
    logger: {
      info: (msg: string) => logger.debug(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
    },
  });

  logger.info('Migrations applied. Running seed...');

  // 2. Run seed
  await runSeed();
  logger.info('Database reset and seed completed successfully!');
}

if (
  process.argv[1]?.endsWith('reset.ts') ||
  process.argv[1]?.endsWith('reset.js') ||
  process.argv[1]?.includes('reset')
) {
  resetDatabase()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error({ err }, 'Database reset failed');
      await pool.end();
      process.exit(1);
    });
}
