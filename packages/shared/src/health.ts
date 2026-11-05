import { z } from 'zod';

export const DatabaseHealthSchema = z.object({
  status: z.enum(['connected', 'disconnected', 'error']),
  latencyMs: z.number().nullable().optional(),
  message: z.string().optional(),
});

export type DatabaseHealth = z.infer<typeof DatabaseHealthSchema>;

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
  environment: z.enum(['development', 'test', 'production']),
  version: z.string(),
  database: DatabaseHealthSchema,
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
