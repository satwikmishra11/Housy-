/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SlotPicker } from '../src/components/SlotPicker.js';
import { VisitManagePage } from '../src/pages/VisitManagePage.js';
import { VisitsPage } from '../src/pages/VisitsPage.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as api from '../src/lib/api.js';
import * as calendar from '../src/lib/calendar.js';
import type { DaySlots, VisitDetail, ExecutiveVisitItem } from '@housy/shared';

describe('Site-Visit Booking & Management Frontend Views', () => {
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
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>,
    );
  };

  const sampleDays: DaySlots[] = [
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
        {
          startsAt: '2026-11-10T05:30:00.000Z',
          endsAt: '2026-11-10T06:30:00.000Z',
          displayTime: '11:00 AM – 12:00 PM',
          availableCount: 1,
        },
      ],
    },
    {
      date: '2026-11-11',
      dayName: 'Wednesday',
      slots: [
        {
          startsAt: '2026-11-11T09:30:00.000Z',
          endsAt: '2026-11-11T10:30:00.000Z',
          displayTime: '03:00 PM – 04:00 PM',
          availableCount: 1,
        },
      ],
    },
  ];

  const sampleVisitDetail: VisitDetail = {
    id: '88888888-8888-8888-8888-888888888888',
    leadId: '11111111-1111-1111-1111-111111111111',
    leadName: 'Rajesh Shah',
    leadPhone: '+919876543210',
    leadPublicId: 'LD-58210',
    projectId: '22222222-2222-2222-2222-222222222222',
    projectName: 'Project 1 (Shela)',
    projectAddress: 'Survey No. 42, Shela, Ahmedabad, Gujarat 380058',
    lat: 23.0125,
    lng: 72.4821,
    startsAt: '2026-11-12T04:30:00.000Z', // 10:00 AM IST
    endsAt: '2026-11-12T05:30:00.000Z',   // 11:00 AM IST
    status: 'confirmed',
    executiveId: '33333333-3333-3333-3333-333333333333',
    executiveName: 'Harshil Mehta',
    executivePhone: '+919825000001',
    token: 'test-magic-token-xyz',
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
  };

  const sampleStaffVisits: { upcoming: ExecutiveVisitItem[]; awaitingOutcome: ExecutiveVisitItem[] } = {
    upcoming: [
      {
        id: 'slot-1',
        bookingId: 'booking-1',
        leadId: 'lead-1',
        leadName: 'Anil Desai',
        leadPhone: '+919898011223',
        leadPublicId: 'LD-58211',
        projectId: 'proj-1',
        projectName: 'Project 1 (Shela)',
        projectAddress: 'Shela, Ahmedabad',
        startsAt: '2026-11-20T04:30:00.000Z',
        endsAt: '2026-11-20T05:30:00.000Z',
        status: 'confirmed',
        executiveId: 'exec-1',
        executiveName: 'Harshil Mehta',
        isAwaitingOutcome: false,
        createdAt: '2026-11-05T00:00:00.000Z',
      },
    ],
    awaitingOutcome: [
      {
        id: 'slot-2',
        bookingId: 'booking-2',
        leadId: 'lead-2',
        leadName: 'Pooja Patel',
        leadPhone: '+919898033445',
        leadPublicId: 'LD-58212',
        projectId: 'proj-1',
        projectName: 'Project 1 (Shela)',
        projectAddress: 'Shela, Ahmedabad',
        startsAt: '2026-11-01T04:30:00.000Z',
        endsAt: '2026-11-01T05:30:00.000Z',
        status: 'confirmed',
        executiveId: 'exec-1',
        executiveName: 'Harshil Mehta',
        isAwaitingOutcome: true,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ],
  };

  // -------------------------------------------------------------------------
  // 1. SlotPicker Component Tests
  // -------------------------------------------------------------------------
  describe('SlotPicker Component', () => {
    it('renders date strip tabs and time chips for selected date', () => {
      const handleSelect = vi.fn();
      renderWithProviders(
        <SlotPicker
          days={sampleDays}
          onSelectSlot={handleSelect}
        />,
      );

      // Check dates in date strip
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('11')).toBeInTheDocument();

      // Check time chips for default selected date (Nov 10)
      expect(screen.getByText('10:00 AM – 11:00 AM')).toBeInTheDocument();
      expect(screen.getByText('11:00 AM – 12:00 PM')).toBeInTheDocument();

      // Check multi-executive collapsed count badge
      expect(screen.getByText('2')).toBeInTheDocument();

      // Click a slot chip
      fireEvent.click(screen.getByText('10:00 AM – 11:00 AM'));
      expect(handleSelect).toHaveBeenCalledWith(sampleDays[0]!.slots[0]);
    });

    it('switching date updates available time chips', () => {
      renderWithProviders(
        <SlotPicker
          days={sampleDays}
          onSelectSlot={vi.fn()}
        />,
      );

      // Initially shows Nov 10 slots
      expect(screen.getByText('10:00 AM – 11:00 AM')).toBeInTheDocument();

      // Switch to Nov 11
      const nov11Button = screen.getByText('11').closest('button');
      expect(nov11Button).not.toBeNull();
      fireEvent.click(nov11Button!);

      // Shows Nov 11 slots
      expect(screen.getByText('03:00 PM – 04:00 PM')).toBeInTheDocument();
    });

    it('renders loading skeleton state', () => {
      renderWithProviders(
        <SlotPicker
          days={[]}
          isLoading={true}
          onSelectSlot={vi.fn()}
        />,
      );

      expect(screen.getByLabelText('Loading available visit slots')).toBeInTheDocument();
    });

    it('renders empty state when no slots exist and shows next available date', () => {
      renderWithProviders(
        <SlotPicker
          days={[]}
          nextAvailableDate="2026-11-25T00:00:00.000Z"
          onSelectSlot={vi.fn()}
        />,
      );

      expect(screen.getByText('No slots available this week')).toBeInTheDocument();
      expect(screen.getByText(/The next available appointment date is/i)).toBeInTheDocument();
    });

    it('renders "Slot just taken" alternatives banner when slot conflict occurs', () => {
      const handleSelectAlt = vi.fn();
      renderWithProviders(
        <SlotPicker
          days={sampleDays}
          onSelectSlot={vi.fn()}
          unavailableAlternatives={[
            {
              startsAt: '2026-11-10T06:30:00.000Z',
              endsAt: '2026-11-10T07:30:00.000Z',
              displayTime: '12:00 PM – 01:00 PM',
            },
          ]}
          onSelectAlternative={handleSelectAlt}
        />,
      );

      expect(screen.getByText('That slot was just booked by another buyer')).toBeInTheDocument();
      expect(screen.getByText('12:00 PM – 01:00 PM')).toBeInTheDocument();

      fireEvent.click(screen.getByText('12:00 PM – 01:00 PM'));
      expect(handleSelectAlt).toHaveBeenCalledWith({
        startsAt: '2026-11-10T06:30:00.000Z',
        endsAt: '2026-11-10T07:30:00.000Z',
        displayTime: '12:00 PM – 01:00 PM',
      });
    });

    it('renders error state with retry button', () => {
      const handleRetry = vi.fn();
      renderWithProviders(
        <SlotPicker
          days={[]}
          error={new Error('Network error loading slots')}
          onRetry={handleRetry}
          onSelectSlot={vi.fn()}
        />,
      );

      expect(screen.getByText('Could not load visit slots')).toBeInTheDocument();
      expect(screen.getByText('Network error loading slots')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Retry Request'));
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 2. VisitManagePage Tests
  // -------------------------------------------------------------------------
  describe('VisitManagePage View', () => {
    it('fetches and displays confirmed visit details in Asia/Kolkata timezone with maps pin link', async () => {
      vi.spyOn(api, 'fetchVisitManage').mockResolvedValue(sampleVisitDetail);

      renderWithProviders(
        <MemoryRouter initialEntries={['/visit/test-magic-token-xyz']}>
          <Routes>
            <Route path="/visit/:token" element={<VisitManagePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Project 1 (Shela)')).toBeInTheDocument();
      });

      expect(screen.getByText('Survey No. 42, Shela, Ahmedabad, Gujarat 380058')).toBeInTheDocument();
      expect(screen.getByText('Harshil Mehta')).toBeInTheDocument();
      expect(screen.getByText('Rajesh Shah')).toBeInTheDocument();
      expect(screen.getByText('Reference: LD-58210')).toBeInTheDocument();

      // Check Google Maps link
      const mapsLink = screen.getByText('Open in Google Maps').closest('a');
      expect(mapsLink).toHaveAttribute(
        'href',
        'https://www.google.com/maps/search/?api=1&query=23.0125,72.4821',
      );
    });

    it('downloads .ics file on "Add to Calendar" button click', async () => {
      vi.spyOn(api, 'fetchVisitManage').mockResolvedValue(sampleVisitDetail);
      const downloadSpy = vi.spyOn(calendar, 'downloadIcsCalendar').mockImplementation(() => {});

      renderWithProviders(
        <MemoryRouter initialEntries={['/visit/test-magic-token-xyz']}>
          <Routes>
            <Route path="/visit/:token" element={<VisitManagePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Add to Calendar (.ics)')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add to Calendar (.ics)'));
      expect(downloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Site Visit: Project 1 (Shela)',
          location: 'Survey No. 42, Shela, Ahmedabad, Gujarat 380058',
          startsAt: sampleVisitDetail.startsAt,
        }),
      );
    });

    it('opens cancel modal and performs cancellation', async () => {
      vi.spyOn(api, 'fetchVisitManage').mockResolvedValue(sampleVisitDetail);
      const cancelSpy = vi.spyOn(api, 'cancelVisitBooking').mockResolvedValue({
        message: 'Visit cancelled successfully',
      });

      renderWithProviders(
        <MemoryRouter initialEntries={['/visit/test-magic-token-xyz']}>
          <Routes>
            <Route path="/visit/:token" element={<VisitManagePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Cancel Visit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel Visit'));
      expect(screen.getByText('Cancel Site Visit?')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Confirm Cancellation'));
      await waitFor(() => {
        expect(cancelSpy).toHaveBeenCalledWith('test-magic-token-xyz', undefined);
      });
    });

    it('displays error state when token is invalid', async () => {
      vi.spyOn(api, 'fetchVisitManage').mockRejectedValue(new Error('Invalid or expired magic link token'));

      renderWithProviders(
        <MemoryRouter initialEntries={['/visit/invalid-token']}>
          <Routes>
            <Route path="/visit/:token" element={<VisitManagePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Appointment Not Found')).toBeInTheDocument();
        expect(screen.getByText('Invalid or expired magic link token')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. VisitsPage (Staff "My Visits" View)
  // -------------------------------------------------------------------------
  describe('VisitsPage (Staff View)', () => {
    it('renders upcoming visits and visits awaiting attendance outcome', async () => {
      vi.spyOn(api, 'fetchStaffVisits').mockResolvedValue(sampleStaffVisits);

      renderWithProviders(
        <MemoryRouter initialEntries={['/visits']}>
          <Routes>
            <Route path="/visits" element={<VisitsPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Awaiting Attendance Outcome')).toBeInTheDocument();
      });

      // Awaiting outcome item
      expect(screen.getByText('Pooja Patel')).toBeInTheDocument();
      expect(screen.getByText('LD-58212')).toBeInTheDocument();
      expect(screen.getByText('Mark Visited')).toBeInTheDocument();
      expect(screen.getByText('Mark No-Show')).toBeInTheDocument();

      // Upcoming visit item
      expect(screen.getByText('Anil Desai')).toBeInTheDocument();
      expect(screen.getByText('LD-58211')).toBeInTheDocument();
    });

    it('opens outcome modal and successfully records "Visited"', async () => {
      vi.spyOn(api, 'fetchStaffVisits').mockResolvedValue(sampleStaffVisits);
      const outcomeSpy = vi.spyOn(api, 'recordVisitOutcome').mockResolvedValue({
        message: 'Visit outcome recorded as visited',
        status: 'completed',
      });

      renderWithProviders(
        <MemoryRouter initialEntries={['/visits']}>
          <Routes>
            <Route path="/visits" element={<VisitsPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Mark Visited')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Mark Visited'));
      expect(screen.getByText('Record Visit Outcome: Pooja Patel')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Confirm Visited'));
      await waitFor(() => {
        expect(outcomeSpy).toHaveBeenCalledWith('booking-2', {
          outcome: 'visited',
          notes: undefined,
        });
      });
    });

    it('handles empty states for both awaiting outcome and upcoming visits', async () => {
      vi.spyOn(api, 'fetchStaffVisits').mockResolvedValue({
        upcoming: [],
        awaitingOutcome: [],
      });

      renderWithProviders(
        <MemoryRouter initialEntries={['/visits']}>
          <Routes>
            <Route path="/visits" element={<VisitsPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('All visits up to date')).toBeInTheDocument();
        expect(screen.getByText('No upcoming visits')).toBeInTheDocument();
      });
    });
  });
});
