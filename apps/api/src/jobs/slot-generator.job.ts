import type { ScheduledJob, JobExecutionResult } from './jobs.types.js';
import { slotRepository, type SlotRepository } from '../repositories/slot.repository.js';
import { generateSlots } from '../services/slot-generator.js';
import { logger } from '../utils/logger.js';

export async function runSlotGeneration(
  slotRepo: SlotRepository = slotRepository,
  days = 28,
  fromDate: Date | string = new Date(),
): Promise<number> {
  const rules = await slotRepo.getAvailabilityRules();
  const blackoutDates = await slotRepo.getBlackoutDates();

  const generated = generateSlots(rules, blackoutDates, fromDate, days);
  if (generated.length === 0) {
    return 0;
  }

  const inserted = await slotRepo.insertSlotsBatch(generated);
  logger.info(
    { rulesCount: rules.length, generated: generated.length, inserted },
    'Completed idempotent site-visit slot generation',
  );
  return inserted;
}

export class SlotGeneratorJob implements ScheduledJob {
  public readonly name = 'slot-generator-nightly';

  async execute(): Promise<JobExecutionResult> {
    const start = performance.now();
    let errorCount = 0;
    let processed = 0;

    try {
      processed = await runSlotGeneration(slotRepository, 21);
    } catch (err) {
      errorCount++;
      logger.error({ err, job: this.name }, 'Error during scheduled slot generation');
    }

    return {
      jobName: this.name,
      processedCount: processed,
      errorCount,
      durationMs: Math.round(performance.now() - start),
      timestamp: new Date().toISOString(),
    };
  }
}

export const slotGeneratorJob = new SlotGeneratorJob();

