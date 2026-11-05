import { HealthCheckResponseSchema, type HealthCheckResponse } from '@housy/shared';

export async function fetchHealth(): Promise<HealthCheckResponse> {
  const response = await fetch('/api/health');

  const data: unknown = await response.json();

  const parsed = HealthCheckResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid health response schema from server: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    );
  }

  return parsed.data;
}

