import { query } from '../db/index.js';

export interface DbPingResult {
  connected: boolean;
  latencyMs: number | null;
  error?: string;
}

export class HealthRepository {
  /**
   * Pings the database using a parameterized query to verify connection and compute latency.
   */
  async pingDatabase(): Promise<DbPingResult> {
    const start = performance.now();
    try {
      // Parameterized query check: pass 1 as $1 parameter
      const result = await query<{ alive: number }>('SELECT $1::int AS alive', [1]);
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;

      if (result.rows.length > 0 && result.rows[0]?.alive === 1) {
        return {
          connected: true,
          latencyMs,
        };
      }

      return {
        connected: false,
        latencyMs,
        error: 'Unexpected query result',
      };
    } catch (err: unknown) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      const message = err instanceof Error ? err.message : 'Database ping failed';
      return {
        connected: false,
        latencyMs,
        error: message,
      };
    }
  }
}

export const healthRepository = new HealthRepository();
