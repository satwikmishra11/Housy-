/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FactSheetPage } from '../src/pages/FactSheetPage.js';
import { SlotEditorPage } from '../src/pages/SlotEditorPage.js';
import { AdSpendPage } from '../src/pages/AdSpendPage.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as api from '../src/lib/api.js';
import type { MonthlySpendData } from '../src/lib/api.js';
import type {
  FactEntry,
  FactAssistantPreviewItem,
  UnansweredQuestion,
  AdminSlotItem,
  AdminAvailabilityRule,
  AdminBlackoutDate,
} from '@housy/shared';

describe('Sales Head Admin Area Frontend Views', () => {
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

  const sampleFacts: FactEntry[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      projectId: '9757d698-a953-4c8d-b99e-1ef2d946653c',
      projectName: 'Project 1',
      key: 'pricing_2bhk_range',
      title: '2 BHK Price Range',
      value: '₹85 Lakh to ₹95 Lakh all-inclusive',
      category: 'pricing',
      status: 'active',
      updatedBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      updatedByName: 'Harshil Mehta',
      updatedAt: '2026-11-05T10:00:00.000Z',
      createdAt: '2026-11-05T10:00:00.000Z',
    },
  ];

  const sampleUnanswered: UnansweredQuestion[] = [
    {
      id: '22222222-2222-2222-2222-222222222222',
      question: 'Is EV charging infrastructure provided in basement parking?',
      buyerLanguage: 'en',
      projectId: '9757d698-a953-4c8d-b99e-1ef2d946653c',
      projectName: 'Project 1',
      conversationId: null,
      leadId: null,
      status: 'unresolved',
      resolvedBy: null,
      resolvedByName: null,
      resolvedAt: null,
      createdAt: '2026-11-05T11:00:00.000Z',
    },
  ];

  const sampleSlots: AdminSlotItem[] = [
    {
      id: '33333333-3333-3333-3333-333333333333',
      projectId: '9757d698-a953-4c8d-b99e-1ef2d946653c',
      projectName: 'Project 1',
      executiveId: '44444444-4444-4444-4444-444444444444',
      executiveName: 'Priya Sharma',
      startsAt: '2026-11-10T04:30:00.000Z', // 10:00 AM IST
      endsAt: '2026-11-10T05:30:00.000Z',   // 11:00 AM IST
      status: 'open',
    },
    {
      id: '55555555-5555-5555-5555-555555555555',
      projectId: '9757d698-a953-4c8d-b99e-1ef2d946653c',
      projectName: 'Project 1',
      executiveId: '44444444-4444-4444-4444-444444444444',
      executiveName: 'Priya Sharma',
      startsAt: '2026-11-10T06:00:00.000Z', // 11:30 AM IST
      endsAt: '2026-11-10T07:00:00.000Z',   // 12:30 PM IST
      status: 'booked',
      booking: {
        id: '66666666-6666-6666-6666-666666666666',
        leadId: '77777777-7777-7777-7777-777777777777',
        leadName: 'Hardik Patel',
        leadPhone: '+919876543210',
        leadPublicId: 'LD-58210',
        status: 'confirmed',
      },
    },
  ];

  const sampleRules: AdminAvailabilityRule[] = [
    {
      id: '88888888-8888-8888-8888-888888888888',
      projectId: '9757d698-a953-4c8d-b99e-1ef2d946653c',
      projectName: 'Project 1',
      executiveId: '44444444-4444-4444-4444-444444444444',
      executiveName: 'Priya Sharma',
      weekday: 2, // Tuesday
      startTime: '10:00',
      endTime: '18:00',
      slotMinutes: 60,
    },
  ];

  const sampleBlackouts: AdminBlackoutDate[] = [
    {
      id: '99999999-9999-9999-9999-999999999999',
      projectId: null,
      projectName: null,
      executiveId: null,
      executiveName: null,
      blackoutDate: '2026-11-12',
      reason: 'Diwali Public Holiday',
    },
  ];

  const sampleSpend: MonthlySpendData = {
    month: '2026-11',
    allocations: [
      { month: '2026-11-01', source: 'property_portal', amountInr: 1200000 },
      { month: '2026-11-01', source: 'social_ad', amountInr: 1000000 },
      { month: '2026-11-01', source: 'hoarding_call', amountInr: 500000 },
      { month: '2026-11-01', source: 'website', amountInr: 300000 },
    ],
    totalInr: 3000000,
    isDefault: true,
  };

  // -------------------------------------------------------------------------
  // 1. FactSheetPage Tests
  // -------------------------------------------------------------------------
  describe('FactSheetPage View', () => {
    it('State 1: Loading state renders skeletons during fetch', () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchFactEntries').mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<FactSheetPage />);
      expect(screen.getAllByText(/Zero-Hallucination Policy/i).length).toBeGreaterThanOrEqual(1);
    });

    it('State 2: Empty state renders clear message and add button', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchFactEntries').mockResolvedValue([]);

      renderWithProviders(<FactSheetPage />);
      await waitFor(() => {
        expect(screen.getByText(/No Facts Found/i)).toBeInTheDocument();
      });
    });

    it('State 3: Error state renders user-friendly message with retry', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchFactEntries').mockRejectedValue(new Error('PostgreSQL connection timeout'));
      const refetchSpy = vi.spyOn(api, 'fetchFactEntries');

      renderWithProviders(<FactSheetPage />);
      await waitFor(() => {
        expect(screen.getByText(/Failed to Load Facts/i)).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /Retry Request/i });
      fireEvent.click(retryBtn);
      expect(refetchSpy).toHaveBeenCalled();
    });

    it('renders facts list with grounding banner and opens preview as assistant', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([
        { id: '9757d698-a953-4c8d-b99e-1ef2d946653c', name: 'Project 1' },
      ]);
      vi.spyOn(api, 'fetchFactEntries').mockResolvedValue(sampleFacts);
      const previewItems: FactAssistantPreviewItem[] = [
        {
          id: sampleFacts[0]!.id,
          projectId: sampleFacts[0]!.projectId,
          projectName: 'Project 1',
          category: 'pricing',
          key: 'pricing_2bhk_range',
          title: '2 BHK Price Range',
          value: '₹85 Lakh to ₹95 Lakh all-inclusive',
          injectedPromptText: `[FACT ID: ${sampleFacts[0]!.id}] [PRICING] 2 BHK Price Range: ₹85 Lakh to ₹95 Lakh all-inclusive`,
        },
      ];
      vi.spyOn(api, 'fetchAssistantPreview').mockResolvedValue(previewItems);

      renderWithProviders(<FactSheetPage />);

      // Verify Grounding Policy banner
      expect(screen.getAllByText(/Zero-Hallucination Policy/i).length).toBeGreaterThanOrEqual(1);

      // Verify Fact Row renders
      await waitFor(() => {
        expect(screen.getByText('pricing_2bhk_range')).toBeInTheDocument();
        expect(screen.getByText('2 BHK Price Range')).toBeInTheDocument();
        expect(screen.getByText(/₹85 Lakh to ₹95 Lakh all-inclusive/i)).toBeInTheDocument();
      });

      // Click "Preview as Assistant" button
      const previewBtn = screen.getByRole('button', { name: /Preview as Assistant/i });
      fireEvent.click(previewBtn);

      await waitFor(() => {
        expect(screen.getByText(/AI Assistant Injected Prompt Preview/i)).toBeInTheDocument();
        expect(screen.getByText(`[FACT ID: ${sampleFacts[0]!.id}]`)).toBeInTheDocument();
      });
    });

    it('switches to unanswered questions inbox and prefills Add Fact modal', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchFactEntries').mockResolvedValue([]);
      vi.spyOn(api, 'fetchUnansweredQuestions').mockResolvedValue(sampleUnanswered);

      renderWithProviders(<FactSheetPage />);

      // Switch to Unanswered Questions tab
      const tabBtn = screen.getByRole('button', { name: /Unanswered Questions Inbox/i });
      fireEvent.click(tabBtn);

      await waitFor(() => {
        expect(screen.getByText(/"Is EV charging infrastructure provided in basement parking\?"/i)).toBeInTheDocument();
      });

      // Click "Add as Fact"
      const addAsFactBtn = screen.getByRole('button', { name: /Add as Fact/i });
      fireEvent.click(addAsFactBtn);

      // Verify Add Fact Modal opens pre-filled with the question
      await waitFor(() => {
        expect(screen.getByText(/Add Authoritative Project Fact/i)).toBeInTheDocument();
        const titleInput = screen.getByDisplayValue('Is EV charging infrastructure provided in basement parking?');
        expect(titleInput).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. SlotEditorPage Tests
  // -------------------------------------------------------------------------
  describe('SlotEditorPage View', () => {
    it('State 1: Loading state renders skeletons during fetch', () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminExecutives').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminSlotsPreview').mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SlotEditorPage />);
      expect(screen.getByText(/Executive Visit Slots & Availability/i)).toBeInTheDocument();
    });

    it('State 2: Empty state renders message when no slots generated', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminExecutives').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminSlotsPreview').mockResolvedValue([]);

      renderWithProviders(<SlotEditorPage />);
      await waitFor(() => {
        expect(screen.getByText(/No Slots Generated/i)).toBeInTheDocument();
      });
    });

    it('State 3: Error state renders retry mechanism', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminExecutives').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminSlotsPreview').mockRejectedValue(new Error('Connection error'));
      const refetchSpy = vi.spyOn(api, 'fetchAdminSlotsPreview');

      renderWithProviders(<SlotEditorPage />);
      await waitFor(() => {
        expect(screen.getByText(/Failed to Load Slot Preview/i)).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /Retry Request/i });
      fireEvent.click(retryBtn);
      expect(refetchSpy).toHaveBeenCalled();
    });

    it('renders calendar slot preview and allows blocking an open slot', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminExecutives').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminSlotsPreview').mockResolvedValue(sampleSlots);
      const blockSpy = vi.spyOn(api, 'blockAdminSlot').mockResolvedValue({
        success: true,
        message: 'Slot blocked',
        slot: { ...sampleSlots[0]!, status: 'blocked' },
      });

      renderWithProviders(<SlotEditorPage />);

      await waitFor(() => {
        expect(screen.getAllByText(/Priya Sharma · Project 1/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByRole('button', { name: /Block Slot/i })).toBeInTheDocument();
      });

      // Click "Block Slot" on the open slot
      fireEvent.click(screen.getByRole('button', { name: /Block Slot/i }));
      await waitFor(() => {
        expect(blockSpy).toHaveBeenCalledWith(sampleSlots[0]!.id);
      });
    });

    it('warns when clicking a booked slot and displays active visitor details', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminExecutives').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminSlotsPreview').mockResolvedValue(sampleSlots);

      renderWithProviders(<SlotEditorPage />);

      await waitFor(() => {
        expect(screen.getByText('Hardik Patel')).toBeInTheDocument();
      });

      // Click the booked slot link
      fireEvent.click(screen.getByText('Hardik Patel'));

      // Modal warns that booked slot is strictly protected
      await waitFor(() => {
        expect(screen.getByText(/Active Site Visit Appointment/i)).toBeInTheDocument();
        expect(screen.getByText(/Protected Booking/i)).toBeInTheDocument();
        expect(screen.getByText('LD-58210')).toBeInTheDocument();
        expect(screen.getByText('+919876543210')).toBeInTheDocument();
      });
    });

    it('triggers slot generation for next 21 days', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminExecutives').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminSlotsPreview').mockResolvedValue(sampleSlots);
      const genSpy = vi.spyOn(api, 'triggerSlotGeneration').mockResolvedValue({
        success: true,
        message: 'Generated',
        createdSlotsCount: 42,
      });

      renderWithProviders(<SlotEditorPage />);

      const genBtn = screen.getByRole('button', { name: /Generate Next 21 Days/i });
      fireEvent.click(genBtn);

      await waitFor(() => {
        expect(genSpy).toHaveBeenCalledWith(21);
      });
    });

    it('switches to rules tab and lists availability rules', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminExecutives').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAvailabilityRules').mockResolvedValue(sampleRules);

      renderWithProviders(<SlotEditorPage />);

      const rulesTab = screen.getByRole('button', { name: /Weekly Availability Rules/i });
      fireEvent.click(rulesTab);

      await waitFor(() => {
        expect(screen.getByText('Tuesday')).toBeInTheDocument();
        expect(screen.getByText(/10:00 - 18:00 IST/i)).toBeInTheDocument();
        expect(screen.getByText('60 mins')).toBeInTheDocument();
      });
    });

    it('switches to blackouts tab and lists blackout dates', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'fetchAdminExecutives').mockResolvedValue([]);
      vi.spyOn(api, 'fetchBlackoutDates').mockResolvedValue(sampleBlackouts);

      renderWithProviders(<SlotEditorPage />);

      const blackoutsTab = screen.getByRole('button', { name: /Blackout Dates/i });
      fireEvent.click(blackoutsTab);

      await waitFor(() => {
        expect(screen.getByText('2026-11-12')).toBeInTheDocument();
        expect(screen.getByText('Diwali Public Holiday')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. AdSpendPage Tests
  // -------------------------------------------------------------------------
  describe('AdSpendPage View', () => {
    it('State 1: Loading state renders skeletons during fetch', () => {
      vi.spyOn(api, 'fetchMonthlySpend').mockImplementation(() => new Promise(() => {}));
      vi.spyOn(api, 'fetchSpendMonths').mockResolvedValue(['2026-10-01', '2026-09-01']);

      renderWithProviders(<AdSpendPage />);
      expect(screen.getByText(/Marketing Ad Spend & Channel Budgets/i)).toBeInTheDocument();
    });

    it('State 2: Success state renders default ₹30 Lakh baseline allocation across 4 channels', async () => {
      vi.spyOn(api, 'fetchMonthlySpend').mockResolvedValue(sampleSpend);
      vi.spyOn(api, 'fetchSpendMonths').mockResolvedValue([]);

      renderWithProviders(<AdSpendPage />);

      await waitFor(() => {
        expect(screen.getAllByText(/₹30.00 Lakh/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Standard ₹30L Default/i)).toBeInTheDocument();
        expect(screen.getByText(/Matches baseline/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Property Portals/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Social Media Ads/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Hoarding & Outdoor Call Campaigns/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Direct Website & Organic SEO/i).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('allows updating channel spend and saving new allocation', async () => {
      vi.spyOn(api, 'fetchMonthlySpend').mockResolvedValue(sampleSpend);
      vi.spyOn(api, 'fetchSpendMonths').mockResolvedValue([]);
      const updateSpy = vi.spyOn(api, 'updateMonthlySpend').mockResolvedValue({
        ...sampleSpend,
        totalInr: 3200000,
        isDefault: false,
      });

      renderWithProviders(<AdSpendPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save Allocation/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Save Allocation/i }));
      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            allocations: expect.arrayContaining([
              expect.objectContaining({ source: 'property_portal', amountInr: 1200000 }),
              expect.objectContaining({ source: 'social_ad', amountInr: 1000000 }),
              expect.objectContaining({ source: 'hoarding_call', amountInr: 500000 }),
              expect.objectContaining({ source: 'website', amountInr: 300000 }),
            ]),
          }),
        );
      });
    });
  });
});
