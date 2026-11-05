/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '../src/lib/api.js';

describe('apiFetch Client Resilience', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses valid JSON responses on successful HTTP 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ success: true, message: 'Hello' })),
    } as unknown as Response);

    const result = await apiFetch<{ success: boolean; message: string }>('/api/test');
    expect(result).toEqual({ success: true, message: 'Hello' });
  });

  it('extracts typed error message from structured JSON error response on HTTP 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
            statusCode: 401,
          },
        }),
      ),
    } as unknown as Response);

    await expect(apiFetch('/api/auth/login', { method: 'POST' })).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('handles empty response body without throwing "Unexpected end of JSON input"', async () => {
    // When Vite proxy fails to connect to backend on port 3001, it returns empty body with 500/504
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    await expect(apiFetch('/api/auth/login', { method: 'POST' })).rejects.toThrow(
      /API server unavailable \(HTTP 500\)\. Please check that the backend API server is running on port 3001/,
    );
  });

  it('handles HTTP 502 Bad Gateway gracefully when backend is unreachable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: {
            code: 'PROXY_BACKEND_UNAVAILABLE',
            message:
              'Cannot connect to backend API server on port 3001. Please make sure the API server is running (npm run dev:api).',
          },
        }),
      ),
    } as unknown as Response);

    await expect(apiFetch('/api/auth/login', { method: 'POST' })).rejects.toThrow(
      /Cannot connect to backend API server on port 3001/,
    );
  });

  it('handles HTML error pages without throwing JSON syntax errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: vi.fn().mockResolvedValue('<html><body>Gateway Timeout</body></html>'),
    } as unknown as Response);

    await expect(apiFetch('/api/auth/login', { method: 'POST' })).rejects.toThrow(
      /API server unavailable \(HTTP 504\)/,
    );
  });
});
