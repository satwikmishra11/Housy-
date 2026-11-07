/**
 * @vitest-environment jsdom
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
expect.extend(matchers);
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from '../src/pages/DashboardPage.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as api from '../src/lib/api.js';
import type { SalesDashboardData } from '@housy/shared';

// Mock recharts ResponsiveContainer for JSDOM sizing compatibility
vi.mock('recharts', async () => {
  const original = await vi.importActual<Record<string, unknown>>('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="recharts-container" style={{ width: 600, height: 300 }}>
        {children}
      </div>
    ),
  };
});

describe('Sales Analytics & Executive Performance Dashboard Views', () => {
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

  const sampleDashboardData: SalesDashboardData = {
    filter: {
      period: '30d',
      from: '2026-10-08',
      to: '2026-11-06',
    },
    userRole: 'sales_head',
    summary: {
      medianFirstResponseSeconds: 150,
      medianFirstResponseFormatted: '2m 30s',
      medianResponseTargetSeconds: 300,
      unreached48hCount: 2,
      unreached48hPercent: 4.0,
      unreached48hFormatted: '4.0%',
      unreachedTargetPercent: 5.0,
      totalLeads: 50,
      chatsStarted: 40,
      contactableLeadsCount: 48,
      notContactableCount: 2,
      engagedLeads: 38,
      visitsBooked: 12,
      visitsCompleted: 6,
      visitsNoShow: 2,
      showUpRate: 0.75,
      showUpRateFormatted: '75.0%',
      leadToVisitRate: 0.12,
      leadToVisitRateFormatted: '12.0%',
      leadToVisitTargetRate: 0.08,
      leadToVisitBaselineRate: 0.06,
      isSmallSample: false,
    },
    bySource: [
      {
        source: 'property_portal',
        sourceLabel: 'Property Portal',
        leadsCount: 20,
        chatsStarted: 0,
        medianResponseSeconds: 120,
        medianResponseFormatted: '2m',
        visitsBooked: 8,
        visitsCompleted: 6,
        visitsNoShow: 1,
        bookedCount: 8,
        completedCount: 6,
        showUpRate: 0.75,
        showUpRateFormatted: '75.0%',
        spendInr: 1200000,
        costPerVisitInr: 400000,
        costPerVisitFormatted: '₹4,00,000',
        spendSource: 'Ad Spend Allocation (₹30L/mo)',
        isSmallSample: false,
      },
      {
        source: 'social_ad',
        sourceLabel: 'Social Media Ad',
        leadsCount: 15,
        chatsStarted: 0,
        medianResponseSeconds: 180,
        medianResponseFormatted: '3m',
        visitsBooked: 7,
        visitsCompleted: 5,
        visitsNoShow: 1,
        bookedCount: 7,
        completedCount: 5,
        showUpRate: 0.667,
        showUpRateFormatted: '66.7%',
        spendInr: 1000000,
        costPerVisitInr: 500000,
        costPerVisitFormatted: '₹5,00,000',
        spendSource: 'Ad Spend Allocation (₹30L/mo)',
        isSmallSample: false,
      },
      {
        source: 'website',
        sourceLabel: 'Website Enquiry',
        leadsCount: 10,
        chatsStarted: 40,
        medianResponseSeconds: 90,
        medianResponseFormatted: '1m 30s',
        visitsBooked: 6,
        visitsCompleted: 5,
        visitsNoShow: 0,
        bookedCount: 6,
        completedCount: 5,
        showUpRate: 1.0,
        showUpRateFormatted: '100.0%',
        spendInr: 300000,
        costPerVisitInr: 300000,
        costPerVisitFormatted: '₹3,00,000',
        spendSource: 'Ad Spend Allocation (₹30L/mo)',
        isSmallSample: false,
      },
      {
        source: 'hoarding_call',
        sourceLabel: 'Hoarding Phone Call',
        leadsCount: 5,
        chatsStarted: 0,
        medianResponseSeconds: 60,
        medianResponseFormatted: '1m',
        visitsBooked: 1,
        visitsCompleted: 0,
        visitsNoShow: 0,
        bookedCount: 1,
        completedCount: 0,
        showUpRate: null,
        showUpRateFormatted: '-',
        spendInr: 500000,
        costPerVisitInr: null,
        costPerVisitFormatted: '—',
        spendSource: 'Ad Spend Allocation (₹30L/mo)',
        isSmallSample: true,
      },
    ],
    funnel: [
      {
        stage: 'leads',
        stageLabel: 'Total Ingested Leads',
        count: 50,
        conversionFromPrevious: 100,
        conversionFromPreviousFormatted: '100%',
        conversionFromTotal: 100,
        conversionFromTotalFormatted: '100%',
      },
      {
        stage: 'engaged',
        stageLabel: 'Engaged Leads',
        count: 38,
        conversionFromPrevious: 76.0,
        conversionFromPreviousFormatted: '76.0%',
        conversionFromTotal: 76.0,
        conversionFromTotalFormatted: '76.0%',
      },
      {
        stage: 'booked',
        stageLabel: 'Site Visits Booked',
        count: 12,
        conversionFromPrevious: 31.6,
        conversionFromPreviousFormatted: '31.6%',
        conversionFromTotal: 24.0,
        conversionFromTotalFormatted: '24.0%',
      },
      {
        stage: 'visited',
        stageLabel: 'Visits Completed',
        count: 6,
        conversionFromPrevious: 50.0,
        conversionFromPreviousFormatted: '50.0%',
        conversionFromTotal: 12.0,
        conversionFromTotalFormatted: '12.0%',
      },
    ],
    responseTimeBySource: [
      {
        source: 'property_portal',
        sourceLabel: 'Property Portal',
        medianResponseMinutes: 2.0,
        medianResponseSeconds: 120,
        targetMinutes: 5,
      },
      {
        source: 'social_ad',
        sourceLabel: 'Social Media Ad',
        medianResponseMinutes: 3.0,
        medianResponseSeconds: 180,
        targetMinutes: 5,
      },
      {
        source: 'website',
        sourceLabel: 'Website Enquiry',
        medianResponseMinutes: 1.5,
        medianResponseSeconds: 90,
        targetMinutes: 5,
      },
      {
        source: 'hoarding_call',
        sourceLabel: 'Hoarding Phone Call',
        medianResponseMinutes: 1.0,
        medianResponseSeconds: 60,
        targetMinutes: 5,
      },
    ],
    comparison: {
      goLiveDate: '2026-10-15T00:00:00Z',
      isDemoSimulated: true,
      before: {
        medianResponseSeconds: 50400,
        medianResponseFormatted: '14h',
        unreached48hPercent: 35.5,
        unreached48hFormatted: '35.5%',
        leadToVisitRate: 0.06,
        leadToVisitFormatted: '6.0%',
        totalLeads: 50,
      },
      after: {
        medianResponseSeconds: 150,
        medianResponseFormatted: '2m 30s',
        unreached48hPercent: 0.0,
        unreached48hFormatted: '0.0%',
        leadToVisitRate: 0.08,
        leadToVisitFormatted: '8.0%',
        totalLeads: 50,
      },
    },
    calculatedAt: '2026-11-06T00:00:00.000Z',
  };

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <DashboardPage />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  };

  describe('State 1: Loading State', () => {
    it('renders skeleton loaders during data fetch', () => {
      vi.spyOn(api, 'fetchDashboardMetrics').mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);

      renderDashboard();

      expect(screen.getByTestId('dashboard-loading-skeleton')).toBeInTheDocument();
    });
  });

  describe('State 2: Error State with Retry', () => {
    it('renders ErrorState component with a working retry action', async () => {
      const mockFetch = vi
        .spyOn(api, 'fetchDashboardMetrics')
        .mockRejectedValueOnce(new Error('PostgreSQL connection timeout'))
        .mockResolvedValueOnce(sampleDashboardData);
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Sales Analytics')).toBeInTheDocument();
      });
      expect(screen.getByText('PostgreSQL connection timeout')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry request/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const titles = screen.getAllByText('Sales Analytics & Performance');
        expect(titles.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('State 3: Empty State', () => {
    it('renders EmptyState when 0 leads are recorded in the timeframe with reset action', async () => {
      const emptyData: SalesDashboardData = {
        ...sampleDashboardData,
        summary: {
          ...sampleDashboardData.summary,
          totalLeads: 0,
          engagedLeads: 0,
          visitsBooked: 0,
          visitsCompleted: 0,
          visitsNoShow: 0,
          medianFirstResponseFormatted: '-',
          unreached48hFormatted: '-',
          showUpRateFormatted: '-',
          leadToVisitRateFormatted: '-',
          isSmallSample: true,
        },
      };

      vi.spyOn(api, 'fetchDashboardMetrics').mockResolvedValue(emptyData);
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No Lead Activity in Selected Window')).toBeInTheDocument();
      });

      const resetBtn = screen.getByRole('button', { name: /reset to last 30 days/i });
      expect(resetBtn).toBeInTheDocument();
    });
  });

  describe('Loaded Dashboard Metrics & Data Visualizations', () => {
    beforeEach(() => {
      vi.spyOn(api, 'fetchDashboardMetrics').mockResolvedValue(sampleDashboardData);
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([
        { id: 'proj-1', name: 'Project 1 (The Grand Arch)' },
        { id: 'proj-2', name: 'Project 2 (Solitaire Sky)' },
      ]);
    });

    it('renders top KPI summary tiles with target benchmarks', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getAllByText(/Median First Response/).length).toBeGreaterThanOrEqual(1);
      });

      // KPI Values
      expect(screen.getAllByText('2m 30s').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('4.0%')).toBeInTheDocument();
      expect(screen.getByText('12.0%')).toBeInTheDocument();
      expect(screen.getAllByText('75.0%').length).toBeGreaterThanOrEqual(1);

      // Targets
      expect(screen.getAllByText(/Target: < 5 min/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Target: < 5\.0%/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Target: 8\.0%/).length).toBeGreaterThanOrEqual(1);

      // Volume counters
      expect(screen.getAllByText('50').length).toBeGreaterThanOrEqual(1); // Total Leads
      expect(screen.getAllByText('40').length).toBeGreaterThanOrEqual(1); // Chats Started
      expect(screen.getByText(/48 contactable/)).toBeInTheDocument();
      expect(screen.getByText(/\(2 not contactable\)/)).toBeInTheDocument();
      expect(screen.getAllByText('38').length).toBeGreaterThanOrEqual(1); // Engaged Leads
      expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1); // Visits Booked
      expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);  // Visits Completed

      // Before vs After Comparison Card
      expect(screen.getByText('AI-Assisted Transformation: Before vs After')).toBeInTheDocument();
      expect(screen.getByText('Simulated demo data')).toBeInTheDocument();
      expect(screen.getByText('14h')).toBeInTheDocument();
      expect(screen.getByText('35.5%')).toBeInTheDocument();
    });

    it('renders by-source performance breakdown table with divide-by-zero safe values', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Performance by Marketing Source')).toBeInTheDocument();
      });

      // Sources
      expect(screen.getByText('Property Portal')).toBeInTheDocument();
      expect(screen.getByText('Social Media Ad')).toBeInTheDocument();
      expect(screen.getByText('Website Enquiry')).toBeInTheDocument();
      expect(screen.getByText('Hoarding Phone Call')).toBeInTheDocument();

      // Spend and Cost per visit
      expect(screen.getByText('₹4,00,000')).toBeInTheDocument();
      expect(screen.getAllByText('₹5,00,000').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('₹3,00,000').length).toBeGreaterThanOrEqual(1);

      // Divide-by-zero safe hyphen or dash for Hoarding with 0 completed visits
      const cells = screen.getAllByRole('cell');
      const hyphenCells = cells.filter((c) => c.textContent === '-' || c.textContent?.includes('—'));
      expect(hyphenCells.length).toBeGreaterThanOrEqual(1);

      // Small sample flag
      expect(screen.getByText('Small Sample')).toBeInTheDocument();
    });

    it('renders conversion funnel stages and accessibility text alternative', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Lead Conversion Funnel')).toBeInTheDocument();
      });

      expect(screen.getByText('Total Ingested Leads')).toBeInTheDocument();
      expect(screen.getAllByText('Engaged Leads').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Site Visits Booked').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Visits Completed').length).toBeGreaterThanOrEqual(1);

      expect(screen.getByText('(76.0% from prev)')).toBeInTheDocument();
      expect(screen.getByText('(31.6% from prev)')).toBeInTheDocument();
      expect(screen.getByText('(50.0% from prev)')).toBeInTheDocument();
    });

    it('toggles "How We Calculate" modal with mathematical definitions', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /how we calculate/i }).length).toBeGreaterThanOrEqual(1);
      });

      const calcBtn = screen.getAllByRole('button', { name: /how we calculate/i })[0]!;
      fireEvent.click(calcBtn);

      expect(screen.getByText('Metric Definitions & Calculation Methodology')).toBeInTheDocument();
      expect(screen.getByText(/1\. Median First Response Time/)).toBeInTheDocument();
      expect(screen.getByText(/2\. Leads Not Reached Within 48 Hours/)).toBeInTheDocument();
      expect(screen.getByText(/3\. Visit Show-up Rate/)).toBeInTheDocument();
      expect(screen.getByText(/4\. Lead-to-Visit Conversion Rate/)).toBeInTheDocument();
      expect(screen.getByText(/5\. Cost Per Completed Site Visit/)).toBeInTheDocument();
      expect(screen.getByText(/6\. First-Touch Attribution/)).toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: /close dialog/i });
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(
          screen.queryByText('Metric Definitions & Calculation Methodology'),
        ).not.toBeInTheDocument();
      });
    });

    it('triggers CSV download when clicking "Export CSV"', async () => {
      const downloadSpy = vi.spyOn(api, 'downloadDashboardCsv').mockResolvedValue(undefined);

      renderDashboard();

      await waitFor(() => {
        const btns = screen.getAllByRole('button', { name: /export csv/i });
        expect(btns.length).toBeGreaterThanOrEqual(1);
        expect(btns[0]).not.toBeDisabled();
      });

      const exportBtn = screen.getAllByRole('button', { name: /export csv/i })[0]!;
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(downloadSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            period: '30d',
          }),
        );
      });
    });

    it('allows changing timeframes and project filters', async () => {
      const fetchSpy = vi.spyOn(api, 'fetchDashboardMetrics').mockResolvedValue(sampleDashboardData);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getAllByText(/Median First Response/).length).toBeGreaterThanOrEqual(1);
      });

      // Switch to 7 days
      fireEvent.click(screen.getByRole('button', { name: /last 7 days/i }));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            period: '7d',
          }),
        );
      });

      // Switch to Custom Range
      fireEvent.click(screen.getByRole('button', { name: /custom range/i }));
      expect(screen.getByLabelText('From:')).toBeInTheDocument();
      expect(screen.getByLabelText('To:')).toBeInTheDocument();

      // Change project filter
      const projectSelect = screen.getByLabelText(/filter by project/i);
      fireEvent.change(projectSelect, { target: { value: 'proj-1' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: 'proj-1',
          }),
        );
      });
    });
  });
});
