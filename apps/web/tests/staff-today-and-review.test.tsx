/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExecutiveTodayPage } from '../src/pages/ExecutiveTodayPage.js';
import { DailyReviewPage } from '../src/pages/DailyReviewPage.js';
import { LeadDetailDrawer } from '../src/components/LeadDetailDrawer.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as api from '../src/lib/api.js';
import type {
  ExecutiveTodaySummary,
  DailyReviewSummary,
  LeadDetail,
} from '@housy/shared';

describe('Staff Side: Executive Today & Sales Head Daily Review', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
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

  describe('ExecutiveTodayPage', () => {
    const mockTodayData: ExecutiveTodaySummary = {
      visitsToday: [
        {
          bookingId: 'b-today-1',
          startsAt: '2026-11-08T10:00:00.000Z',
          endsAt: '2026-11-08T11:00:00.000Z',
          status: 'confirmed',
          leadId: 'lead-1',
          leadName: 'Hardik Patel',
          leadPhone: '+919825012345',
          projectName: 'The Palm Serene',
          notes: 'High floor preferred',
        },
      ],
      awaitingOutcome: [
        {
          bookingId: 'b-past-1',
          startsAt: '2026-11-07T14:00:00.000Z',
          endsAt: '2026-11-07T15:00:00.000Z',
          status: 'confirmed',
          leadId: 'lead-2',
          leadName: 'Kavita Joshi',
          leadPhone: '+919825099999',
          projectName: 'Skyline Greens',
        },
      ],
      newHandoffs: [
        {
          handoffId: 'h-1',
          conversationId: 'c-1',
          leadId: 'lead-3',
          leadName: 'Nidhi Shah',
          leadPhone: '+919825011111',
          projectName: 'The Palm Serene',
          reason: 'Buyer requested live human agent',
          summary: {},
          priority: 'urgent',
          createdAt: '2026-11-08T09:30:00.000Z',
        },
      ],
      unansweredLeads: [
        {
          leadId: 'lead-4',
          publicId: 'LD-59001',
          name: 'Chirag Desai',
          phoneE164: '+919825022222',
          source: 'property_portal',
          projectName: 'The Palm Serene',
          firstTouchAt: '2026-11-08T06:00:00.000Z',
          hoursElapsed: 3.5,
          consentStatus: 'granted',
        },
      ],
      summaryCounts: {
        visitsToday: 1,
        awaitingOutcome: 1,
        newHandoffs: 1,
        unansweredLeads: 1,
      },
    };

    it('renders all four priority queues and stat counts', async () => {
      vi.spyOn(api, 'fetchExecutiveTodaySummary').mockResolvedValue(mockTodayData);

      renderWithProviders(<ExecutiveTodayPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Executive Today' })).toBeInTheDocument();
        expect(screen.getAllByText(/Visits Scheduled Today/i).length).toBeGreaterThan(0);
        expect(screen.getByText('Hardik Patel')).toBeInTheDocument();
        expect(screen.getByText('Kavita Joshi')).toBeInTheDocument();
        expect(screen.getByText('Nidhi Shah')).toBeInTheDocument();
        expect(screen.getByText('Chirag Desai')).toBeInTheDocument();
      });
    });

    it('allows executive to mark visit attendance outcome directly', async () => {
      vi.spyOn(api, 'fetchExecutiveTodaySummary').mockResolvedValue(mockTodayData);
      const recordSpy = vi.spyOn(api, 'recordVisitOutcome').mockResolvedValue({
        message: 'Outcome recorded',
        status: 'visited',
      });

      renderWithProviders(<ExecutiveTodayPage />);

      await waitFor(() => {
        expect(screen.getByText('Mark Visited')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Mark Visited'));

      await waitFor(() => {
        expect(recordSpy).toHaveBeenCalledWith('b-past-1', { outcome: 'visited' });
      });
    });

    it('allows executive to accept new handoff directly', async () => {
      vi.spyOn(api, 'fetchExecutiveTodaySummary').mockResolvedValue(mockTodayData);
      const acceptSpy = vi.spyOn(api, 'acceptHandoff').mockResolvedValue({
        id: 'h-1',
        conversationId: 'c-1',
        leadId: 'lead-3',
        leadPublicId: 'L-AHM-003',
        leadName: 'Nidhi Shah',
        leadPhone: '+919825011111',
        reason: 'Buyer requested live human agent',
        summary: {
          name: 'Nidhi Shah',
          phone: '+919825011111',
          language: 'en',
          project: 'The Palm Serene',
          wants: '3 BHK',
          budgetRange: '₹1 Cr - ₹1.5 Cr',
          timeline: 'Next 30 days',
          keyQuestionsAsked: ['Possession date?'],
          openQuestions: [],
          visitTime: null,
          sentiment: 'neutral',
        },
        priority: 'urgent',
        isEscalated: false,
        createdAt: '2026-11-08T09:30:00.000Z',
        status: 'accepted',
        executiveId: 'exec-1',
        executiveName: 'Amit Shah',
        updatedAt: '2026-11-08T09:35:00.000Z',
      });

      renderWithProviders(<ExecutiveTodayPage />);

      await waitFor(() => {
        expect(screen.getByText('Accept Handoff')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Accept Handoff'));

      await waitFor(() => {
        expect(acceptSpy).toHaveBeenCalledWith('h-1');
      });
    });
  });

  describe('DailyReviewPage', () => {
    const mockDailyReview: DailyReviewSummary = {
      flaggedChats: [
        {
          id: 'c-flagged-1',
          leadId: 'lead-1',
          leadPublicId: 'LD-58210',
          leadName: 'Hardik Patel',
          language: 'en',
          flagReasons: ['price_negotiation'],
          createdAt: '2026-11-07T18:00:00.000Z',
        },
      ],
      unansweredQuestions: [
        {
          id: 'uq-1',
          question: 'Are EV charging slots provided in the basement?',
          buyerLanguage: 'en',
          projectName: 'The Palm Serene',
          createdAt: '2026-11-07T16:00:00.000Z',
          status: 'unresolved',
        },
      ],
      escalatedHandoffs: [
        {
          id: 'h-esc-1',
          conversationId: 'c-esc-1',
          leadId: 'lead-3',
          leadName: 'Nidhi Shah',
          executiveName: 'Amit Shah',
          reason: 'Price discount inquiry beyond fact sheet',
          priority: 'urgent',
          createdAt: '2026-11-08T08:00:00.000Z',
          minutesWaiting: 28,
        },
      ],
      unreachedLeads: [
        {
          id: 'lead-unreached-1',
          publicId: 'LD-58100',
          name: 'Bhavin Mehta',
          phoneE164: '+919825033333',
          source: 'property_portal',
          projectName: 'The Palm Serene',
          firstTouchAt: '2026-11-05T10:00:00.000Z',
          daysBreached: 2,
        },
      ],
      counts: {
        flaggedChats: 1,
        unansweredQuestions: 1,
        escalatedHandoffs: 1,
        unreachedLeads: 1,
      },
    };

    it('renders daily review queue cards and 1-click CSV export', async () => {
      vi.spyOn(api, 'fetchDailyReviewSummary').mockResolvedValue(mockDailyReview);
      const csvSpy = vi.spyOn(api, 'downloadDailyReviewCsv').mockResolvedValue();

      renderWithProviders(<DailyReviewPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Daily Review Queue/i })).toBeInTheDocument();
        expect(screen.getByText(/Are EV charging slots provided in the basement/i)).toBeInTheDocument();
        expect(screen.getByText('28 mins waiting')).toBeInTheDocument();
        expect(screen.getByText('Bhavin Mehta')).toBeInTheDocument();
      });

      const exportBtn = screen.getByText('1-Click CSV Export');
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(csvSpy).toHaveBeenCalled();
      });
    });
  });

  describe('LeadDetailDrawer Enhancements', () => {
    const detailData: LeadDetail = {
      id: 'lead-100',
      publicId: 'LD-58210',
      name: 'Hardik Patel',
      phoneE164: '+919825012345',
      email: 'hardik@example.com',
      source: 'property_portal',
      projectId: 'proj-1',
      projectName: 'The Palm Serene',
      wants: '3 BHK',
      budgetMin: 9500000,
      budgetMax: 12000000,
      timeline: '3 months',
      language: 'en',
      status: 'engaged',
      assignedTo: 'exec-1',
      assignedToName: 'Amit Shah',
      possibleDuplicateOf: null,
      possibleDuplicateName: null,
      touchpointsCount: 3,
      consentStatus: 'granted',
      firstTouchAt: '2026-11-01T10:00:00.000Z',
      firstResponseAt: '2026-11-01T10:02:00.000Z',
      lastActivityAt: '2026-11-08T11:00:00.000Z',
      notes: [
        {
          id: 'note-1',
          leadId: 'lead-100',
          authorId: 'exec-1',
          authorName: 'Amit Shah',
          note: 'Buyer prefers east-facing unit with clubhouse view.',
          createdAt: '2026-11-02T14:30:00.000Z',
        },
      ],
      touchpoints: [
        {
          id: 'tp-1',
          leadId: 'lead-100',
          source: 'property_portal',
          channel: 'magicbricks',
          occurredAt: '2026-11-01T10:00:00.000Z',
          externalId: 'MB-101',
          raw: {},
        },
      ],
      conversations: [],
      bookings: [],
      handoffs: [],
    };

    it('renders DPDP consent badge, Next Best Action recommendation, and notes', async () => {
      vi.spyOn(api, 'fetchLeadDetails').mockResolvedValue(detailData);

      renderWithProviders(
        <LeadDetailDrawer
          leadId="lead-100"
          isOpen={true}
          onClose={() => {}}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/DPDP Consented/i)).toBeInTheDocument();
        expect(screen.getByText('Propose Weekend Site Visit')).toBeInTheDocument();
      });

      // Switch to notes tab
      const notesTab = screen.getByText(/Staff Notes \(1\)/i);
      fireEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByText('Buyer prefers east-facing unit with clubhouse view.')).toBeInTheDocument();
        expect(screen.getByText('Amit Shah')).toBeInTheDocument();
      });
    });

    it('allows updating lead status directly from the drawer', async () => {
      vi.spyOn(api, 'fetchLeadDetails').mockResolvedValue(detailData);
      const updateStatusSpy = vi.spyOn(api, 'updateLeadStatus').mockResolvedValue({
        id: 'lead-100',
        status: 'visit_booked',
      });

      renderWithProviders(
        <LeadDetailDrawer
          leadId="lead-100"
          isOpen={true}
          onClose={() => {}}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Lead Status')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Lead Status'), { target: { value: 'visit_booked' } });

      await waitFor(() => {
        expect(updateStatusSpy).toHaveBeenCalledWith('lead-100', 'visit_booked');
      });
    });
  });
});
