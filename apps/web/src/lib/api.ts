import {
  HealthCheckResponseSchema,
  LoginResponseSchema,
  LogoutResponseSchema,
  MeResponseSchema,
  type HealthCheckResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutResponse,
  type MeResponse,
} from '@housy/shared';

const CSRF_HEADER_VALUE = 'XMLHttpRequest';

/**
 * Universal API fetch helper with credentials and CSRF custom header support.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  // For mutating methods, attach CSRF protection header
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('X-Requested-With', CSRF_HEADER_VALUE);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include', // Include httpOnly auth cookies
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.dispatchEvent(new CustomEvent('housy:session-expired'));
    }

    const errorObj = data as { error?: { message?: string; code?: string } };
    const message = errorObj?.error?.message || `Request failed with status ${response.status}`;
    const error = new Error(message);
    (error as { statusCode?: number }).statusCode = response.status;
    (error as { code?: string }).code = errorObj?.error?.code;
    throw error;
  }

  return data as T;
}

export async function fetchHealth(): Promise<HealthCheckResponse> {
  const data = await apiFetch<unknown>('/api/health');
  const parsed = HealthCheckResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid health response schema from server: ${parsed.error.issues.map((i: { message: string }) => i.message).join(', ')}`,
    );
  }
  return parsed.data;
}

export async function loginStaff(credentials: LoginRequest): Promise<LoginResponse> {
  const data = await apiFetch<unknown>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  return LoginResponseSchema.parse(data);
}

export async function logoutStaff(): Promise<LogoutResponse> {
  const data = await apiFetch<unknown>('/api/auth/logout', {
    method: 'POST',
  });
  return LogoutResponseSchema.parse(data);
}

export async function fetchMe(): Promise<MeResponse> {
  const data = await apiFetch<unknown>('/api/auth/me');
  return MeResponseSchema.parse(data);
}
