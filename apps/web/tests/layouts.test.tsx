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
  });
});
