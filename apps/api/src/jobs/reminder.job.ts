import type { ScheduledJob, JobExecutionResult } from './jobs.types.js';
import { logger } from '../utils/logger.js';

export class ReminderJob implements ScheduledJob {
  public readonly name = 'visit-slot-reminders';

  async execute(): Promise<JobExecutionResult> {
    const start = performance.now();
    logger.info({ job: this.name }, 'Executing site visit reminder check (1 day / 2 hours before)');

    // Placeholder for scanning pending reminders and queueing to outbox channel adapter
    const durationMs = Math.round(performance.now() - start);

    return {
      jobName: this.name,
      processedCount: 0,
      errorCount: 0,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }
}

export const reminderJob = new ReminderJob();

