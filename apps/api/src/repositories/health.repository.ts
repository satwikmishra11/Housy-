import fs from 'node:fs';
import path from 'node:path';
import { query } from '../db/index.js';
import type { DatabaseHealthReason, DatabaseHealthStatus, DatabaseSchemaStatus } from '@housy/shared';

export interface DbCheckResult {
  status: DatabaseHealthStatus;
  schema: DatabaseSchemaStatus;
  reason: DatabaseHealthReason | null;
  latencyMs: number | null;
  rawError?: string; // Captured for server-side logging ONLY; never sent to clients!
}

export function getExpectedLatestMigration(): string | null {
  const candidateDirs = [
    path.resolve(process.cwd(), 'migrations'),
    path.resolve(process.cwd(), 'apps/api/migrations'),
    path.resolve(process.cwd(), '../migrations'),
    path.resolve(process.cwd(), '../../migrations'),
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.cjs') || f.endsWith('.js') || f.endsWith('.ts'))
        .sort();
      if (files.length > 0) {
        return files[files.length - 1]!.replace(/\.[^.]+$/, '');
      }
    }
  }
  return '010_create_lead_notes';
}

export function classifyDbError(err: unknown): {
  reason: DatabaseHealthReason;
  rawError: string;
} {
  const e = err as { code?: string; message?: string };
  const code = (e?.code || '').toUpperCase();
  const msg = (e?.message || '').toLowerCase();
  const rawError = e?.message || String(err);

  // Authentication errors: 28P01 (invalid_password), 28000
  if (
    code === '28P01' ||
    code === '28000' ||
    msg.includes('password authentication failed') ||
    msg.includes('authentication failed')
  ) {
    return { reason: 'auth_failed', rawError };
  }

  // Network unreachability: ECONNREFUSED, ENOTFOUND, EHOSTUNREACH
  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    msg.includes('econnrefused') ||
    msg.includes('getaddrinfo enotfound') ||
    msg.includes('ehostunreach')
  ) {
    return { reason: 'unreachable', rawError };
  }

  // Timeouts: ETIMEDOUT, 57P01, timeout
  if (
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    msg.includes('timeout') ||
    msg.includes('connection terminated')
  ) {
    return { reason: 'timeout', rawError };
  }

  // SSL errors
  if (
    code.includes('SSL') ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    msg.includes('ssl') ||
    msg.includes('certificate')
  ) {
    return { reason: 'ssl', rawError };
  }

  // Pool exhaustion: 53300, max clients
  if (
    code === '53300' ||
    msg.includes('too many clients') ||
    msg.includes('max clients') ||
    msg.includes('pool')
  ) {
    return { reason: 'pool_exhausted', rawError };
  }

  return { reason: 'unknown', rawError };
}

export class HealthRepository {
  /**
   * Pings the database and verifies that schema is migrated (users table exists and latest migration applied).
   */
  async checkDatabase(): Promise<DbCheckResult> {
    const start = performance.now();
    try {
      // 1. Connection check
      const aliveRes = await query<{ alive: number }>('SELECT $1::int AS alive', [1]);
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;

      if (!aliveRes.rows.length || aliveRes.rows[0]?.alive !== 1) {
        return {
          status: 'down',
          schema: 'missing',
          reason: 'unreachable',
          latencyMs,
          rawError: 'Unexpected response from ping query',
        };
      }

      // 2. Schema check: verify `users` table exists AND `pgmigrations` table exists
      const schemaRes = await query<{
        users_table: string | null;
        migrations_table: string | null;
      }>(
        "SELECT to_regclass('public.users')::text AS users_table, to_regclass('public.pgmigrations')::text AS migrations_table",
      );
      const row = schemaRes.rows[0];
      const hasUsers = Boolean(row?.users_table);
      const hasMigrations = Boolean(row?.migrations_table);

      if (!hasUsers || !hasMigrations) {
        return {
          status: 'degraded',
          schema: 'missing',
          reason: 'schema_missing',
          latencyMs,
          rawError: !hasUsers ? 'users table is missing' : 'pgmigrations table is missing',
        };
      }

      // 3. Check latest migration in pgmigrations
      const latestMigRes = await query<{ name: string }>(
        'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1',
      );
      const appliedLatest = latestMigRes.rows[0]?.name;
      const expectedLatest = getExpectedLatestMigration();

      if (!appliedLatest) {
        return {
          status: 'degraded',
          schema: 'missing',
          reason: 'schema_missing',
          latencyMs,
          rawError: 'pgmigrations table is empty',
        };
      }

      if (expectedLatest && appliedLatest !== expectedLatest) {
        return {
          status: 'degraded',
          schema: 'outdated',
          reason: 'schema_missing',
          latencyMs,
          rawError: `pgmigrations latest is "${appliedLatest}", expected "${expectedLatest}"`,
        };
      }

      return {
        status: 'ok',
        schema: 'ok',
        reason: null,
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      const { reason, rawError } = classifyDbError(err);
      return {
        status: 'down',
        schema: 'missing',
        reason,
        latencyMs,
        rawError,
      };
    }
  }

  /**
   * Backwards-compatible pingDatabase method.
   */
  async pingDatabase(): Promise<{ connected: boolean; latencyMs: number | null; error?: string }> {
    const res = await this.checkDatabase();
    return {
      connected: res.status === 'ok' || res.status === 'degraded',
      latencyMs: res.latencyMs,
      error: res.rawError,
    };
  }
}

export const healthRepository = new HealthRepository();

