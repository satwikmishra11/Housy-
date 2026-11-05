import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHealthRouter } from '../src/routes/health.router.js';
import { HealthService } from '../src/services/health.service.js';
import type { HealthRepository } from '../src/repositories/health.repository.js';
import { HealthCheckResponseSchema } from '@housy/shared';
import { app } from '../src/app.js';

describe('Health API', () => {
  it('GET /api/health returns 200 with ok status when DB is connected', async () => {
    const mockRepo: HealthRepository = {
      pingDatabase: vi.fn().mockResolvedValue({
        connected: true,
        latencyMs: 3.5,
      }),
    };

    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api', createHealthRouter(new HealthService(mockRepo)));

    const response = await request(testApp).get('/api/health');

    expect(response.status).toBe(200);
    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.status).toBe('ok');
      expect(parseResult.data.database.status).toBe('connected');
      expect(parseResult.data.database.latencyMs).toBe(3.5);
    }
  });

  it('GET /api/health returns 503 with degraded status when DB is disconnected', async () => {
    const mockRepo: HealthRepository = {
      pingDatabase: vi.fn().mockResolvedValue({
        connected: false,
        latencyMs: null,
        error: 'Connection refused',
      }),
    };

    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api', createHealthRouter(new HealthService(mockRepo)));

    const response = await request(testApp).get('/api/health');

    expect(response.status).toBe(503);
    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.status).toBe('degraded');
      expect(parseResult.data.database.status).toBe('disconnected');
      expect(parseResult.data.database.message).toBe('Connection refused');
    }
  });

  it('GET /api/health responds via full application instance', async () => {
    const response = await request(app).get('/api/health');
    // Regardless of whether local docker DB is running right this second, response should be 200 or 503
    expect([200, 503]).toContain(response.status);
    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);
  });
});

