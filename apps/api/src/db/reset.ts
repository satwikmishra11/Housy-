import { runner } from 'node-pg-migrate';
import path from 'node:path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runSeed } from './seed.js';
import { pool } from './index.js';

const migrationsDir = path.resolve(process.cwd(), 'migrations');

export async function resetDatabase(): Promise<void> {
  logger.info({ db: config.DATABASE_URL.replace(/:[^:@]+@/, ':***@') }, 'Running migrations up...');

  // 1. Run migrations up
  await runner({
    databaseUrl: config.DATABASE_URL,
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
