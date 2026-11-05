import { describe, it, expect } from 'vitest';
import { HealthCheckResponseSchema, DatabaseHealthSchema } from '../src/health.js';
import { ApiErrorResponseSchema } from '../src/errors.js';

describe('Shared Schemas', () => {
  it('validates healthy health-check payload', () => {
    const payload = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 120.5,
      environment: 'development',
      version: '1.0.0',
      database: {
        status: 'connected',
        latencyMs: 12,
      },
    };

    const parsed = HealthCheckResponseSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('validates degraded health-check payload', () => {
    const payload = {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 42,
      environment: 'test',
      version: '1.0.0',
      database: {
        status: 'disconnected',
        latencyMs: null,
        message: 'Connection timeout',
      },
    };

    const parsed = HealthCheckResponseSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid health-check payload', () => {
    const invalid = {
      status: 'not-valid-status',
      uptimeSeconds: -5,
    };
    const parsed = HealthCheckResponseSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('validates api error response format', () => {
    const errorPayload = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        statusCode: 404,
        timestamp: new Date().toISOString(),
        details: [{ field: 'id', message: 'ID does not exist' }],
      },
    };

    const parsed = ApiErrorResponseSchema.safeParse(errorPayload);
    expect(parsed.success).toBe(true);
  });

  it('validates database health schema', () => {
    const dbStatus = {
      status: 'connected',
      latencyMs: 5.2,
    };
    const parsed = DatabaseHealthSchema.safeParse(dbStatus);
    expect(parsed.success).toBe(true);
  });
});

