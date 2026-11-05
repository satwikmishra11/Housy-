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
  type LeadListItem,
  type LeadDetail,
  type CsvPreviewRow,
  type CsvCommitPayload,
  type LeadSource,
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

  // Safely read response body as text first to handle empty responses (204, proxy errors, timeouts)
  // without triggering "Unexpected end of JSON input" SyntaxErrors
  const rawText = await response.text();
  let data: unknown = null;
  if (rawText && rawText.trim().length > 0) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.dispatchEvent(new CustomEvent('housy:session-expired'));
    }

    const errorObj = data as { error?: { message?: string; code?: string } } | null;
    let message = errorObj?.error?.message;
    if (!message) {
      if (response.status === 502 || response.status === 504 || (response.status === 500 && !rawText)) {
        message = `API server unavailable (HTTP ${response.status}). Please check that the backend API server is running on port 3001.`;
      } else if (response.status === 404) {
        message = `API endpoint not found: ${endpoint} (HTTP 404)`;
      } else {
        message = rawText.trim() || `Request failed with status ${response.status}`;
      }
    }

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

export interface FetchLeadsParams {
  source?: string;
  projectId?: string;
  status?: string;
  duplicatesOnly?: boolean;
  unassignedOnly?: boolean;
  search?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface FetchLeadsResult {
  data: LeadListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function fetchLeads(params: FetchLeadsParams = {}): Promise<FetchLeadsResult> {
  const query = new URLSearchParams();
  if (params.source) query.set('source', params.source);
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.status) query.set('status', params.status);
  if (params.duplicatesOnly) query.set('duplicatesOnly', 'true');
  if (params.unassignedOnly) query.set('unassignedOnly', 'true');
  if (params.search) query.set('search', params.search);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.order) query.set('order', params.order);
  if (params.page) query.set('page', params.page.toString());
  if (params.limit) query.set('limit', params.limit.toString());

  const url = `/api/leads${query.toString() ? `?${query.toString()}` : ''}`;
  return apiFetch<FetchLeadsResult>(url);
}

export async function fetchLeadDetails(id: string): Promise<LeadDetail> {
  const res = await apiFetch<{ data: LeadDetail }>(`/api/leads/${id}`);
  return res.data;
}

export async function mergeLeads(primaryLeadId: string, secondaryLeadId: string): Promise<void> {
  await apiFetch('/api/leads/merge', {
    method: 'POST',
    body: JSON.stringify({ primaryLeadId, secondaryLeadId }),
  });
}

export async function keepSeparateLead(leadId: string): Promise<void> {
  await apiFetch(`/api/leads/${leadId}/keep-separate`, {
    method: 'POST',
  });
}

export interface PreviewCsvResult {
  total: number;
  validCount: number;
  invalidCount: number;
  rows: CsvPreviewRow[];
}

export async function previewCsv(
  rows: Record<string, string>[],
  source: LeadSource = 'property_portal',
): Promise<PreviewCsvResult> {
  return apiFetch<PreviewCsvResult>('/api/leads/csv-preview', {
    method: 'POST',
    body: JSON.stringify({ rows, source }),
  });
}

export interface CommitCsvResult {
  imported: number;
  merged: number;
  possibleDuplicates: number;
}

export async function commitCsv(
  source: LeadSource,
  rows: CsvCommitPayload['rows'],
): Promise<CommitCsvResult> {
  return apiFetch<CommitCsvResult>('/api/leads/csv-commit', {
    method: 'POST',
    body: JSON.stringify({ source, rows }),
  });
}
