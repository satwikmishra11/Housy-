import pg from 'pg';
import { config, extractDatabaseName } from '../config/index.js';

const { Pool } = pg;

if (config.NODE_ENV === 'test') {
  const dbName = extractDatabaseName(config.DATABASE_URL);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `FATAL: Test suite refusing to run against non-test database "${dbName}". Database name must end in "_test".`,
    );
  }
}

/**
 * Parses sslmode directly from DATABASE_URL.
 * Supports explicit parameters: sslmode=disable, sslmode=require, sslmode=verify-ca, sslmode=verify-full.
 */
export function parseSslMode(databaseUrl: string, isProduction: boolean, isVercel: boolean): boolean {
  try {
    const parsed = new URL(databaseUrl);
    const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (sslmode === 'disable') return false;
    if (sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full') return true;
  } catch {
    if (databaseUrl.includes('sslmode=disable')) return false;
    if (databaseUrl.includes('sslmode=require')) return true;
  }
  const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  return !isLocalhost && (isProduction || isVercel);
}

const useSsl = parseSslMode(
  config.DATABASE_URL,
  config.NODE_ENV === 'production',
  Boolean(process.env.VERCEL),
);

/**
 * PostgreSQL Connection Pool configuration:
 * - Serverless resilience: when deployed to Vercel (process.env.VERCEL), pool size is capped at max: 3
 *   to avoid exhausting connection pools across concurrent lambda instances.
 * - Always use your cloud provider's transaction pooler connection string (e.g., Supabase port 6543
 *   or Neon pooled connection string with `?sslmode=require`).
 * - connectionTimeoutMillis: 10000 to give serverless cold-starts sufficient time to complete TLS handshakes.
 */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: process.env.VERCEL ? 3 : 30, // Cap at max 3 connections in serverless to prevent pool exhaustion
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

// Guard against uncaught error events emitted on idle clients in serverless/transient environments
pool.on('error', (err) => {
  console.error('Unexpected error on idle database pool client', err);
});

export interface QueryResultRow {
  [column: string]: unknown;
}

export function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  const code = (e.code || '').toUpperCase();
  const msg = (e.message || '').toLowerCase();
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    msg.includes('connection terminated') ||
    msg.includes('connection reset') ||
    msg.includes('timeout') ||
    msg.includes('econnreset')
  );
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<R>> {
  try {
    return await pool.query<R>(text, params);
  } catch (err: unknown) {
    if (isTransientDbError(err)) {
      // Retry transient connection errors once with 500 ms backoff
      await new Promise((resolve) => setTimeout(resolve, 500));
      return await pool.query<R>(text, params);
    }
    throw err;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

