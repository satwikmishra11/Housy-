import { performance } from 'node:perf_hooks';
import { reminderService } from './reminder.service.js';
import { runSlotGeneration } from '../jobs/slot-generator.job.js';
import { slotRepository } from '../repositories/slot.repository.js';
import { handoffService } from './handoff.service.js';
import { chatSessionRepository } from '../repositories/chat-session.repository.js';
import { jobRunRepository } from '../repositories/job-run.repository.js';
import { logger } from '../utils/logger.js';

export interface JobExecutionOutput {
  ok: boolean;
  durationMs: number;
  counts: Record<string, unknown>;
  error?: string | null;
}

export interface RunAllJobsResult {
  success: boolean;
  timestamp: string;
  jobs: {
    reminders: JobExecutionOutput;
    slot_top_up: JobExecutionOutput;
    handoff_escalation: JobExecutionOutput;
    stale_session_cleanup: JobExecutionOutput;
    data_retention: JobExecutionOutput;
  };
}

export class JobsService {
  private async safeRecordRun(data: Parameters<typeof jobRunRepository.createRun>[0]): Promise<void> {
    try {
      await jobRunRepository.createRun(data);
    } catch (dbErr) {
      logger.warn({ dbErr, job: data.job }, 'Could not persist job run record to database');
    }
  }

  /**
   * Runs all periodic background jobs in isolated try/catch blocks.
   * Logs execution status to job_runs table and returns per-job execution metrics
   * without leaking stack traces.
   */
  async runAllJobs(): Promise<RunAllJobsResult> {
    const timestamp = new Date().toISOString();

    const [reminders, slot_top_up, handoff_escalation, stale_session_cleanup, data_retention] = await Promise.all([
      this.runRemindersJob(),
      this.runSlotTopUpJob(),
      this.runHandoffEscalationJob(),
      this.runStaleSessionCleanupJob(),
      this.runDataRetentionJob(),
    ]);

    const allOk =
      reminders.ok &&
      slot_top_up.ok &&
      handoff_escalation.ok &&
      stale_session_cleanup.ok &&
      data_retention.ok;

    return {
      success: allOk,
      timestamp,
      jobs: {
        reminders,
        slot_top_up,
        handoff_escalation,
        stale_session_cleanup,
        data_retention,
      },
    };
  }

  /**
   * 1. Site-visit reminders (limit 100, idempotent with SKIP LOCKED).
   */
  private async runRemindersJob(): Promise<JobExecutionOutput> {
    const startedAt = new Date();
    const start = performance.now();
    try {
      const counts = await reminderService.processDueReminders(100);
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);

      await this.safeRecordRun({
        job: 'reminders',
        startedAt,
        finishedAt,
        ok: true,
        counts: counts as unknown as Record<string, unknown>,
        error: null,
      });

      return {
        ok: true,
        durationMs,
        counts: counts as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error({ err, job: 'reminders' }, 'Internal jobs runner: reminders error');

      await this.safeRecordRun({
        job: 'reminders',
        startedAt,
        finishedAt,
        ok: false,
        counts: {},
        error: errorMessage,
      });

      return {
        ok: false,
        durationMs,
        counts: {},
        error: errorMessage,
      };
    }
  }

  /**
   * 2. Site-visit slot top-up to 28 days ahead.
   */
  private async runSlotTopUpJob(): Promise<JobExecutionOutput> {
    const startedAt = new Date();
    const start = performance.now();
    try {
      const insertedSlots = await runSlotGeneration(slotRepository, 28);
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const counts = { insertedSlots };

      await this.safeRecordRun({
        job: 'slot_top_up',
        startedAt,
        finishedAt,
        ok: true,
        counts,
        error: null,
      });

      return {
        ok: true,
        durationMs,
        counts,
      };
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error({ err, job: 'slot_top_up' }, 'Internal jobs runner: slot_top_up error');

      await this.safeRecordRun({
        job: 'slot_top_up',
        startedAt,
        finishedAt,
        ok: false,
        counts: {},
        error: errorMessage,
      });

      return {
        ok: false,
        durationMs,
        counts: {},
        error: errorMessage,
      };
    }
  }

  /**
   * 3. Handoff SLA escalation (R3: unaccepted handoffs in new status older than 15 minutes).
   */
  private async runHandoffEscalationJob(): Promise<JobExecutionOutput> {
    const startedAt = new Date();
    const start = performance.now();
    try {
      const escalatedCount = await handoffService.escalateStaleHandoffs();
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const counts = { escalatedCount };

      await this.safeRecordRun({
        job: 'handoff_escalation',
        startedAt,
        finishedAt,
        ok: true,
        counts,
        error: null,
      });

      return {
        ok: true,
        durationMs,
        counts,
      };
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error({ err, job: 'handoff_escalation' }, 'Internal jobs runner: handoff_escalation error');

      await this.safeRecordRun({
        job: 'handoff_escalation',
        startedAt,
        finishedAt,
        ok: false,
        counts: {},
        error: errorMessage,
      });

      return {
        ok: false,
        durationMs,
        counts: {},
        error: errorMessage,
      };
    }
  }

  /**
   * 4. Stale anonymous chat session cleanup (>24h inactive, un-converted).
   */
  private async runStaleSessionCleanupJob(): Promise<JobExecutionOutput> {
    const startedAt = new Date();
    const start = performance.now();
    try {
      const res = await chatSessionRepository.cleanupStaleSessions(24);
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const counts = { cleanedCount: res.cleanedCount };

      await this.safeRecordRun({
        job: 'stale_session_cleanup',
        startedAt,
        finishedAt,
        ok: true,
        counts,
        error: null,
      });

      return {
        ok: true,
        durationMs,
        counts,
      };
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error({ err, job: 'stale_session_cleanup' }, 'Internal jobs runner: stale_session_cleanup error');

      await this.safeRecordRun({
        job: 'stale_session_cleanup',
        startedAt,
        finishedAt,
        ok: false,
        counts: {},
        error: errorMessage,
      });

      return {
        ok: false,
        durationMs,
        counts: {},
        error: errorMessage,
      };
    }
  }

  /**
   * 5. Data retention routine (anonymizes chat sessions older than 90 days).
   */
  async runDataRetentionJob(retentionDays = 90): Promise<JobExecutionOutput> {
    const startedAt = new Date();
    const start = performance.now();
    try {
      const res = await chatSessionRepository.anonymizeOldSessions(retentionDays);
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const counts = { anonymizedCount: res.anonymizedCount };

      await this.safeRecordRun({
        job: 'data_retention',
        startedAt,
        finishedAt,
        ok: true,
        counts,
        error: null,
      });

      return {
        ok: true,
        durationMs,
        counts,
      };
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - start);
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error({ err, job: 'data_retention' }, 'Internal jobs runner: data_retention error');

      await this.safeRecordRun({
        job: 'data_retention',
        startedAt,
        finishedAt,
        ok: false,
        counts: {},
        error: errorMessage,
      });

      return {
        ok: false,
        durationMs,
        counts: {},
        error: errorMessage,
      };
    }
  }
}

export const jobsService = new JobsService();

