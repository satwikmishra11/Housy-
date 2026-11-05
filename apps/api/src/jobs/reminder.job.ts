import type { ScheduledJob, JobExecutionResult } from './jobs.types.js';
import { reminderService } from '../services/reminder.service.js';
import { logger } from '../utils/logger.js';

export class ReminderJob implements ScheduledJob {
  public readonly name = 'visit-slot-reminders';

  async execute(): Promise<JobExecutionResult> {
    const start = performance.now();
    logger.info({ job: this.name }, 'Executing site visit reminder check (1 day / 2 hours before)');

    let processedCount = 0;
    let errorCount = 0;

    try {
      const result = await reminderService.processDueReminders(50);
      processedCount = result.processedCount;
      errorCount = result.failedCount;

      logger.info(
        { job: this.name, ...result },
        `Completed reminder processing: ${result.sentCount} sent, ${result.skippedCount} skipped, ${result.failedCount} failed`,
      );
    } catch (err) {
      errorCount++;
      logger.error({ job: this.name, err }, 'Unhandled error running reminder job');
    }

    const durationMs = Math.round(performance.now() - start);

    return {
      jobName: this.name,
      processedCount,
      errorCount,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }
}

export const reminderJob = new ReminderJob();
