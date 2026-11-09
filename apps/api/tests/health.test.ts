import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHealthRouter } from '../src/routes/health.router.js';
import { HealthService } from '../src/services/health.service.js';
import type { HealthRepository } from '../src/repositories/health.repository.js';
import type { LlmCallRepository } from '../src/repositories/llm-call.repository.js';
import type { JobRunRepository } from '../src/repositories/job-run.repository.js';
import { HealthCheckResponseSchema } from '@housy/shared';
import { app } from '../src/app.js';
import { llmService } from '../src/llm/llm.service.js';

describe('Health API', () => {
  const defaultMockJobRuns: Partial<JobRunRepository> = {
    getJobsHealth: vi.fn().mockResolvedValue({
      remindersStatus: 'ok',
      remindersOverdue: false,
      recentRuns: [],
    }),
  };

  it('GET /api/health returns 200 with ok status and LLM telemetry when DB is connected', async () => {
    const mockRepo: HealthRepository = {
      checkDatabase: vi.fn().mockResolvedValue({
        status: 'ok',
        schema: 'ok',
        reason: null,
        latencyMs: 3.5,
      }),
      pingDatabase: vi.fn().mockResolvedValue({
        connected: true,
        latencyMs: 3.5,
      }),
    };

    vi.spyOn(llmService, 'probe').mockResolvedValueOnce({
      ok: true,
      latencyMs: 15,
      errorKind: null,
    });

    const mockLlmCalls: Partial<LlmCallRepository> = {
      getLastSuccessTime: vi.fn().mockResolvedValue('2026-11-07T10:00:00.000Z'),
      getLastErrorKind: vi.fn().mockResolvedValue(null),
    };

    const testApp = express();
    testApp.use(express.json());
    testApp.use(
      '/api',
      createHealthRouter(
        new HealthService(
          mockRepo,
          mockLlmCalls as LlmCallRepository,
          defaultMockJobRuns as JobRunRepository,
        ),
      ),
    );

    const response = await request(testApp).get('/api/health');

    expect(response.status).toBe(200);
    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.status).toBe('ok');
      expect(parseResult.data.database.status).toBe('ok');
      expect(parseResult.data.database.schema).toBe('ok');
      expect(parseResult.data.database.latencyMs).toBe(3.5);
      expect(parseResult.data.llm).toBeDefined();
      expect(parseResult.data.llm?.status).toBe('ok');
      expect(parseResult.data.llm?.lastSuccessAt).toBe('2026-11-07T10:00:00.000Z');
    }
  });

  it('GET /api/health reports degraded status when LLM probe detects rate_limit', async () => {
    const mockRepo: HealthRepository = {
      checkDatabase: vi.fn().mockResolvedValue({
        status: 'ok',
        schema: 'ok',
        reason: null,
        latencyMs: 4.1,
      }),
      pingDatabase: vi.fn().mockResolvedValue({
        connected: true,
        latencyMs: 4.1,
      }),
    };

    vi.spyOn(llmService, 'probe').mockResolvedValueOnce({
      ok: false,
      latencyMs: 250,
      errorKind: 'rate_limit',
      errorMessage: 'Rate limit exceeded',
    });

    const testApp = express();
    testApp.use(express.json());
    testApp.use(
      '/api',
      createHealthRouter(
        new HealthService(
          mockRepo,
          undefined,
          defaultMockJobRuns as JobRunRepository,
        ),
      ),
    );

    const response = await request(testApp).get('/api/health');

    expect(response.status).toBe(503);
    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.status).toBe('degraded');
      expect(parseResult.data.llm?.status).toBe('degraded');
      expect(parseResult.data.llm?.lastErrorKind).toBe('rate_limit');
    }
  });

  it('GET /api/health returns 503 with degraded status when DB is disconnected', async () => {
    const mockRepo: HealthRepository = {
      checkDatabase: vi.fn().mockResolvedValue({
        status: 'down',
        schema: 'missing',
        reason: 'unreachable',
        latencyMs: null,
        rawError: 'Connection refused',
      }),
      pingDatabase: vi.fn().mockResolvedValue({
        connected: false,
        latencyMs: null,
        error: 'Connection refused',
      }),
    };

    const testApp = express();
    testApp.use(express.json());
    testApp.use(
      '/api',
      createHealthRouter(
        new HealthService(
          mockRepo,
          undefined,
          defaultMockJobRuns as JobRunRepository,
        ),
      ),
    );

    const response = await request(testApp).get('/api/health');

    expect(response.status).toBe(503);
    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.status).toBe('degraded');
      expect(parseResult.data.database.status).toBe('down');
      expect(parseResult.data.database.reason).toBe('unreachable');
    }
  });

  it('GET /api/health reports unconfigured status when LLM credentials are not provided', async () => {
    const mockRepo: HealthRepository = {
      checkDatabase: vi.fn().mockResolvedValue({
        status: 'ok',
        schema: 'ok',
        reason: null,
        latencyMs: 4.1,
      }),
      pingDatabase: vi.fn().mockResolvedValue({
        connected: true,
        latencyMs: 4.1,
      }),
    };

    vi.spyOn(llmService, 'probe').mockResolvedValueOnce({
      ok: false,
      latencyMs: 0,
      errorKind: 'unconfigured',
      errorMessage: 'GEMINI_API_KEY is not configured',
    });

    const testApp = express();
    testApp.use(express.json());
    testApp.use(
      '/api',
      createHealthRouter(
        new HealthService(
          mockRepo,
          undefined,
          defaultMockJobRuns as JobRunRepository,
        ),
      ),
    );

    const response = await request(testApp).get('/api/health');

    expect(response.status).toBe(200);
    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.status).toBe('ok');
      expect(parseResult.data.llm?.status).toBe('unconfigured');
    }
  });

  it('GET /api/health responds via full application instance', async () => {
    const response = await request(app).get('/api/health');
    expect([200, 503]).toContain(response.status);
    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);
    if (parseResult.success && parseResult.data.llm) {
      expect(parseResult.data.llm.provider).toBeDefined();
    }
  });

  it('health response never contains a database hostname or port', async () => {
    const mockRepo: HealthRepository = {
      checkDatabase: vi.fn().mockResolvedValue({
        status: 'down',
        schema: 'missing',
        reason: 'unreachable',
        latencyMs: null,
        rawError:
          'connect ECONNREFUSED db.production-cluster.internal:5432 with password secret123 and port 5432',
      }),
      pingDatabase: vi.fn().mockResolvedValue({
        connected: false,
        latencyMs: null,
        error:
          'connect ECONNREFUSED db.production-cluster.internal:5432 with password secret123 and port 5432',
      }),
    };

    const testApp = express();
    testApp.use(express.json());
    testApp.use(
      '/api',
      createHealthRouter(
        new HealthService(
          mockRepo,
          undefined,
          defaultMockJobRuns as JobRunRepository,
        ),
      ),
    );

    const response = await request(testApp).get('/api/health');
    expect(response.status).toBe(503);

    const payloadString = JSON.stringify(response.body);
    expect(payloadString).not.toContain('db.production-cluster.internal');
    expect(payloadString).not.toContain('5432');
    expect(payloadString).not.toContain('ECONNREFUSED');
    expect(payloadString).not.toContain('secret123');

    expect(response.body.database.status).toBe('down');
    expect(response.body.database.schema).toBe('missing');
    expect(response.body.database.reason).toBe('unreachable');
  });

  it('health reports schema_missing on an empty database', async () => {
    const mockRepo: HealthRepository = {
      checkDatabase: vi.fn().mockResolvedValue({
        status: 'degraded',
        schema: 'missing',
        reason: 'schema_missing',
        latencyMs: 1.8,
        rawError: 'users table is missing',
      }),
      pingDatabase: vi.fn().mockResolvedValue({
        connected: true,
        latencyMs: 1.8,
      }),
    };

    const testApp = express();
    testApp.use(express.json());
    testApp.use(
      '/api',
      createHealthRouter(
        new HealthService(
          mockRepo,
          undefined,
          defaultMockJobRuns as JobRunRepository,
        ),
      ),
    );

    const response = await request(testApp).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body.database.status).toBe('degraded');
    expect(response.body.database.schema).toBe('missing');
    expect(response.body.database.reason).toBe('schema_missing');
  });

  it('HealthRepository.checkDatabase reports schema_missing when users table does not exist', async () => {
    const { HealthRepository } = await import('../src/repositories/health.repository.js');
    const db = await import('../src/db/index.js');
    const repo = new HealthRepository();

    const querySpy = vi
      .spyOn(db, 'query')
      .mockResolvedValueOnce({ rows: [{ alive: 1 }] } as unknown as import('pg').QueryResult)
      .mockResolvedValueOnce({
        rows: [{ users_table: null, migrations_table: null }],
      } as unknown as import('pg').QueryResult);

    const check = await repo.checkDatabase();
    querySpy.mockRestore();

    expect(check.status).toBe('degraded');
    expect(check.schema).toBe('missing');
    expect(check.reason).toBe('schema_missing');
  });
});
