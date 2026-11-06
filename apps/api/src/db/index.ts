import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

const isLocalhost =
  config.DATABASE_URL.includes('localhost') ||
  config.DATABASE_URL.includes('127.0.0.1');

const useSsl =
  !isLocalhost &&
  (config.NODE_ENV === 'production' || !!process.env.VERCEL || config.DATABASE_URL.includes('sslmode=require'));

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: process.env.VERCEL ? 10 : 30, // Limit pool size in serverless to prevent connection exhaustion
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export interface QueryResultRow {
  [column: string]: unknown;
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params);
}

export async function closePool(): Promise<void> {
  await pool.end();
}

