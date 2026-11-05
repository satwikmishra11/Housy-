import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StyleguidePage } from '../src/pages/StyleguidePage.js';
import '../src/i18n/index.js';

describe('StyleguidePage', () => {
  it('renders design system tokens and component sections', () => {
    render(
      <MemoryRouter initialEntries={['/styleguide']}>
        <StyleguidePage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Design System & Component Catalog/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Design Tokens & Palette/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Buttons/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Form Controls/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Badges & Source Tags/i)).toBeInTheDocument();
    expect(screen.getByText(/6\. Stat Tiles/i)).toBeInTheDocument();
    expect(screen.getByText(/7\. Site Visit Slot Chips/i)).toBeInTheDocument();
    expect(screen.getByText(/8\. Chat Bubbles/i)).toBeInTheDocument();
    expect(screen.getByText(/9\. Responsive Table/i)).toBeInTheDocument();
    expect(screen.getByText(/10\. Interactive Overlays/i)).toBeInTheDocument();
  });
});
