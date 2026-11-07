import { z } from 'zod';

export const DatabaseHealthSchema = z.object({
  status: z.enum(['connected', 'disconnected', 'error']),
  latencyMs: z.number().nullable().optional(),
  message: z.string().optional(),
});

export type DatabaseHealth = z.infer<typeof DatabaseHealthSchema>;

export const LLMHealthStatusSchema = z.enum(['ok', 'degraded', 'down', 'unconfigured']);
export type LLMHealthStatus = z.infer<typeof LLMHealthStatusSchema>;

export const LLMHealthSchema = z.object({
  provider: z.string(),
  model: z.string(),
  status: LLMHealthStatusSchema,
  lastSuccessAt: z.string().nullable().optional(),
  lastErrorKind: z.string().nullable().optional(),
  probeLatencyMs: z.number().nullable().optional(),
});

export type LLMHealth = z.infer<typeof LLMHealthSchema>;

export const JobRunItemSchema = z.object({
  id: z.string().uuid().optional(),
  job: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  ok: z.boolean(),
  counts: z.record(z.unknown()).default({}),
  error: z.string().nullable().optional(),
  durationMs: z.number().optional(),
});
export type JobRunItem = z.infer<typeof JobRunItemSchema>;

export const JobsHealthSchema = z.object({
  remindersStatus: z.enum(['ok', 'overdue', 'never_run']),
  remindersLastRunAt: z.string().nullable().optional(),
  remindersOverdue: z.boolean(),
  recentRuns: z.array(JobRunItemSchema).default([]),
});
export type JobsHealth = z.infer<typeof JobsHealthSchema>;

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
  environment: z.enum(['development', 'test', 'production']),
  version: z.string(),
  database: DatabaseHealthSchema,
  llm: LLMHealthSchema.optional(),
  jobs: JobsHealthSchema.optional(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
