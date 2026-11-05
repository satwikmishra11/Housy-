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
  type DaySlots,
  type SlotAlternative,
  type BookVisitPayload,
  type VisitDetail,
  type ExecutiveVisitItem,
  type VisitOutcomePayload,
  type FactEntry,
  type FactEntryVersion,
  type CreateFactPayload,
  type UpdateFactPayload,
  type FactAssistantPreviewItem,
  type FactStatus,
  type UnansweredQuestion,
  type UnansweredQuestionStatus,
  type AdminAvailabilityRule,
  type CreateAvailabilityRulePayload,
  type AdminBlackoutDate,
  type CreateBlackoutDatePayload,
  type AdminSlotItem,
  type MonthSpendRecord,
  type UpdateMonthlySpendPayload,
} from '@housy/shared';

const CSRF_HEADER_VALUE = 'XMLHttpRequest';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  alternatives?: SlotAlternative[];
}

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

    const errorObj = data as { error?: { message?: string; code?: string; alternatives?: SlotAlternative[] } } | null;
    let message = errorObj?.error?.message;
    if (!message) {
      if (response.status === 502 || response.status === 504 || (response.status === 500 && !rawText)) {
        message = `API server unavailable (HTTP ${response.status}). Please check that the backend API server is running on port 3001.`;
      } else if (response.status === 404) {
        message = `API endpoint not found: ${endpoint} (HTTP 404)`;
      } else if (response.status === 405) {
        message = `HTTP 405 Method Not Allowed: The hosting environment or static server intercepted the POST request. Ensure the backend API server is running or the Vercel serverless function rewrite is active.`;
      } else {
        message = rawText.trim() || `Request failed with status ${response.status}`;
      }
    }

    const error: ApiError = new Error(message);
    error.statusCode = response.status;
    error.code = errorObj?.error?.code;
    error.alternatives = errorObj?.error?.alternatives;
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

export interface ProjectItem {
  id: string;
  name: string;
  rera_number?: string;
  address?: string;
  bhk_types?: string[];
}

export async function fetchProjects(): Promise<ProjectItem[]> {
  const res = await apiFetch<{ success: boolean; data: ProjectItem[] }>('/api/projects');
  return res.data;
}

export interface AdminExecutiveItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export async function fetchAdminExecutives(): Promise<AdminExecutiveItem[]> {
  const res = await apiFetch<{ success: boolean; data: AdminExecutiveItem[] }>('/api/admin/executives');
  return res.data;
}

// ---------------------------------------------------------------------------
// Visits & Slots API Helpers
// ---------------------------------------------------------------------------

export interface ProjectSlotsResult {
  days: DaySlots[];
  nextAvailableDate?: string;
}

export async function fetchProjectSlots(
  projectId: string,
  from?: string,
  to?: string,
): Promise<ProjectSlotsResult> {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const url = `/api/projects/${projectId}/slots${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await apiFetch<{ success: boolean; data: ProjectSlotsResult }>(url);
  return res.data;
}

export interface BookVisitResult {
  bookingId: string;
  token: string;
  startsAt: string;
  endsAt: string;
  manageUrl: string;
}

export async function bookVisitSlot(
  projectId: string,
  payload: BookVisitPayload,
): Promise<BookVisitResult> {
  const res = await apiFetch<{ success: boolean; data: BookVisitResult }>(
    `/api/projects/${projectId}/book`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return res.data;
}

export async function fetchVisitManage(token: string): Promise<VisitDetail> {
  const res = await apiFetch<{ success: boolean; data: VisitDetail }>(
    `/api/visits/manage/${encodeURIComponent(token)}`,
  );
  return res.data;
}

export interface RescheduleVisitResult {
  bookingId: string;
  token: string;
  startsAt: string;
  endsAt: string;
}

export async function rescheduleVisitSlot(
  token: string,
  newStartsAt: string,
): Promise<RescheduleVisitResult> {
  const res = await apiFetch<{ success: boolean; data: RescheduleVisitResult }>(
    `/api/visits/manage/${encodeURIComponent(token)}/reschedule`,
    {
      method: 'POST',
      body: JSON.stringify({ newStartsAt }),
    },
  );
  return res.data;
}

export async function cancelVisitBooking(
  token: string,
  reason?: string,
): Promise<{ message: string }> {
  const res = await apiFetch<{ success: boolean; data: { message: string } }>(
    `/api/visits/manage/${encodeURIComponent(token)}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
  return res.data;
}

