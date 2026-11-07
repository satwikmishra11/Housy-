/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookingConfirmationCard } from '../src/components/BookingConfirmationCard.js';
import * as calendarModule from '../src/lib/calendar.js';

describe('BookingConfirmationCard - Named Executive Verification', () => {
  it('renders real executive name and demo phone number', () => {
    render(
      <BookingConfirmationCard
        bookingId="book-111"
        startsAt="2026-11-20T10:00:00.000Z"
        projectName="The Palm Residences"
        executiveName="Sneha Trivedi"
        executivePhone="+91 90000 00005"
      />,
    );

    expect(screen.getByText(/Host:/)).toBeInTheDocument();
    expect(screen.getByText(/Sneha Trivedi/)).toBeInTheDocument();
    expect(screen.getByText(/\+91 90000 00005/)).toBeInTheDocument();
  });

  it('fails if the generic default "Dedicated Sales Executive" ever renders', () => {
    // 1. Without props
    const { unmount } = render(
      <BookingConfirmationCard
        bookingId="book-222"
        startsAt="2026-11-20T10:00:00.000Z"
      />,
    );

    expect(screen.queryByText(/Dedicated Sales Executive/i)).toBeNull();
    // Resolves to real named executive default
    expect(screen.getByText(/Priya Patel/)).toBeInTheDocument();
    expect(screen.getByText(/\+91 90000 00003/)).toBeInTheDocument();
    unmount();

    // 2. Explicitly attempting to pass "Dedicated Sales Executive"
    render(
      <BookingConfirmationCard
        bookingId="book-333"
        startsAt="2026-11-20T10:00:00.000Z"
        executiveName="Dedicated Sales Executive"
      />,
    );

    expect(screen.queryByText(/Dedicated Sales Executive/i)).toBeNull();
    expect(screen.getByText(/Priya Patel/)).toBeInTheDocument();
  });

  it('includes host name and host phone in calendar download', () => {
    const downloadSpy = vi.spyOn(calendarModule, 'downloadIcsCalendar').mockImplementation(() => {});

    render(
      <BookingConfirmationCard
        bookingId="book-444"
        startsAt="2026-11-20T10:00:00.000Z"
        projectName="The Palm Residences"
        executiveName="Amit Shah"
        executivePhone="+91 90000 00002"
      />,
    );

    const calBtn = screen.getByRole('button', { name: /Add to Calendar/i });
    fireEvent.click(calBtn);

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const downloadCall = downloadSpy.mock.calls[0]![0];
    expect(downloadCall.description).toContain('Amit Shah');
    expect(downloadCall.description).toContain('+91 90000 00002');
  });

  it('invokes reschedule and cancel handlers directly from in-chat card', () => {
    const rescheduleSpy = vi.fn();
    const cancelSpy = vi.fn();

    render(
      <BookingConfirmationCard
        bookingId="book-555"
        startsAt="2026-11-20T10:00:00.000Z"
        onReschedule={rescheduleSpy}
        onCancel={cancelSpy}
      />,
    );

    const rescheduleBtn = screen.getByRole('button', { name: /Reschedule visit/i });
    fireEvent.click(rescheduleBtn);
    expect(rescheduleSpy).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByRole('button', { name: /Cancel visit/i });
    fireEvent.click(cancelBtn);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });
});
