import type { HealthCheckResponse } from '@housy/shared';
import { HealthCheckResponseSchema } from '@housy/shared';
import { HealthRepository, healthRepository } from '../repositories/health.repository.js';
import { LlmCallRepository, llmCallRepository } from '../repositories/llm-call.repository.js';
import { JobRunRepository, jobRunRepository } from '../repositories/job-run.repository.js';
import { llmService } from '../llm/llm.service.js';
import { config } from '../config/index.js';

export class HealthService {
  constructor(
    private readonly repo: HealthRepository = healthRepository,
    private readonly llmCalls: LlmCallRepository = llmCallRepository,
    private readonly jobRuns: JobRunRepository = jobRunRepository,
  ) {}

  async getHealth(): Promise<HealthCheckResponse> {
    const dbPing = await this.repo.pingDatabase();

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

    // Health is ok only if DB is connected, LLM is operational or unconfigured, and reminders are not overdue (>10 min)
    const isHealthy =
      dbPing.connected &&
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
        status: dbPing.connected ? ('connected' as const) : ('disconnected' as const),
        latencyMs: dbPing.latencyMs,
        message: dbPing.error,
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
