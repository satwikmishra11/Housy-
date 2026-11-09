import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BuyerLayout } from '../src/layouts/BuyerLayout.js';
import { StaffLayout } from '../src/layouts/StaffLayout.js';
import '../src/i18n/index.js';

describe('Application Shell Layouts', () => {
  describe('BuyerLayout', () => {
    it('renders single centered column with RERA and DPDP footer', () => {
      render(
        <BuyerLayout projectName="Project 1">
          <div>Buyer Chat Window</div>
        </BuyerLayout>,
      );

      expect(screen.getByText('Buyer Chat Window')).toBeInTheDocument();
      expect(screen.getByText(/Project 1/i)).toBeInTheDocument();
      expect(screen.getByText(/RERA/i)).toBeInTheDocument();
      expect(screen.getByText(/DPDP/i)).toBeInTheDocument();
    });
  });

  describe('StaffLayout', () => {
    it('renders desktop sidebar with navigation and role badge', () => {
      render(
        <MemoryRouter initialEntries={['/leads']}>
          <StaffLayout userRole="sales_head" userName="Harshil Mehta">
            <div>Staff Dashboard Content</div>
          </StaffLayout>
        </MemoryRouter>,
      );

      expect(screen.getByText('Staff Dashboard Content')).toBeInTheDocument();
      expect(screen.getAllByText('Unified Leads').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Harshil Mehta').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Sales Head (Admin)').length).toBeGreaterThan(0);
    });

    it('renders all administrative navigation items for sales_head (Admin)', () => {
      render(
        <MemoryRouter initialEntries={['/leads']}>
          <StaffLayout userRole="sales_head" userName="Harshil Mehta">
            <div>Admin Content</div>
          </StaffLayout>
        </MemoryRouter>,
      );

      expect(screen.getAllByText('Daily Review').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Flagged Chats').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Fact Sheet').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Slot Availability').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Monthly Ad Spend').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Demo Controls').length).toBeGreaterThan(0);
      expect(screen.getAllByText('System Health').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Design System').length).toBeGreaterThan(0);
    });

    it('strictly hides all restricted admin controls from sales executive (Amit Shah)', () => {
      render(
        <MemoryRouter initialEntries={['/leads']}>
          <StaffLayout userRole="executive" userName="Amit Shah">
            <div>Executive Content</div>
          </StaffLayout>
        </MemoryRouter>,
      );

      // Permitted executive navigation items
      expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Unified Leads').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Handoffs').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Site Visits').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Sales Dashboard').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Message Outbox').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Amit Shah').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Sales Executive').length).toBeGreaterThan(0);

      // Restricted admin items MUST NOT be rendered
      expect(screen.queryByText('Daily Review')).not.toBeInTheDocument();
      expect(screen.queryByText('Flagged Chats')).not.toBeInTheDocument();
      expect(screen.queryByText('Fact Sheet')).not.toBeInTheDocument();
      expect(screen.queryByText('Slot Availability')).not.toBeInTheDocument();
      expect(screen.queryByText('Monthly Ad Spend')).not.toBeInTheDocument();
      expect(screen.queryByText('Demo Controls')).not.toBeInTheDocument();
      expect(screen.queryByText('System Health')).not.toBeInTheDocument();
      expect(screen.queryByText('Design System')).not.toBeInTheDocument();
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });
  });
});
