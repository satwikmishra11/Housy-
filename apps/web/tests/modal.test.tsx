import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../src/components/Modal.js';

describe('Modal Component', () => {
  it('renders modal dialog with accessible title, description, and test id when open', () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        title="Test Modal Title"
        description="Test modal description text"
        data-testid="custom-test-modal"
      >
        <p>Modal body content</p>
      </Modal>,
    );

    const dialog = screen.getByTestId('custom-test-modal');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Test Modal Title')).toBeInTheDocument();
    expect(screen.getByText('Test modal description text')).toBeInTheDocument();
    expect(screen.getByText('Modal body content')).toBeInTheDocument();
  });

  it('does not render anything when isOpen is false', () => {
    render(
      <Modal
        isOpen={false}
        onClose={vi.fn()}
        title="Hidden Modal"
        data-testid="hidden-modal"
      >
        <p>Hidden content</p>
      </Modal>,
    );

    expect(screen.queryByTestId('hidden-modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden Modal')).not.toBeInTheDocument();
  });

  it('does not close if click on backdrop did not originate with mousedown on backdrop', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={handleClose} title="Click Defense Modal">
        <p>Content</p>
      </Modal>,
    );

    const backdrop = container.querySelector('.bg-ink\\/30');
    expect(backdrop).not.toBeNull();

    // Stray click event (e.g. mouseup/click landing on backdrop after trigger button clicked)
    fireEvent.click(backdrop!);
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('closes on backdrop click when mousedown also occurred on backdrop', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={handleClose} title="Backdrop Click Modal">
        <p>Content</p>
      </Modal>,
    );

    const backdrop = container.querySelector('.bg-ink\\/30');
    expect(backdrop).not.toBeNull();

    // Intentional user click on backdrop
    fireEvent.mouseDown(backdrop!);
    fireEvent.click(backdrop!);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Close Button Modal">
        <p>Content</p>
      </Modal>,
    );

    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Escape Key Modal">
        <p>Content</p>
      </Modal>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders sheet variant with slide-over styles and test id', () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        variant="sheet"
        title="Sheet Title"
        data-testid="custom-sheet"
      >
        <p>Sheet body</p>
      </Modal>,
    );

    const sheet = screen.getByTestId('custom-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveClass('justify-end');
    expect(screen.getByRole('button', { name: /close panel/i })).toBeInTheDocument();
  });
});
