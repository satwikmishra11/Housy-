import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HealthPage } from '../src/pages/HealthPage.js';
import * as api from '../src/lib/api.js';

describe('HealthPage Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.restoreAllMocks();
  });

  const renderWithClient = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  it('renders loading state initially', () => {
    vi.spyOn(api, 'fetchHealth').mockImplementation(
      () => new Promise(() => {}), // Never resolves
    );

    renderWithClient(<HealthPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading system status/i)).toBeInTheDocument();
  });

  it('renders operational state when health check succeeds', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValue({
      status: 'ok',
      timestamp: '2026-11-05T09:30:00.000Z',
      uptimeSeconds: 300,
      environment: 'development',
      version: '1.0.0',
      database: {
        status: 'connected',
        latencyMs: 4.2,
      },
    });

    renderWithClient(<HealthPage />);

    await waitFor(() => {
      expect(screen.getByText(/Core Services Operational/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/connected/i)).toBeInTheDocument();
    expect(screen.getByText('4.2 ms')).toBeInTheDocument();
    expect(screen.getAllByText(/Asia\/Kolkata/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders error state when fetch fails', async () => {
    vi.spyOn(api, 'fetchHealth').mockRejectedValue(new Error('Network error'));

    renderWithClient(<HealthPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/failed to load system status/i)).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('renders reminders overdue alert when reminders have not run in over 10 minutes', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValue({
      status: 'degraded',
      timestamp: '2026-11-05T09:30:00.000Z',
      uptimeSeconds: 300,
      environment: 'development',
      version: '1.0.0',
      database: {
        status: 'connected',
        latencyMs: 3.1,
      },
      jobs: {
        remindersStatus: 'overdue',
        remindersLastRunAt: '2026-11-05T09:10:00.000Z',
        remindersOverdue: true,
        recentRuns: [
          {
            job: 'reminders',
            startedAt: '2026-11-05T09:09:59.000Z',
            finishedAt: '2026-11-05T09:10:00.000Z',
            ok: true,
            durationMs: 45,
            counts: { processedCount: 0 },
            error: null,
          },
        ],
      },
    });

    renderWithClient(<HealthPage />);

    await waitFor(() => {
      expect(screen.getByTestId('reminders-overdue-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('reminders-health-card')).toHaveClass('bg-rose-50/70');
    expect(screen.getByText(/Overdue \(>10m\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/reminders/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders active reminders state when jobs are fresh within 10 minutes', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValue({
      status: 'ok',
      timestamp: '2026-11-05T09:30:00.000Z',
      uptimeSeconds: 300,
      environment: 'development',
      version: '1.0.0',
      database: {
        status: 'connected',
        latencyMs: 2.5,
      },
      jobs: {
        remindersStatus: 'ok',
        remindersLastRunAt: '2026-11-05T09:28:00.000Z',
        remindersOverdue: false,
        recentRuns: [
          {
            job: 'reminders',
            startedAt: '2026-11-05T09:27:59.000Z',
            finishedAt: '2026-11-05T09:28:00.000Z',
            ok: true,
            durationMs: 22,
            counts: { sentCount: 1 },
            error: null,
          },
          {
            job: 'slot_top_up',
            startedAt: '2026-11-05T09:27:59.000Z',
            finishedAt: '2026-11-05T09:28:00.000Z',
            ok: true,
            durationMs: 48,
            counts: { insertedSlots: 14 },
            error: null,
          },
        ],
      },
    });

    renderWithClient(<HealthPage />);

    await waitFor(() => {
      expect(screen.getByText(/Active \(<10m\)/i)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('reminders-overdue-banner')).not.toBeInTheDocument();
    expect(screen.getByText('slot_top_up')).toBeInTheDocument();
  });
});

