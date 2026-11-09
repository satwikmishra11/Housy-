import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../src/pages/LoginPage.js';
import { ProtectedRoute } from '../src/components/ProtectedRoute.js';
import { AuthProvider } from '../src/context/AuthContext.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as apiModule from '../src/lib/api.js';

vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual('../src/lib/api.js');
  return {
    ...actual,
    fetchMe: vi.fn(),
    loginStaff: vi.fn(),
    logoutStaff: vi.fn(),
    fetchHealth: vi.fn().mockResolvedValue({
      status: 'ok',
      database: { status: 'ok', schema: 'ok', reason: null },
      llm: { status: 'ok' },
      jobs: { remindersStatus: 'ok', remindersOverdue: false },
    }),
  };
});

describe('Frontend Authentication & Protected Routes', () => {
  it('LoginPage renders sign-in form and demo buttons', () => {
    vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    expect(screen.getByText('Staff Sign In')).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sales head/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sales executive/i })).toBeInTheDocument();
  });

  it('clicking demo buttons populates email and password fields', () => {
    vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    const emailInput = screen.getByLabelText(/work email/i) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: /sales head/i }));
    expect(emailInput.value).toBe('harshil.mehta@example.com');

    fireEvent.click(screen.getByRole('button', { name: /sales executive/i }));
    expect(emailInput.value).toBe('amit.shah@example.com');
  });

  it('ProtectedRoute redirects unauthenticated users to /login', async () => {
    vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route path="/login" element={<div>Login Page Screen</div>} />
              <Route
                path="/protected"
                element={
                  <ProtectedRoute>
                    <div>Secret Protected Area</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Login Page Screen')).toBeInTheDocument();
    });
    expect(screen.queryByText('Secret Protected Area')).not.toBeInTheDocument();
  });

  it('ProtectedRoute renders content when user is authenticated with correct role', async () => {
    vi.mocked(apiModule.fetchMe).mockResolvedValue({
      success: true,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Harshil Mehta',
        email: 'harshil.mehta@example.com',
        role: 'sales_head',
        phone: '+919000000001',
      },
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route path="/login" element={<div>Login Page Screen</div>} />
              <Route
                path="/protected"
                element={
                  <ProtectedRoute allowedRoles={['sales_head']}>
                    <div>Secret Protected Area</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Secret Protected Area')).toBeInTheDocument();
    });
  });

  it('ProtectedRoute denies access when user role is not permitted', async () => {
    vi.mocked(apiModule.fetchMe).mockResolvedValue({
      success: true,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Amit Shah',
        email: 'amit.shah@example.com',
        role: 'executive',
        phone: '+919000000002',
      },
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/admin-only']}>
            <Routes>
              <Route
                path="/admin-only"
                element={
                  <ProtectedRoute allowedRoles={['sales_head']}>
                    <div>Sales Head Only Area</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sales Head Only Area')).not.toBeInTheDocument();
  });

  it('LoginPage displays "Setup incomplete" when database schema is missing', async () => {
    vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));
    vi.mocked(apiModule.fetchHealth).mockResolvedValueOnce({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 10,
      environment: 'development',
      version: '1.0.0',
      database: {
        status: 'degraded',
        schema: 'missing',
        reason: 'schema_missing',
        latencyMs: 5,
      },
      llm: {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        status: 'ok',
        lastSuccessAt: null,
        lastErrorKind: null,
      },
      jobs: {
        remindersStatus: 'ok',
        remindersLastRunAt: null,
        remindersOverdue: false,
        recentRuns: [],
      },
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Setup incomplete')).toBeInTheDocument();
    });
  });

  it('LoginPage displays "Service is starting up" when database is unreachable', async () => {
    vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));
    vi.mocked(apiModule.fetchHealth).mockResolvedValueOnce({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 10,
      environment: 'development',
      version: '1.0.0',
      database: {
        status: 'down',
        schema: 'missing',
        reason: 'unreachable',
        latencyMs: null,
      },
      llm: {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        status: 'ok',
        lastSuccessAt: null,
        lastErrorKind: null,
      },
      jobs: {
        remindersStatus: 'ok',
        remindersLastRunAt: null,
        remindersOverdue: false,
        recentRuns: [],
      },
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Service is starting up')).toBeInTheDocument();
    });
  });

  it('LoginPage shows "Reference: <id>" when login fails with requestId', async () => {
    vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));
    vi.mocked(apiModule.fetchHealth).mockResolvedValueOnce({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 10,
      environment: 'development',
      version: '1.0.0',
      database: {
        status: 'ok',
        schema: 'ok',
        reason: null,
        latencyMs: 2,
      },
      llm: {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        status: 'ok',
        lastSuccessAt: null,
        lastErrorKind: null,
      },
      jobs: {
        remindersStatus: 'ok',
        remindersLastRunAt: null,
        remindersOverdue: false,
        recentRuns: [],
      },
    });

    const errorWithReqId: apiModule.ApiError = new Error('Authentication service is temporarily unavailable. Please try again shortly.');
    errorWithReqId.statusCode = 503;
    errorWithReqId.requestId = 'req-trace-db-crash-99';
    vi.mocked(apiModule.loginStaff).mockRejectedValueOnce(errorWithReqId);

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'harshil.mehta@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in to workspace/i }));

    await waitFor(() => {
      expect(screen.getByText('Authentication service is temporarily unavailable. Please try again shortly.')).toBeInTheDocument();
      expect(screen.getByText('Reference: req-trace-db-crash-99')).toBeInTheDocument();
    });
  });
});
