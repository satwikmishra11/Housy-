import type { HealthCheckResponse } from '@housy/shared';
import { HealthCheckResponseSchema } from '@housy/shared';
import { HealthRepository, healthRepository } from '../repositories/health.repository.js';
import { config } from '../config/index.js';

export class HealthService {
  constructor(private readonly repo: HealthRepository = healthRepository) {}

  async getHealth(): Promise<HealthCheckResponse> {
    const dbPing = await this.repo.pingDatabase();

    const isHealthy = dbPing.connected;
    const status: HealthCheckResponse['status'] = isHealthy ? 'ok' : 'degraded';

    const rawResponse = {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: config.NODE_ENV,
      version: '1.0.0',
      database: {
        status: dbPing.connected ? ('connected' as const) : ('disconnected' as const),
        latencyMs: dbPing.latencyMs,
        message: dbPing.error,
      },
    };

    // Strict validation against shared Zod schema at domain boundary
    return HealthCheckResponseSchema.parse(rawResponse);
  }
}

export const healthService = new HealthService();

