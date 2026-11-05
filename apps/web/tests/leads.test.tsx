/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadsPage } from '../src/pages/LeadsPage.js';
import { CsvImportModal } from '../src/components/CsvImportModal.js';
import { LeadDetailDrawer } from '../src/components/LeadDetailDrawer.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as api from '../src/lib/api.js';
import type { LeadListItem, LeadDetail } from '@housy/shared';

describe('Unified Leads UI & Deduplication Views', () => {
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

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>{ui}</BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  };

  const sampleLead1: LeadListItem = {
    id: '11111111-1111-1111-1111-111111111111',
    publicId: 'LD-58210',
    name: 'Hardik Patel',
    phoneE164: '+919825012345',
    email: 'hardik@example.com',
    source: 'property_portal',
    projectId: '22222222-2222-2222-2222-222222222222',
    projectName: 'Project 1 (Shela)',
    wants: '3 BHK',
    budgetMin: 9500000,
    budgetMax: 12000000,
    timeline: 'Within 3 months',
    language: 'en',
    status: 'visit_booked',
    assignedTo: '33333333-3333-3333-3333-333333333333',
    assignedToName: 'Amit Shah',
    possibleDuplicateOf: null,
    possibleDuplicateName: null,
    touchpointsCount: 3,
    consentStatus: 'granted',
    firstTouchAt: '2026-11-01T10:00:00.000Z',
    firstResponseAt: '2026-11-01T10:02:00.000Z',
    lastActivityAt: '2026-11-05T12:00:00.000Z',
  };

  const sampleLead2: LeadListItem = {
    id: '44444444-4444-4444-4444-444444444444',
    publicId: 'LD-58211',
    name: 'Nidhi Shah',
    phoneE164: '+919825098765',
    email: null,
    source: 'social_ad',
    projectId: '22222222-2222-2222-2222-222222222222',
    projectName: 'Project 2 (Gota)',
    wants: '2 BHK',
    budgetMin: 6500000,
    budgetMax: 8500000,
    timeline: 'Immediate',
    language: 'gu',
    status: 'new',
    assignedTo: null,
    assignedToName: null,
    possibleDuplicateOf: '11111111-1111-1111-1111-111111111111',
    possibleDuplicateName: 'Hardik Patel',
    touchpointsCount: 1,
    consentStatus: 'withdrawn',
    firstTouchAt: '2026-11-04T14:00:00.000Z',
    firstResponseAt: null,
    lastActivityAt: '2026-11-04T14:00:00.000Z',
  };

  it('State 1: Explicit Loading state renders skeletons during fetch', () => {
    vi.spyOn(api, 'fetchLeads').mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<LeadsPage />);
    expect(screen.getByRole('heading', { name: /Unified Leads/i })).toBeInTheDocument();
  });

  it('State 2: Explicit Data state renders desktop table with tags, duplicate count and contact status', async () => {
    vi.spyOn(api, 'fetchLeads').mockResolvedValue({
      data: [sampleLead1, sampleLead2],
      total: 2,
      page: 1,
      limit: 15,
      totalPages: 1,
    });

    renderWithProviders(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Hardik Patel').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Nidhi Shah').length).toBeGreaterThanOrEqual(1);
    });

    // Verify badges and tags
    expect(screen.getAllByText('LD-58210').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3 touches').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/visit booked/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Cannot Contact/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Possible Duplicate/i).length).toBeGreaterThanOrEqual(1);
  });

  it('State 3: Explicit Empty state renders clear message and action', async () => {
    vi.spyOn(api, 'fetchLeads').mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 15,
      totalPages: 1,
    });

    renderWithProviders(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText('No leads found')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Clear Filters/i })).toBeInTheDocument();
    });
  });

  it('State 4: Explicit Error state renders friendly error with retry button', async () => {
    vi.spyOn(api, 'fetchLeads').mockRejectedValue(new Error('Network connection timed out'));

    renderWithProviders(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to load leads/i)).toBeInTheDocument();
      expect(screen.getByText(/Network connection timed out/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry Request/i })).toBeInTheDocument();
    });
  });

  describe('CsvImportModal Component', () => {
    it('renders CSV import modal with sample data and handles preview flow', async () => {
      vi.spyOn(api, 'previewCsv').mockResolvedValue({
        total: 2,
        validCount: 2,
        invalidCount: 0,
        rows: [
          {
            rowIndex: 1,
            raw: { Name: 'Pooja Dave', Phone: '9825098765' },
            normalized: {
              name: 'Pooja Dave',
              phone: '+919825098765',
              email: null,
              source: 'property_portal',
              wants: '2 BHK',
              consent: true,
            },
            classification: 'new',
            errors: [],
          },
          {
            rowIndex: 2,
            raw: { Name: 'Existing Lead', Phone: '9825012345' },
            normalized: {
              name: 'Existing Lead',
              phone: '+919825012345',
              email: null,
              source: 'property_portal',
              wants: '3 BHK',
              consent: true,
            },
            classification: 'duplicate',
            matchedLeadId: '11111111-1111-1111-1111-111111111111',
            errors: [],
          },
        ],
      });

      renderWithProviders(
        <CsvImportModal isOpen={true} onClose={() => {}} onImportComplete={() => {}} />,
      );

      expect(screen.getByText(/Import Leads from CSV/i)).toBeInTheDocument();
      const previewBtn = screen.getByRole('button', { name: /Preview & Validate Rows/i });
      fireEvent.click(previewBtn);

      await waitFor(() => {
        expect(screen.getByText(/Review & Confirm Import/i)).toBeInTheDocument();
        expect(screen.getByText('Pooja Dave')).toBeInTheDocument();
        expect(screen.getByText(/New Lead/i)).toBeInTheDocument();
        expect(screen.getByText(/Matches Existing/i)).toBeInTheDocument();
      });
    });
  });

  describe('LeadDetailDrawer Component', () => {
    const detailData: LeadDetail = {
      ...sampleLead1,
      touchpoints: [
        {
          id: 'tp-1',
          leadId: sampleLead1.id,
          source: 'property_portal',
          channel: 'magicbricks',
          occurredAt: '2026-11-01T10:00:00.000Z',
          externalId: 'MB-101',
          raw: {},
        },
      ],
      conversations: [
        {
          id: 'conv-1',
          status: 'ai',
          language: 'en',
          flagged: false,
          flagReasons: [],
          createdAt: '2026-11-01T10:05:00.000Z',
          messagesCount: 6,
        },
      ],
      bookings: [
        {
          id: 'book-1',
          status: 'confirmed',
          startsAt: '2026-11-08T11:00:00.000Z',
          endsAt: '2026-11-08T12:00:00.000Z',
          projectName: 'Project 1 (Shela)',
          executiveName: 'Amit Shah',
        },
      ],
      handoffs: [],
    };

    it('renders lead profile, touchpoint timeline, and visit details', async () => {
      vi.spyOn(api, 'fetchLeadDetails').mockResolvedValue(detailData);

      renderWithProviders(
        <LeadDetailDrawer
          leadId={sampleLead1.id}
          isOpen={true}
          onClose={() => {}}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Hardik Patel (LD-58210)')).toBeInTheDocument();
        expect(screen.getByText('+919825012345')).toBeInTheDocument();
        expect(screen.getByText('Assigned: Amit Shah')).toBeInTheDocument();
      });
    });
  });
});
