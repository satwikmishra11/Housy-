/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChatStartResponse, ChatReply, ChatHistoryItem } from '@housy/shared';
import { BuyerChatPage } from '../src/pages/BuyerChatPage.js';
import { CollectContactCard } from '../src/components/CollectContactCard.js';
import { BookingConfirmationCard } from '../src/components/BookingConfirmationCard.js';
import { InlineSlotPickerCard } from '../src/components/InlineSlotPickerCard.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as api from '../src/lib/api.js';
import * as calendar from '../src/lib/calendar.js';
import * as i18nModule from '../src/i18n/index.js';

describe('Buyer Chat UI & Inline Interactive Components', () => {
  let queryClient: QueryClient;

  const mockStartResponse = (overrides?: Partial<ChatStartResponse>): ChatStartResponse => ({
    success: true,
    conversationId: '11111111-1111-1111-1111-111111111111',
    leadId: '22222222-2222-2222-2222-222222222222',
    sessionToken: 'mock-session-token',
    language: 'en',
    greeting: 'Welcome to The Palm Residences. How may I assist your residence search today?',
    quickReplies: ['Explore 2 BHK Floor Plans', 'Explore 3 BHK Floor Plans', 'Book a Site Visit'],
    ...overrides,
  });

  const mockChatReply = (overrides?: Partial<ChatReply>): ChatReply => ({
    text: 'The Palm Residences features an Olympic-sized pool and rooftop lounge [F12].',
    language: 'en',
    confidence: 0.95,
    citedFactIds: ['33333333-3333-3333-3333-333333333333'],
    conversationId: '11111111-1111-1111-1111-111111111111',
    quickReplies: [],
    ...overrides,
  });

  const mockHistoryItem = (overrides?: Partial<ChatHistoryItem>): ChatHistoryItem => ({
    id: '44444444-4444-4444-4444-444444444444',
    conversationId: '11111111-1111-1111-1111-111111111111',
    role: 'buyer',
    content: 'What is the starting price for 3 BHK?',
    citedFactIds: [],
    meta: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    sessionStorage.clear();
    vi.restoreAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  const renderWithProviders = (ui: React.ReactElement, initialEntries = ['/chat']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  };

  describe('CollectContactCard Component', () => {
    it('validates 10-digit Indian mobile number starting with 6-9', async () => {
      const handleSubmit = vi.fn();
      render(<CollectContactCard onSubmit={handleSubmit} />);

      const phoneInput = screen.getByLabelText(/Mobile Number/i);
      const submitButton = screen.getByRole('button', { name: /Continue to Select Slots/i });

      // Enter invalid mobile number (starts with 1)
      fireEvent.change(phoneInput, { target: { value: '1234567890' } });
      fireEvent.click(submitButton);

      expect(handleSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(/Please enter a valid 10-digit Indian mobile number/i)).toBeInTheDocument();

      // Enter valid Indian mobile number starting with 9
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(submitButton);

      expect(handleSubmit).toHaveBeenCalledTimes(1);
      expect(handleSubmit).toHaveBeenCalledWith({
        name: 'Guest Buyer',
        phone: '+919876543210',
        consent: true,
      });
    });

    it('requires DPDP consent checkbox to proceed', async () => {
      const handleSubmit = vi.fn();
      render(<CollectContactCard onSubmit={handleSubmit} initialPhone="9876543210" />);

      const consentCheckbox = screen.getByRole('checkbox');
      const submitButton = screen.getByRole('button', { name: /Continue to Select Slots/i });

      // Uncheck consent
      fireEvent.click(consentCheckbox);
      expect(consentCheckbox).not.toBeChecked();
      expect(submitButton).toBeDisabled();

      // Warning message displayed
      expect(screen.getByText(/Consent is required to reserve site visit slots/i)).toBeInTheDocument();
    });

    it('opens and closes DPDP Privacy Notice modal', async () => {
      render(<CollectContactCard onSubmit={vi.fn()} />);

      const privacyButton = screen.getByRole('button', { name: /Privacy Policy/i });
      fireEvent.click(privacyButton);

      // Verify modal content
      expect(screen.getByText(/Privacy & Data Protection Notice/i)).toBeInTheDocument();
      expect(screen.getByText(/Digital Personal Data Protection \(DPDP\) Act 2023/i)).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: /Got it/i });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText(/Privacy & Data Protection Notice/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('BookingConfirmationCard Component', () => {
    it('renders appointment details in Asia/Kolkata timezone with calendar and map link', async () => {
      const downloadSpy = vi.spyOn(calendar, 'downloadIcsCalendar').mockReturnValue();

      render(
        <BookingConfirmationCard
          bookingId="bkg-9999-uuid"
          startsAt="2026-11-10T04:30:00.000Z"
          projectName="The Palm Residences"
          executiveName="Deepak Mehta"
          address="SG Highway, Ahmedabad"
          manageToken="token-xyz"
        />,
      );

      // Verify card elements
      expect(screen.getByText(/Visit Confirmed/i)).toBeInTheDocument();
      expect(screen.getByText(/#bkg-9999/i)).toBeInTheDocument();
      expect(screen.getByText(/Deepak Mehta/i)).toBeInTheDocument();
      expect(screen.getByText(/SG Highway, Ahmedabad/i)).toBeInTheDocument();

      // Asia/Kolkata formatting for 04:30 UTC -> 10:00 AM IST
      expect(screen.getByText(/10:00 am/i)).toBeInTheDocument();

      // Google maps link
      const mapLink = screen.getByRole('link', { name: /Google Maps/i });
      expect(mapLink).toHaveAttribute('href', expect.stringContaining('https://www.google.com/maps/search/'));

      // Manage appointment link
      const manageLink = screen.getByRole('link', { name: /Manage or reschedule this appointment/i });
      expect(manageLink).toHaveAttribute('href', '/visit/token-xyz');

      // Add to calendar download
      const calButton = screen.getByRole('button', { name: /Add to Calendar/i });
      fireEvent.click(calButton);
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      expect(downloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('The Palm Residences'),
          location: 'SG Highway, Ahmedabad',
        }),
        'Site_Visit_bkg-9999.ics',
      );
    });
  });

  describe('InlineSlotPickerCard Component', () => {
    it('loads open slots and handles slot selection & confirmation', async () => {
      vi.spyOn(api, 'fetchProjectSlots').mockResolvedValue({
        days: [
          {
            date: '2026-11-10',
            dayName: 'Tuesday',
            slots: [
              {
                startsAt: '2026-11-10T04:30:00.000Z',
                endsAt: '2026-11-10T05:30:00.000Z',
                displayTime: '10:00 AM – 11:00 AM',
                availableCount: 2,
              },
            ],
          },
        ],
      });

      const handleBookSlot = vi.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <InlineSlotPickerCard projectId="11111111-1111-1111-1111-111111111111" onBookSlot={handleBookSlot} />
        </QueryClientProvider>,
      );

      // Wait for slots to load
      await waitFor(() => {
        expect(screen.getByText('10:00 AM – 11:00 AM')).toBeInTheDocument();
      });

      // Click on slot chip
      fireEvent.click(screen.getByText('10:00 AM – 11:00 AM'));

      // Confirm button appears
      const confirmButton = screen.getByRole('button', { name: /Confirm Site Visit/i });
      fireEvent.click(confirmButton);

      expect(handleBookSlot).toHaveBeenCalledWith('2026-11-10T04:30:00.000Z');
    });
  });

  describe('BuyerChatPage View', () => {
    it('initializes fresh chat session and displays greeting with quick replies', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'The Palm Residences',
          rera_number: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        },
      ]);

      vi.spyOn(api, 'startChat').mockResolvedValue(
        mockStartResponse({
          greeting: 'Welcome to The Palm Residences. How may I assist your residence search today?',
          quickReplies: ['Explore 2 BHK Floor Plans', 'Explore 3 BHK Floor Plans', 'Book a Site Visit'],
        }),
      );

      renderWithProviders(<BuyerChatPage />);

      // Greeting rendered
      await waitFor(() => {
        expect(
          screen.getByText('Welcome to The Palm Residences. How may I assist your residence search today?'),
        ).toBeInTheDocument();
      });

      // Quick replies rendered
      expect(screen.getByRole('button', { name: 'Explore 2 BHK Floor Plans' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Book a Site Visit' })).toBeInTheDocument();

      // RERA and DPDP footer rendered
      expect(screen.getByText(/PR\/GJ\/AHMEDABAD\/AUDA\/RAA01234\/011126/i)).toBeInTheDocument();
      expect(screen.getByText(/Digital Personal Data Protection \(DPDP\) Act 2023/i)).toBeInTheDocument();
    });

    it('resumes existing session when conversation ID is in sessionStorage', async () => {
      sessionStorage.setItem('housy_chat_conversation_id', '11111111-1111-1111-1111-111111111111');

      vi.spyOn(api, 'fetchProjects').mockResolvedValue([
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'The Palm Residences',
          rera_number: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        },
      ]);

      vi.spyOn(api, 'fetchChatHistory').mockResolvedValue([
        mockHistoryItem({
          id: '44444444-4444-4444-4444-444444444444',
          role: 'buyer',
          content: 'What is the starting price for 3 BHK?',
        }),
        mockHistoryItem({
          id: '55555555-5555-5555-5555-555555555555',
          role: 'assistant',
          content: '3 BHK residences start at ₹1.45 Cr onwards [F03].',
          meta: {
            quickReplies: ['View 3 BHK layout', 'Schedule a tour'],
          },
        }),
      ]);

      renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('What is the starting price for 3 BHK?')).toBeInTheDocument();
        expect(screen.getByText('3 BHK residences start at ₹1.45 Cr onwards [F03].')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'View 3 BHK layout' })).toBeInTheDocument();
    });

    it('handles user message send and assistant response stream', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'startChat').mockResolvedValue(
        mockStartResponse({
          greeting: 'Welcome to our gallery.',
        }),
      );

      const sendSpy = vi.spyOn(api, 'sendChatMessage').mockResolvedValue(
        mockChatReply({
          text: 'The Palm Residences features an Olympic-sized pool and rooftop lounge [F12].',
          quickReplies: ['Book a visit'],
        }),
      );

      renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('Welcome to our gallery.')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/Your message to the AI residence advisor/i);
      const submitBtn = screen.getByRole('button', { name: /Send message/i });

      fireEvent.change(input, { target: { value: 'What amenities are available?' } });
      fireEvent.click(submitBtn);

      // Verify user message appeared immediately
      expect(screen.getByText('What amenities are available?')).toBeInTheDocument();

      // Verify assistant replied
      await waitFor(() => {
        expect(
          screen.getByText('The Palm Residences features an Olympic-sized pool and rooftop lounge [F12].'),
        ).toBeInTheDocument();
      });

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: '11111111-1111-1111-1111-111111111111',
          message: 'What amenities are available?',
        }),
      );
    });

    it('clicking a quick reply suggestion chip sends that message', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'startChat').mockResolvedValue(
        mockStartResponse({
          greeting: 'Hello! How can I help?',
          quickReplies: ['Check Amenities'],
        }),
      );

      const sendSpy = vi.spyOn(api, 'sendChatMessage').mockResolvedValue(
        mockChatReply({
          text: 'We offer an infinity pool, tennis court, and banquet hall.',
        }),
      );

      renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('Check Amenities')).toBeInTheDocument();
      });

      const chip = screen.getByRole('button', { name: 'Check Amenities' });
      fireEvent.click(chip);

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Check Amenities',
          }),
        );
      });
    });

    it('clicking "Talk to a person" triggers human handoff', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'startChat').mockResolvedValue(
        mockStartResponse({
          greeting: 'Welcome.',
        }),
      );

      const sendSpy = vi.spyOn(api, 'sendChatMessage').mockResolvedValue(
        mockChatReply({
          text: 'A senior sales advisor has been notified and will take over this conversation shortly.',
          isHandoff: true,
        }),
      );

      renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('Welcome.')).toBeInTheDocument();
      });

      const talkToPersonBtn = screen.getByRole('button', { name: /Talk to a human sales executive/i });
      fireEvent.click(talkToPersonBtn);

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'I would like to speak directly with a sales executive.',
          }),
        );
        expect(
          screen.getByText('A senior sales advisor has been notified and will take over this conversation shortly.'),
        ).toBeInTheDocument();
      });
    });

    it('language switcher triggers language change', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'startChat').mockResolvedValue(
        mockStartResponse({
          greeting: 'Welcome.',
        }),
      );

      const changeLangSpy = vi.spyOn(i18nModule, 'changeAppLanguage').mockResolvedValue();

      renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('Welcome.')).toBeInTheDocument();
      });

      const hindiBtn = screen.getByRole('button', { name: 'हिन्दी' });
      fireEvent.click(hindiBtn);

      expect(changeLangSpy).toHaveBeenCalledWith('hi');
    });

    it('displays rate-limit notice when 429 received', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'startChat').mockResolvedValue(
        mockStartResponse({
          greeting: 'Hello.',
        }),
      );

      const error429 = new Error('Too many requests') as api.ApiError;
      error429.statusCode = 429;
      vi.spyOn(api, 'sendChatMessage').mockRejectedValue(error429);

      renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('Hello.')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/Your message to the AI residence advisor/i);
      fireEvent.change(input, { target: { value: 'Rapid message' } });
      fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/You have sent several messages recently. Please wait a moment/i),
        ).toBeInTheDocument();
      });
    });

    it('displays fallback message and notifies sales team when network fails', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      vi.spyOn(api, 'startChat').mockResolvedValue(
        mockStartResponse({
          greeting: 'Hello.',
        }),
      );

      vi.spyOn(api, 'sendChatMessage').mockRejectedValue(new Error('Network failure'));

      renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('Hello.')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/Your message to the AI residence advisor/i);
      fireEvent.change(input, { target: { value: 'Any query' } });
      fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

      await waitFor(() => {
        expect(screen.getByText(/Network failure/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
      });
      // Verifies no fabricated replies are inserted
      expect(
        screen.queryByText('A member of our team will confirm this with you shortly.'),
      ).not.toBeInTheDocument();
    });

    it('renders and executes full interactive visit booking flow with inline cards', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'The Palm Residences',
          rera_number: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        },
      ]);

      vi.spyOn(api, 'startChat').mockResolvedValue(
        mockStartResponse({
          greeting: 'Welcome! Would you like to book a tour?',
        }),
      );

      // Assistant returns uiAction: 'collect_contact'
      vi.spyOn(api, 'sendChatMessage').mockResolvedValue(
        mockChatReply({
          text: 'I would be delighted to schedule your visit. Please provide your contact details.',
          uiAction: 'collect_contact',
        }),
      );

      // Mock project slots
      vi.spyOn(api, 'fetchProjectSlots').mockResolvedValue({
        days: [
          {
            date: '2026-11-12',
            dayName: 'Thursday',
            slots: [
              {
                startsAt: '2026-11-12T05:30:00.000Z',
                endsAt: '2026-11-12T06:30:00.000Z',
                displayTime: '11:00 AM – 12:00 PM',
                availableCount: 1,
              },
            ],
          },
        ],
      });

      // Mock book visit
      const bookSpy = vi.spyOn(api, 'bookChatVisit').mockResolvedValue({
        success: true,
        bookingId: 'bkg-confirmed-123',
        message: 'Your site visit has been scheduled successfully.',
      });

      renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('Welcome! Would you like to book a tour?')).toBeInTheDocument();
      });

      // Step 1: Send request to book visit
      const input = screen.getByLabelText(/Your message to the AI residence advisor/i);
      fireEvent.change(input, { target: { value: 'I want to schedule a visit' } });
      fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

      // Step 2: CollectContactCard is rendered
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /Contact and DPDP consent form/i })).toBeInTheDocument();
      });

      // Fill in contact information
      const nameInput = screen.getByLabelText(/Your Full Name/i);
      const phoneInput = screen.getByLabelText(/Mobile Number/i);
      fireEvent.change(nameInput, { target: { value: 'Aarav Sharma' } });
      fireEvent.change(phoneInput, { target: { value: '9825012345' } });

      const submitContactBtn = screen.getByRole('button', { name: /Continue to Select Slots/i });
      fireEvent.click(submitContactBtn);

      // Step 3: InlineSlotPickerCard is rendered
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /Available Site Visit Slots/i })).toBeInTheDocument();
        expect(screen.getByText('11:00 AM – 12:00 PM')).toBeInTheDocument();
      });

      // Click slot chip
      fireEvent.click(screen.getByText('11:00 AM – 12:00 PM'));

      // Confirm Site Visit
      const confirmSlotBtn = screen.getByRole('button', { name: /Confirm Site Visit/i });
      fireEvent.click(confirmSlotBtn);

      // Step 4: Verify booking API was invoked with DPDP consent and correct payload
      await waitFor(() => {
        expect(bookSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            conversationId: '11111111-1111-1111-1111-111111111111',
            startsAt: '2026-11-12T05:30:00.000Z',
            name: 'Aarav Sharma',
            phone: '+919825012345',
            consent: true,
          }),
        );
      });

      // Step 5: BookingConfirmationCard is displayed
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /Site visit booking confirmation details/i })).toBeInTheDocument();
        expect(screen.getByText(/Visit Confirmed/i)).toBeInTheDocument();
        expect(screen.getByText(/#bkg-conf/i)).toBeInTheDocument();
      });
    });
  });
});
