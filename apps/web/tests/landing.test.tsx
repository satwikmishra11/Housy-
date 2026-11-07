import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from '../src/pages/LandingPage.js';
import { RootRoute } from '../src/App.js';
import { AuthProvider } from '../src/context/AuthContext.js';
import { ToastProvider } from '../src/components/Toast.js';
import * as apiModule from '../src/lib/api.js';

vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual('../src/lib/api.js');
  return {
    ...actual,
    fetchMe: vi.fn(),
    loginStaff: vi.fn(),
    logoutStaff: vi.fn(),
    fetchProjects: vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          id: 'proj_1',
          name: 'The Palm Residences',
          rera_number: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        },
      ],
    }),
  };
});

describe('LandingPage Component & Navigation', () => {
  it('renders headline, dual action cards, projects, and regulatory footer', () => {
    vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <LandingPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    // Hero title & subtitle
    expect(screen.getByText(/Ahmedabad Luxury Residences/i)).toBeInTheDocument();
    expect(screen.getByText(/Guided by Verified AI Advisory/i)).toBeInTheDocument();

    // Dual action cards
    expect(screen.getByText('AI Residence Advisor')).toBeInTheDocument();
    expect(screen.getByText('Sales Executive Portal')).toBeInTheDocument();

    // Call to Action links
    expect(screen.getByRole('link', { name: /Launch Buyer Chat Experience/i })).toHaveAttribute(
      'href',
      '/chat',
    );
    expect(screen.getByRole('link', { name: /Sign In to Staff Workspace/i })).toHaveAttribute(
      'href',
      '/login',
    );

    // Demo quick login buttons
    expect(screen.getByRole('button', { name: /Sales Head/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Executive/i })).toBeInTheDocument();

    // Project showcases
    expect(screen.getByText('The Palm Serene')).toBeInTheDocument();
    expect(screen.getByText('Skyline Greens')).toBeInTheDocument();

    // Footer
    expect(screen.getByText(/RERA Registration: PR\/GJ\/AHMEDABAD/i)).toBeInTheDocument();
  });

  it('clicking demo buttons triggers login flow or redirects to login with email prefilled', async () => {
    vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<div>Staff Sign In Screen</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
    );

    const salesHeadBtn = screen.getByRole('button', { name: /Sales Head/i });
    fireEvent.click(salesHeadBtn);

    await waitFor(() => {
      expect(screen.getByText('Staff Sign In Screen')).toBeInTheDocument();
    });
  });

  describe('RootRoute Redirection & Rendering Behavior', () => {
    it('renders LandingPage at root / for unauthenticated visitors without ?src query', async () => {
      vi.mocked(apiModule.fetchMe).mockRejectedValue(new Error('Unauthenticated'));

      render(
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/']}>
              <Routes>
                <Route path="/" element={<RootRoute />} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </ToastProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Ahmedabad Luxury Residences/i)).toBeInTheDocument();
        expect(screen.getByText('AI Residence Advisor')).toBeInTheDocument();
        expect(screen.getByText('Sales Executive Portal')).toBeInTheDocument();
      });
    });

    it('redirects authenticated staff to /leads when visiting root /', async () => {
      vi.mocked(apiModule.fetchMe).mockResolvedValue({
        success: true,
        user: {
          id: 'user_1',
          email: 'amit.shah@example.com',
          name: 'Amit Shah',
          role: 'executive',
          phone: '+919876543211',
        },
      });

      render(
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/']}>
              <Routes>
                <Route path="/" element={<RootRoute />} />
                <Route path="/leads" element={<div>Staff Leads Workspace Dashboard</div>} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </ToastProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Staff Leads Workspace Dashboard')).toBeInTheDocument();
      });
    });
  });
});
