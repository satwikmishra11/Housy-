/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingConfirmationCard } from '../src/components/BookingConfirmationCard.js';
import { VisitManagePage } from '../src/pages/VisitManagePage.js';
import { BuyerChatPage } from '../src/pages/BuyerChatPage.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as api from '../src/lib/api.js';
import * as calendar from '../src/lib/calendar.js';

describe('Buyer-Facing UI Brand Integrity: No Generic Project Names & Dynamic Quick-Replies', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement, initialEntries = ['/']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  };

  describe('1. BookingConfirmationCard Component', () => {
    it('maps "Project 1" to "The Palm Serene" and never renders "Project 1"', () => {
      const downloadSpy = vi.spyOn(calendar, 'downloadIcsCalendar').mockReturnValue();

      const { container } = render(
        <BookingConfirmationCard
          bookingId="bkg-test-101"
          startsAt="2026-11-20T10:00:00.000Z"
          projectName="Project 1"
          executiveName="Priya Patel"
        />,
      );

      // Verify display name is rendered
      expect(screen.getByText('The Palm Serene')).toBeInTheDocument();
      // Verify generic name NEVER renders
      expect(screen.queryByText(/Project 1/i)).toBeNull();
      expect(container.textContent).not.toMatch(/\bProject 1\b/);
      expect(container.textContent).not.toMatch(/\bProject 2\b/);

      // Calendar download verification
      const calButton = screen.getByRole('button', { name: /Add to Calendar/i });
      fireEvent.click(calButton);
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      const downloadCall = downloadSpy.mock.calls[0]![0];
      expect(downloadCall.title).toContain('The Palm Serene');
      expect(downloadCall.title).not.toContain('Project 1');
    });

    it('maps "Project 2" to "Skyline Greens" and never renders "Project 2"', () => {
      const downloadSpy = vi.spyOn(calendar, 'downloadIcsCalendar').mockReturnValue();

      const { container } = render(
        <BookingConfirmationCard
          bookingId="bkg-test-102"
          startsAt="2026-11-20T10:00:00.000Z"
          projectName="Project 2"
          executiveName="Amit Shah"
        />,
      );

      expect(screen.getByText('Skyline Greens')).toBeInTheDocument();
      expect(screen.queryByText(/Project 2/i)).toBeNull();
      expect(container.textContent).not.toMatch(/\bProject 2\b/);
      expect(container.textContent).not.toMatch(/\bProject 1\b/);

      const calButton = screen.getByRole('button', { name: /Add to Calendar/i });
      fireEvent.click(calButton);
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      const downloadCall = downloadSpy.mock.calls[0]![0];
      expect(downloadCall.title).toContain('Skyline Greens');
      expect(downloadCall.title).not.toContain('Project 2');
    });

    it('defaults to "The Palm Serene" if projectName prop is omitted', () => {
      const { container } = render(
        <BookingConfirmationCard
          bookingId="bkg-test-103"
          startsAt="2026-11-20T10:00:00.000Z"
        />,
      );

      expect(screen.getByText('The Palm Serene')).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/\bProject 1\b/);
      expect(container.textContent).not.toMatch(/\bProject 2\b/);
    });
  });

  describe('2. VisitManagePage View', () => {
    it('renders "The Palm Serene" and suppresses "Project 1" in appointment details and .ics download', async () => {
      const downloadSpy = vi.spyOn(calendar, 'downloadIcsCalendar').mockReturnValue();

      vi.spyOn(api, 'fetchVisitManage').mockResolvedValue({
        id: 'bkg-manage-101',
        leadId: 'lead-1',
        leadName: 'Nishit Dave',
        leadPhone: '+919825011111',
        leadPublicId: 'LD-9901',
        projectId: 'proj-1',
        projectName: 'Project 1', // Server returns raw name
        projectAddress: 'SG Highway, Ahmedabad',
        lat: 23.03,
        lng: 72.58,
        startsAt: '2026-11-22T05:30:00.000Z',
        endsAt: '2026-11-22T06:30:00.000Z',
        status: 'confirmed',
        executiveId: 'exec-1',
        executiveName: 'Priya Patel',
        executivePhone: '+91 90000 00003',
        token: 'token-manage-101',
        createdAt: '2026-11-08T00:00:00.000Z',
        updatedAt: '2026-11-08T00:00:00.000Z',
      });

      const { container } = renderWithProviders(
        <Routes>
          <Route path="/visit/:token" element={<VisitManagePage />} />
        </Routes>,
        ['/visit/token-manage-101'],
      );

      await waitFor(() => {
        expect(screen.getByText('The Palm Serene')).toBeInTheDocument();
      });

      // Strict assertion: "Project 1" or "Project 2" must NEVER appear anywhere in DOM
      expect(screen.queryByText(/Project 1/i)).toBeNull();
      expect(screen.queryByText(/Project 2/i)).toBeNull();
      expect(container.textContent).not.toMatch(/\bProject 1\b/);
      expect(container.textContent).not.toMatch(/\bProject 2\b/);

      // Trigger calendar download
      const calButton = screen.getByRole('button', { name: /Add to Calendar/i });
      fireEvent.click(calButton);
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      const downloadCall = downloadSpy.mock.calls[0]![0];
      expect(downloadCall.title).toContain('The Palm Serene');
      expect(downloadCall.title).not.toContain('Project 1');
      expect(downloadCall.description).toContain('The Palm Serene');
      expect(downloadCall.description).not.toContain('Project 1');
    });

    it('renders "Skyline Greens" and suppresses "Project 2"', async () => {
      vi.spyOn(api, 'fetchVisitManage').mockResolvedValue({
        id: 'bkg-manage-102',
        leadId: 'lead-2',
        leadName: 'Bhavna Shah',
        leadPhone: '+919825022222',
        leadPublicId: 'LD-9902',
        projectId: 'proj-2',
        projectName: 'Project 2',
        projectAddress: 'Science City, Ahmedabad',
        lat: 23.08,
        lng: 72.50,
        startsAt: '2026-11-23T05:30:00.000Z',
        endsAt: '2026-11-23T06:30:00.000Z',
        status: 'confirmed',
        executiveId: 'exec-2',
        executiveName: 'Amit Shah',
        executivePhone: '+91 90000 00002',
        token: 'token-manage-102',
        createdAt: '2026-11-08T00:00:00.000Z',
        updatedAt: '2026-11-08T00:00:00.000Z',
      });

      const { container } = renderWithProviders(
        <Routes>
          <Route path="/visit/:token" element={<VisitManagePage />} />
        </Routes>,
        ['/visit/token-manage-102'],
      );

      await waitFor(() => {
        expect(screen.getByText('Skyline Greens')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Project 1/i)).toBeNull();
      expect(screen.queryByText(/Project 2/i)).toBeNull();
      expect(container.textContent).not.toMatch(/\bProject 1\b/);
      expect(container.textContent).not.toMatch(/\bProject 2\b/);
    });
  });

  describe('3. BuyerChatPage View & Quick-Reply I18n Recomputation', () => {
    it('uses display_name in chat header and confirmation cards, never generic Project 1 or Project 2', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([
        {
          id: 'proj-1',
          name: 'Project 1',
          displayName: 'The Palm Serene',
          display_name: 'The Palm Serene',
          rera_number: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        },
        {
          id: 'proj-2',
          name: 'Project 2',
          displayName: 'Skyline Greens',
          display_name: 'Skyline Greens',
          rera_number: 'PR/GJ/AHMEDABAD/AUDA/RAA05678/011126',
        },
      ]);

      vi.spyOn(api, 'startChat').mockResolvedValue({
        success: true,
        conversationId: 'conv-test-99',
        leadId: null,
        sessionToken: 'token-99',
        language: 'en',
        greeting: 'Welcome to Aaranya Realty.',
        quickReplies: ['Explore 2 BHK', 'Explore 3 BHK Luxury', 'Schedule a Site Visit'],
      });

      const { container } = renderWithProviders(<BuyerChatPage />);

      await waitFor(() => {
        expect(screen.getByText('The Palm Serene')).toBeInTheDocument();
      });

      // Assert header and cards contain The Palm Serene and never Project 1 / Project 2
      expect(screen.queryByText(/Project 1/i)).toBeNull();
      expect(screen.queryByText(/Project 2/i)).toBeNull();
      expect(container.textContent).not.toMatch(/\bProject 1\b/);
      expect(container.textContent).not.toMatch(/\bProject 2\b/);
    });

    it('translates default quick-replies from i18n files and recomputes chips when language switches', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([
        {
          id: 'proj-1',
          name: 'The Palm Serene',
          displayName: 'The Palm Serene',
          rera_number: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        },
      ]);

      // Server returns its own generic map, but UI translates from i18n
      vi.spyOn(api, 'startChat').mockResolvedValue({
        success: true,
        conversationId: 'conv-i18n-test',
        leadId: null,
        sessionToken: 'token-i18n',
        language: 'en',
        greeting: 'Welcome to Aaranya Realty.',
        quickReplies: ['Explore 2 BHK', 'Explore 3 BHK Luxury', 'Schedule a Site Visit'],
      });

      renderWithProviders(<BuyerChatPage />);

      // Initial English chips loaded from i18n
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Explore 2 BHK' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Explore 3 BHK Luxury' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Schedule a Site Visit' })).toBeInTheDocument();
      });

      // Switch language to Hindi
      const hindiBtn = screen.getByRole('button', { name: 'हिन्दी' });
      fireEvent.click(hindiBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '2 BHK देखें' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '3 BHK लक्ज़री देखें' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'साइट विज़िट बुक करें' })).toBeInTheDocument();
      });

      // Switch language to Gujarati
      const gujaratiBtn = screen.getByRole('button', { name: 'ગુજરાતી' });
      fireEvent.click(gujaratiBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '2 BHK જુઓ' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '3 BHK લક્ઝરી જુઓ' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'સાઇટ વિઝિટ બુક કરો' })).toBeInTheDocument();
      });

      // Switch back to English
      const englishBtn = screen.getByRole('button', { name: 'EN' });
      fireEvent.click(englishBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Explore 2 BHK' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Explore 3 BHK Luxury' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Schedule a Site Visit' })).toBeInTheDocument();
      });
    });
  });
});
