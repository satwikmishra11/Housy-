import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from '../src/components/NotificationBell.js';
import * as api from '../src/lib/api.js';

describe('NotificationBell Component & Dropdown Alignment', () => {
  beforeEach(() => {
    vi.spyOn(api, 'fetchNotifications').mockResolvedValue({
      success: true,
      notifications: [
        {
          id: 'notif-1',
          userId: 'user-1',
          type: 'handoff',
          title: 'New Lead Handoff',
          message: 'Aaranya Residency lead assigned to you',
          isRead: false,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });
  });

  it('renders closed notification trigger button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>,
      );
    });

    const button = screen.getByRole('button', { name: /notifications/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: /staff notifications/i })).not.toBeInTheDocument();
  });

  it('aligns popup to the right with left-0 right-auto when align="left"', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <NotificationBell align="left" />
        </MemoryRouter>,
      );
    });

    const button = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const popup = screen.getByRole('region', { name: /staff notifications/i });
    expect(popup).toBeInTheDocument();
    expect(popup.className).toContain('left-0');
    expect(popup.className).toContain('right-auto');
  });

  it('aligns popup to the left with right-0 left-auto when align="right"', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <NotificationBell align="right" />
        </MemoryRouter>,
      );
    });

    const button = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const popup = screen.getByRole('region', { name: /staff notifications/i });
    expect(popup).toBeInTheDocument();
    expect(popup.className).toContain('right-0');
    expect(popup.className).toContain('left-auto');
  });

  it('closes popup on Escape keypress', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <NotificationBell align="left" />
        </MemoryRouter>,
      );
    });

    const button = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(button);
    expect(screen.getByRole('region', { name: /staff notifications/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: /staff notifications/i })).not.toBeInTheDocument();
  });
});

