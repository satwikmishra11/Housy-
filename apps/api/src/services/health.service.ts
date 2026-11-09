import type { HealthCheckResponse } from '@housy/shared';
import { HealthCheckResponseSchema } from '@housy/shared';
import { HealthRepository, healthRepository } from '../repositories/health.repository.js';
import { LlmCallRepository, llmCallRepository } from '../repositories/llm-call.repository.js';
import { JobRunRepository, jobRunRepository } from '../repositories/job-run.repository.js';
import { llmService } from '../llm/llm.service.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class HealthService {
  constructor(
    private readonly repo: HealthRepository = healthRepository,
    private readonly llmCalls: LlmCallRepository = llmCallRepository,
    private readonly jobRuns: JobRunRepository = jobRunRepository,
  ) {}

  async getHealth(): Promise<HealthCheckResponse> {
    const dbCheck =
      typeof this.repo.checkDatabase === 'function'
        ? await this.repo.checkDatabase()
        : await (async () => {
            const ping = await this.repo.pingDatabase();
            return {
              status: ping.connected ? ('ok' as const) : ('down' as const),
              schema: ping.connected ? ('ok' as const) : ('missing' as const),
              reason: ping.connected ? null : ('unreachable' as const),
              latencyMs: ping.latencyMs,
              rawError: ping.error,
            };
          })();

    // Log raw error details server-side only; never leak hostnames, ports or stack traces to public endpoint
    if (dbCheck.status !== 'ok') {
      logger.error(
        {
          dbStatus: dbCheck.status,
          dbSchema: dbCheck.schema,
          dbReason: dbCheck.reason,
          err: dbCheck.rawError,
        },
        'Database health check failed',
      );
    }

    // Query LLM telemetry and run cached 60s 1-token probe
    const probe = await llmService.probe();
    const [lastSuccessAt, lastErrorKindDb, jobsHealth] = await Promise.all([
      this.llmCalls.getLastSuccessTime().catch(() => null),
      this.llmCalls.getLastErrorKind().catch(() => null),
      this.jobRuns.getJobsHealth(10).catch(() => ({
        remindersStatus: 'never_run' as const,
        remindersLastRunAt: null,
        remindersOverdue: true,
        recentRuns: [],
      })),
    ]);

    let llmStatus: 'ok' | 'degraded' | 'down' | 'unconfigured' = 'ok';
    if (probe.errorKind === 'unconfigured') {
      llmStatus = 'unconfigured';
    } else if (!probe.ok) {
      if (probe.errorKind === 'rate_limit' || probe.errorKind === 'timeout') {
        llmStatus = 'degraded';
      } else {
        llmStatus = 'down';
      }
    }

    const lastErrorKind = !probe.ok && probe.errorKind ? probe.errorKind : lastErrorKindDb;

    // Health is ok only if DB is ok, schema is ok, LLM is operational or unconfigured, and reminders are not overdue (>10 min)
    const isHealthy =
      dbCheck.status === 'ok' &&
      dbCheck.schema === 'ok' &&
      (llmStatus === 'ok' || llmStatus === 'unconfigured') &&
      !jobsHealth.remindersOverdue;
    const status: HealthCheckResponse['status'] = isHealthy ? 'ok' : 'degraded';

    const rawResponse = {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: config.NODE_ENV,
      version: '1.0.0',
      database: {
        status: dbCheck.status,
        schema: dbCheck.schema,
        reason: dbCheck.reason,
        latencyMs: dbCheck.latencyMs,
      },
      llm: {
        provider: config.LLM_PROVIDER,
        model: config.LLM_MODEL || 'unconfigured',
        status: llmStatus,
        lastSuccessAt,
        lastErrorKind,
        probeLatencyMs: probe.latencyMs,
      },
      jobs: jobsHealth,
    };

    // Strict validation against shared Zod schema at domain boundary
    return HealthCheckResponseSchema.parse(rawResponse);
  }
}

export const healthService = new HealthService();