export interface StaffVisitsResult {
  upcoming: ExecutiveVisitItem[];
  awaitingOutcome: ExecutiveVisitItem[];
}

export async function fetchStaffVisits(): Promise<StaffVisitsResult> {
  const res = await apiFetch<{ success: boolean; data: StaffVisitsResult }>('/api/visits/my');
  return res.data;
}

export async function recordVisitOutcome(
  bookingId: string,
  payload: VisitOutcomePayload,
): Promise<{ message: string; status: string }> {
  const res = await apiFetch<{ success: boolean; data: { message: string; status: string } }>(
    `/api/visits/${bookingId}/outcome`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Admin Area: Fact Sheet, Unanswered Questions, Slot Rules, and Ad Spend
// ---------------------------------------------------------------------------

export interface FetchFactEntriesParams {
  projectId?: string;
  category?: string;
  status?: FactStatus;
  search?: string;
}

export async function fetchFactEntries(params: FetchFactEntriesParams = {}): Promise<FactEntry[]> {
  const query = new URLSearchParams();
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.category) query.set('category', params.category);
  if (params.status) query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  const url = `/api/fact-sheet${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await apiFetch<{ success: boolean; data: FactEntry[] }>(url);
  return res.data;
}

export async function fetchFactById(id: string): Promise<FactEntry> {
  const res = await apiFetch<{ success: boolean; data: FactEntry }>(`/api/fact-sheet/${id}`);
  return res.data;
}

export async function createFactEntry(payload: CreateFactPayload): Promise<FactEntry> {
  const res = await apiFetch<{ success: boolean; data: FactEntry }>('/api/fact-sheet', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateFactEntry(id: string, payload: UpdateFactPayload): Promise<FactEntry> {
  const res = await apiFetch<{ success: boolean; data: FactEntry }>(`/api/fact-sheet/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function archiveFactEntry(id: string): Promise<FactEntry> {
  const res = await apiFetch<{ success: boolean; data: FactEntry }>(`/api/fact-sheet/${id}/archive`, {
    method: 'POST',
  });
  return res.data;
}

export async function fetchFactVersions(id: string): Promise<FactEntryVersion[]> {
  const res = await apiFetch<{ success: boolean; data: FactEntryVersion[] }>(`/api/fact-sheet/${id}/versions`);
  return res.data;
}

export async function fetchAssistantPreview(projectId?: string): Promise<FactAssistantPreviewItem[]> {
  const query = new URLSearchParams();
  if (projectId) query.set('projectId', projectId);
  const url = `/api/fact-sheet/preview/assistant${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await apiFetch<{ success: boolean; data: FactAssistantPreviewItem[] }>(url);
  return res.data;
}

export async function fetchUnansweredQuestions(status?: UnansweredQuestionStatus): Promise<UnansweredQuestion[]> {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  const url = `/api/unanswered-questions${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await apiFetch<{ success: boolean; data: UnansweredQuestion[] }>(url);
  return res.data;
}

export async function resolveUnansweredQuestion(
  id: string,
  status: 'resolved' | 'dismissed',
): Promise<UnansweredQuestion> {
  const res = await apiFetch<{ success: boolean; data: UnansweredQuestion }>(
    `/api/unanswered-questions/${id}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify({ status }),
    },
  );
  return res.data;
}

export async function fetchAvailabilityRules(projectId?: string): Promise<AdminAvailabilityRule[]> {
  const query = new URLSearchParams();
  if (projectId) query.set('projectId', projectId);
  const url = `/api/availability-rules${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await apiFetch<{ success: boolean; data: AdminAvailabilityRule[] }>(url);
  return res.data;
}

export async function createAvailabilityRule(
  payload: CreateAvailabilityRulePayload,
): Promise<{ rule: AdminAvailabilityRule; createdSlotsCount: number }> {
  const res = await apiFetch<{ success: boolean; data: AdminAvailabilityRule; createdSlotsCount: number }>(
    '/api/availability-rules',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return { rule: res.data, createdSlotsCount: res.createdSlotsCount };
}

export async function deleteAvailabilityRule(
  id: string,
): Promise<{ success: boolean; createdSlotsCount: number }> {
  return apiFetch<{ success: boolean; createdSlotsCount: number }>(`/api/availability-rules/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchBlackoutDates(projectId?: string): Promise<AdminBlackoutDate[]> {
  const query = new URLSearchParams();
  if (projectId) query.set('projectId', projectId);
  const url = `/api/blackout-dates${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await apiFetch<{ success: boolean; data: AdminBlackoutDate[] }>(url);
  return res.data;
}

export async function createBlackoutDate(
  payload: CreateBlackoutDatePayload,
): Promise<{ blackoutDate: AdminBlackoutDate; createdSlotsCount: number }> {
  const res = await apiFetch<{ success: boolean; data: AdminBlackoutDate; createdSlotsCount: number }>(
    '/api/blackout-dates',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return { blackoutDate: res.data, createdSlotsCount: res.createdSlotsCount };
}

export async function deleteBlackoutDate(
  id: string,
): Promise<{ success: boolean; createdSlotsCount: number }> {
  return apiFetch<{ success: boolean; createdSlotsCount: number }>(`/api/blackout-dates/${id}`, {
    method: 'DELETE',
  });
}

export interface FetchAdminSlotsPreviewParams {
  projectId?: string;
  executiveId?: string;
  fromDate?: string;
  toDate?: string;
}

export async function fetchAdminSlotsPreview(
  params: FetchAdminSlotsPreviewParams = {},
): Promise<AdminSlotItem[]> {
  const query = new URLSearchParams();
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.executiveId) query.set('executiveId', params.executiveId);
  if (params.fromDate) query.set('fromDate', params.fromDate);
  if (params.toDate) query.set('toDate', params.toDate);
  const url = `/api/admin/slots/preview${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await apiFetch<{ success: boolean; data: AdminSlotItem[] }>(url);
  return res.data;
}

export async function blockAdminSlot(
  id: string,
): Promise<{ success: boolean; message: string; slot: AdminSlotItem }> {
  return apiFetch<{ success: boolean; message: string; slot: AdminSlotItem }>(
    `/api/admin/slots/${id}/block`,
    {
      method: 'POST',
    },
  );
}

export async function unblockAdminSlot(
  id: string,
): Promise<{ success: boolean; message: string; slot: AdminSlotItem }> {
  return apiFetch<{ success: boolean; message: string; slot: AdminSlotItem }>(
    `/api/admin/slots/${id}/unblock`,
    {
      method: 'POST',
    },
  );
}

export async function triggerSlotGeneration(
  days: number = 21,
): Promise<{ success: boolean; message: string; createdSlotsCount: number }> {
  return apiFetch<{ success: boolean; message: string; createdSlotsCount: number }>(
    '/api/admin/slots/generate',
    {
      method: 'POST',
      body: JSON.stringify({ days }),
    },
  );
}

export interface MonthlySpendData {
  month: string;
  allocations: MonthSpendRecord[];
  totalInr: number;
  isDefault: boolean;
}

export async function fetchMonthlySpend(month?: string): Promise<MonthlySpendData> {
  const query = new URLSearchParams();
  if (month) query.set('month', month);
  const url = `/api/ad-spend${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await apiFetch<{ success: boolean; data: MonthlySpendData }>(url);
  return res.data;
}

export async function updateMonthlySpend(payload: UpdateMonthlySpendPayload): Promise<MonthlySpendData> {
  const res = await apiFetch<{ success: boolean; data: MonthlySpendData }>('/api/ad-spend', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function fetchSpendMonths(): Promise<string[]> {
  const res = await apiFetch<{ success: boolean; data: string[] }>('/api/ad-spend/months');
  return res.data;
}
