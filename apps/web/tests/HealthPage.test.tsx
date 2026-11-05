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
    expect(screen.getByText(/Asia\/Kolkata/i)).toBeInTheDocument();
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
});

