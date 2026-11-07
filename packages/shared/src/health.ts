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

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
  environment: z.enum(['development', 'test', 'production']),
  version: z.string(),
  database: DatabaseHealthSchema,
  llm: LLMHealthSchema.optional(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
