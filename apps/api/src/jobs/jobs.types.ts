import { z } from 'zod';

export const JobExecutionResultSchema = z.object({
  jobName: z.string(),
  processedCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type JobExecutionResult = z.infer<typeof JobExecutionResultSchema>;

export interface ScheduledJob {
  readonly name: string;
  readonly scheduleCron?: string;
  execute(): Promise<JobExecutionResult>;
}

