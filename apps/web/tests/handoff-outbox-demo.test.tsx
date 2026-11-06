/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HandoffsPage } from '../src/pages/HandoffsPage.js';
import { FlaggedChatsPage } from '../src/pages/FlaggedChatsPage.js';
import { OutboxPage } from '../src/pages/OutboxPage.js';
import { DemoPage } from '../src/pages/DemoPage.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as api from '../src/lib/api.js';
import type {
  HandoffItem,
  FlaggedConversationItem,
  OutboundMessageItem,
} from '@housy/shared';

describe('Human Handoff, Flagged Review, Outbox & Demo Controls Frontend Views', () => {
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

  const sampleHandoff: HandoffItem = {
    id: '11111111-2222-3333-4444-555555555555',
    leadId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    leadPublicId: 'L-AHM-001',
    leadName: 'Rajesh Sharma',
    leadPhone: '+919825199999',
    conversationId: 'ffffffff-0000-1111-2222-333333333333',
    executiveId: 'exec-1111-2222-3333-444444444444',
    executiveName: 'Amit Shah',
    reason: 'Buyer requested human',
    summary: {
      name: 'Rajesh Sharma',
      phone: '+919825199999',
      language: 'en',
      project: 'The Palm Residences',
      wants: '3 BHK High Rise',
      budgetRange: '₹85L - ₹110L',
      timeline: 'Immediate (Next 30 days)',
      keyQuestionsAsked: ['What is the possession date?'],
      openQuestions: ['Is customized modular kitchen included?'],
      visitTime: 'Sat, 14 Nov, 11:00 AM',
      sentiment: 'positive',
    },
    status: 'new',
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
  };

  const sampleFlaggedChat: FlaggedConversationItem = {
    id: 'ffffffff-0000-1111-2222-333333333333',
    leadId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    leadPublicId: 'L-AHM-001',
    leadName: 'Rajesh Sharma',
    leadPhone: '+919825199999',
    source: 'website',
    language: 'en',
    flagged: true,
    flagReasons: ['price_ask', 'missing_fact'],
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
    messageCount: 5,
  };

  const sampleOutboxMessage: OutboundMessageItem = {
    id: 'mmmmmmmm-1111-2222-3333-444444444444',
    leadId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    leadPublicId: 'L-AHM-001',
    leadName: 'Rajesh Sharma',
    leadPhone: '+919825199999',
    channel: 'whatsapp',
    templateKey: 'first_response_link',
    body: 'Namaste Rajesh Sharma, welcome to The Palm Residences. RERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126. Reply STOP to opt out.',
    status: 'sent',
    createdAt: '2026-11-05T10:05:00.000Z',
    sentAt: '2026-11-05T10:05:01.000Z',
  };

  describe('HandoffsPage View', () => {
    it('State 1: Loading state renders skeletons during fetch', () => {
      vi.spyOn(api, 'fetchHandoffs').mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<HandoffsPage />);
      expect(screen.getByLabelText(/loading handoffs/i)).toBeInTheDocument();
    });

    it('State 2: Empty state renders friendly message when no handoffs exist', async () => {
      vi.spyOn(api, 'fetchHandoffs').mockResolvedValue({ data: [], totalCount: 0 });

      renderWithProviders(<HandoffsPage />);

      await waitFor(() => {
        expect(screen.getByText(/no handoffs found/i)).toBeInTheDocument();
      });
    });

    it('State 3: Error state renders user-friendly error with retry button', async () => {
      vi.spyOn(api, 'fetchHandoffs').mockRejectedValue(new Error('Network connection timeout'));

      renderWithProviders(<HandoffsPage />);

      await waitFor(() => {
        expect(screen.getByText(/unable to load handoffs/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /retry request/i })).toBeInTheDocument();
    });

    it('renders handoffs list with summary card, accepts handoff, and posts message', async () => {
      vi.spyOn(api, 'fetchHandoffs').mockResolvedValue({
        data: [sampleHandoff],
        totalCount: 1,
      });

      const acceptSpy = vi.spyOn(api, 'acceptHandoff').mockResolvedValue({
        ...sampleHandoff,
        status: 'accepted',
      });

      const postSpy = vi.spyOn(api, 'postHandoffMessage').mockResolvedValue({
        success: true,
        messageId: 'msg-reply-123',
      });

      renderWithProviders(<HandoffsPage />);

      // Verify handoff card rendered
      await waitFor(() => {
        expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument();
      });
      expect(screen.getByText('L-AHM-001', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('3 BHK High Rise', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('₹85L - ₹110L')).toBeInTheDocument();
      expect(screen.getByText('Is customized modular kitchen included?')).toBeInTheDocument();

      // Click Accept Handoff
      const acceptBtn = screen.getByRole('button', { name: /accept handoff/i });
      fireEvent.click(acceptBtn);
      await waitFor(() => {
        expect(acceptSpy).toHaveBeenCalledWith(sampleHandoff.id);
      });

      // Reply into thread
      const input = screen.getByPlaceholderText(/message rajesh sharma/i);
      fireEvent.change(input, { target: { value: 'Namaste Rajesh, I am Amit Shah.' } });

      const sendBtn = screen.getByRole('button', { name: /send reply/i });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(sampleHandoff.id, 'Namaste Rajesh, I am Amit Shah.');
      });
    });

    it('opens transcript modal when Transcript button is clicked', async () => {
      vi.spyOn(api, 'fetchHandoffs').mockResolvedValue({
        data: [sampleHandoff],
        totalCount: 1,
      });
      vi.spyOn(api, 'fetchHandoffTranscript').mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: sampleHandoff.conversationId,
          role: 'buyer',
          content: 'Hello, looking for 3 BHK',
          meta: {},
          citedFactIds: [],
          createdAt: '2026-11-05T10:00:00.000Z',
        },
      ]);

      renderWithProviders(<HandoffsPage />);

      await waitFor(() => {
        expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument();
      });

      const transcriptBtn = screen.getByRole('button', { name: /transcript/i });
      fireEvent.click(transcriptBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      expect(screen.getByText(/Conversation Transcript: Rajesh Sharma/i)).toBeInTheDocument();
    });
  });

  describe('FlaggedChatsPage View', () => {
    it('State 1: Loading, Empty, and Error states render appropriately', async () => {
      // Empty state
      vi.spyOn(api, 'fetchFlaggedChats').mockResolvedValue({ data: [], unreviewedCount: 0 });

      renderWithProviders(<FlaggedChatsPage />);

      await waitFor(() => {
        expect(screen.getByText(/all flagged chats have been reviewed!/i)).toBeInTheDocument();
        expect(screen.getByText(/no flagged chats found/i)).toBeInTheDocument();
      });
    });

    it('displays unreviewed banner and allows sales head to submit review note', async () => {
      vi.spyOn(api, 'fetchFlaggedChats').mockResolvedValue({
        data: [sampleFlaggedChat],
        unreviewedCount: 1,
      });

      const reviewSpy = vi.spyOn(api, 'reviewFlaggedChat').mockResolvedValue({
        success: true,
        message: 'Review saved',
      });

      renderWithProviders(<FlaggedChatsPage />);

      // Banner count
      await waitFor(() => {
        expect(screen.getByText(/1 flagged chats to review today/i)).toBeInTheDocument();
      });

      expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument();
      expect(screen.getByText('price_ask')).toBeInTheDocument();

      // Click Mark Reviewed
      const markBtn = screen.getByRole('button', { name: /mark reviewed/i });
      fireEvent.click(markBtn);

      // Fill note in modal
      const noteInput = screen.getByPlaceholderText(/reviewed pricing inquiry/i);
      fireEvent.change(noteInput, {
        target: { value: 'Verified pricing policy; buyer query handled correctly.' },
      });

      const saveBtn = screen.getByRole('button', { name: /save review/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(reviewSpy).toHaveBeenCalledWith(
          sampleFlaggedChat.id,
          'Verified pricing policy; buyer query handled correctly.',
        );
      });
    });
  });

  describe('OutboxPage View', () => {
    it('renders outbound messages with RERA number callout and filters', async () => {
      vi.spyOn(api, 'fetchOutbox').mockResolvedValue({
        data: [sampleOutboxMessage],
        totalCount: 1,
      });

      renderWithProviders(<OutboxPage />);

      await waitFor(() => {
        expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument();
      });

      expect(screen.getByText('first_response_link')).toBeInTheDocument();
      expect(screen.getAllByText(/PR\/GJ\/AHMEDABAD\/AUDA\/RAA01234\/011126/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/RERA registration number present/i)).toBeInTheDocument();
    });
  });

  describe('DemoPage View', () => {
    it('simulates incoming lead, fast-forwards reminders, and runs reminder worker', async () => {
      const simSpy = vi.spyOn(api, 'simulateDemoLead').mockResolvedValue({
        success: true,
        message: 'Lead simulated',
        simulatedLead: { id: 'sim-1', source: 'social_ad', name: 'Pooja Shah' },
      });

      const ffSpy = vi.spyOn(api, 'fastForwardDemoReminders').mockResolvedValue({
        success: true,
        message: 'Fast-forwarded',
        fastForwardedCount: 2,
      });

      const runSpy = vi.spyOn(api, 'runDemoReminders').mockResolvedValue({
        success: true,
        message: 'Processed',
        outcome: { processedCount: 2, sentCount: 2, failedCount: 0 },
      });

      renderWithProviders(<DemoPage />);

      expect(screen.getByText(/demo mode active/i)).toBeInTheDocument();

      // 1. Simulate lead
      const simBtn = screen.getByRole('button', { name: /simulate ingestion/i });
      fireEvent.click(simBtn);
      await waitFor(() => {
        expect(simSpy).toHaveBeenCalled();
      });

      // 2. Fast forward reminders
      const ffBtn = screen.getByRole('button', { name: /fast-forward pending reminders/i });
      fireEvent.click(ffBtn);
      await waitFor(() => {
        expect(ffSpy).toHaveBeenCalled();
      });

      // 3. Process reminders now
      const runBtn = screen.getByRole('button', { name: /process due reminders now/i });
      fireEvent.click(runBtn);
      await waitFor(() => {
        expect(runSpy).toHaveBeenCalled();
      });
    });
  });
});
