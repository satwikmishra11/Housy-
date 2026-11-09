import { runner } from 'node-pg-migrate';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config/index.js';
import { runSeed } from './seed.js';
import { closePool, sanitizeConnectionUrl } from './index.js';

export interface SetupProdOptions {
  databaseUrl?: string;
  demoMode?: boolean;
}

export interface SetupProdResult {
  migrationsCount: number;
  migrationsApplied: string[];
  seeded: boolean;
  message: string;
}

export function resolveMigrationsDir(): string {
  const candidateDirs = [
    path.resolve(process.cwd(), 'migrations'),
    path.resolve(process.cwd(), 'apps/api/migrations'),
    path.resolve(process.cwd(), '../migrations'),
    path.resolve(process.cwd(), '../../migrations'),
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return path.resolve(process.cwd(), 'apps/api/migrations');
}

export async function setupProdDatabase(options?: SetupProdOptions): Promise<SetupProdResult> {
  const targetUrl =
    options?.databaseUrl ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    config.DATABASE_URL;
  const isDemoMode =
    options?.demoMode !== undefined
      ? options.demoMode
      : process.env.DEMO_MODE === 'true' || config.DEMO_MODE === true;

  const sanitizedDb = targetUrl.replace(/:[^:@]+@/, ':***@');
  console.info(`[db:setup:prod] Target Database: ${sanitizedDb}`);

  // 1. Run migrations up
  const migrationsDir = resolveMigrationsDir();
  console.info(`[db:setup:prod] Applying migrations from: ${migrationsDir}`);

  const isLocal = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
  const sanitizedTargetUrl = sanitizeConnectionUrl(targetUrl, !isLocal);

  const runnerDbConfig = !isLocal
    ? {
        connectionString: sanitizedTargetUrl,
        ssl: { rejectUnauthorized: false },
      }
    : sanitizedTargetUrl;

  const appliedList = await runner({
    databaseUrl: runnerDbConfig,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    verbose: false,
    logger: {
      info: (msg: string) => console.info(`[db:setup:prod] ${msg}`),
      warn: (msg: string) => console.warn(`[db:setup:prod] WARN: ${msg}`),
      error: (msg: string) => console.error(`[db:setup:prod] ERROR: ${msg}`),
    },
  });

  const appliedNames = (appliedList || []).map((m) => m.name);
  if (appliedNames.length > 0) {
    console.info(`[db:setup:prod] Applied ${appliedNames.length} migration(s):`);
    for (const name of appliedNames) {
      console.info(`  - ${name}`);
    }
  } else {
    console.info('[db:setup:prod] Schema is up to date. 0 new migrations applied.');
  }

  // 2. Conditional seeding based on DEMO_MODE
  let seeded = false;
  if (isDemoMode) {
    console.info('[db:setup:prod] DEMO_MODE is true: Seeding demo staff accounts and reference dataset...');
    await runSeed();
    seeded = true;
    console.info('[db:setup:prod] Seed complete: Demo staff accounts and sample projects seeded.');
  } else {
    console.info('[db:setup:prod] DEMO_MODE is not true: Skipping demo accounts seed to safeguard production data.');
  }

  const summary = `Database setup complete: ${appliedNames.length} migration(s) applied, demo accounts ${seeded ? 'seeded' : 'skipped'}.`;
  console.info(`[db:setup:prod] ${summary}`);

  return {
    migrationsCount: appliedNames.length,
    migrationsApplied: appliedNames,
    seeded,
    message: summary,
  };
}

// Direct CLI invocation
if (
  process.argv[1]?.endsWith('setup-prod.ts') ||
  process.argv[1]?.endsWith('setup-prod.js') ||
  process.argv[1]?.includes('setup-prod')
) {
  setupProdDatabase()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[db:setup:prod] FATAL: Database setup failed:', err);
      await closePool();
      process.exit(1);
    });
}
