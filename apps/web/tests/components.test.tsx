import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Button } from '../src/components/Button.js';
import { Input } from '../src/components/Input.js';
import { Select } from '../src/components/Select.js';
import { Checkbox } from '../src/components/Checkbox.js';
import { Badge } from '../src/components/Badge.js';
import { Card, CardHeader, CardTitle } from '../src/components/Card.js';
import { StatTile } from '../src/components/StatTile.js';
import { SlotChip } from '../src/components/SlotChip.js';
import { ChatBubble } from '../src/components/ChatBubble.js';
import { Tabs } from '../src/components/Tabs.js';
import { ResponsiveTable } from '../src/components/ResponsiveTable.js';

describe('Design System Components', () => {
  describe('Button', () => {
    it('renders with default variant and responds to click', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Book Site Visit</Button>);
      const btn = screen.getByRole('button', { name: /book site visit/i });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('disables button when disabled or isLoading', () => {
      render(<Button disabled>Disabled Action</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('renders loading spinner when isLoading is true', () => {
      render(<Button isLoading>Loading</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Input', () => {
    it('renders with label and helper text', () => {
      render(<Input label="Buyer Name" helperText="Enter full name" placeholder="Hardik" />);
      expect(screen.getByLabelText(/buyer name/i)).toBeInTheDocument();
      expect(screen.getByText(/enter full name/i)).toBeInTheDocument();
    });

    it('renders error message and aria-invalid', () => {
      render(<Input label="Phone" errorMessage="Invalid phone number" />);
      const input = screen.getByLabelText(/phone/i);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid phone number/i);
    });
  });

  describe('Select', () => {
    it('renders options and responds to selection', () => {
      const handleChange = vi.fn();
      render(
        <Select
          label="Configuration"
          options={[
            { value: '2bhk', label: '2 BHK' },
            { value: '3bhk', label: '3 BHK' },
          ]}
          onChange={handleChange}
        />,
      );
      const select = screen.getByLabelText(/configuration/i);
      expect(select).toBeInTheDocument();
      fireEvent.change(select, { target: { value: '3bhk' } });
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('Checkbox', () => {
    it('toggles checked state and renders DPDP description', () => {
      const handleChange = vi.fn();
      render(
        <Checkbox
          label="Consent"
          description="Protected under DPDP Act 2023"
          onChange={handleChange}
        />,
      );
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('Badge', () => {
    it('renders source tag chip', () => {
      render(<Badge variant="source">Property Portal</Badge>);
      expect(screen.getByText('Property Portal')).toBeInTheDocument();
    });
  });

  describe('Card', () => {
    it('renders card with title and content', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Project 1</CardTitle>
          </CardHeader>
          <p>Luxury 3 BHK</p>
        </Card>,
      );
      expect(screen.getByText('Project 1')).toBeInTheDocument();
      expect(screen.getByText('Luxury 3 BHK')).toBeInTheDocument();
    });
  });

  describe('StatTile', () => {
    it('renders label, value and delta metric', () => {
      render(
        <StatTile
          label="Median First Response"
          value="3m 42s"
          delta={{ value: '-78%', isPositive: true }}
          subtitle="Target < 5 min"
        />,
      );
      expect(screen.getByText(/median first response/i)).toBeInTheDocument();
      expect(screen.getByText('3m 42s')).toBeInTheDocument();
      expect(screen.getByText('-78%')).toBeInTheDocument();
    });
  });

  describe('SlotChip', () => {
    it('renders slot chip with time and advisor name', () => {
      const handleClick = vi.fn();
      render(
        <SlotChip
          time="11:00 AM"
          status="available"
          executiveName="Amit Shah"
          onClick={handleClick}
        />,
      );
      const chip = screen.getByRole('button', { name: /time slot 11:00 am/i });
      expect(chip).toBeInTheDocument();
      expect(screen.getByText('Amit Shah')).toBeInTheDocument();
      fireEvent.click(chip);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('disables chip when status is booked', () => {
      render(<SlotChip time="12:00 PM" status="booked" />);
      const chip = screen.getByRole('button');
      expect(chip).toBeDisabled();
    });
  });

  describe('ChatBubble', () => {
    it('renders assistant and buyer bubbles with timestamp', () => {
      render(
        <>
          <ChatBubble
            role="assistant"
            content="Welcome to Company A"
            timestamp="2026-11-05T09:45:00.000Z"
          />
          <ChatBubble
            role="user"
            content="Looking for 3 BHK"
            timestamp="2026-11-05T09:46:00.000Z"
            status="read"
          />
        </>,
      );
      expect(screen.getByText(/welcome to company a/i)).toBeInTheDocument();
      expect(screen.getByText(/looking for 3 bhk/i)).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('renders tab list and changes tab on click', () => {
      const handleChange = vi.fn();
      render(
        <Tabs
          activeTab="tab1"
          onChange={handleChange}
          tabs={[
            { id: 'tab1', label: 'Overview' },
            { id: 'tab2', label: 'Details' },
          ]}
        />,
      );
      const tab2 = screen.getByRole('tab', { name: /details/i });
      fireEvent.click(tab2);
      expect(handleChange).toHaveBeenCalledWith('tab2');
    });
  });

  describe('ResponsiveTable', () => {
    it('renders table columns and data', () => {
      const data = [{ id: '1', name: 'Hardik' }];
      const columns = [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
      ];
      render(<ResponsiveTable data={data} columns={columns} keyExtractor={(d) => d.id} />);
      expect(screen.getAllByText('Hardik').length).toBeGreaterThan(0);
    });
  });
});
