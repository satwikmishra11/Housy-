import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

export type ModalVariant = 'modal' | 'sheet';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: ModalVariant;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
  maxWidth = 'md',
}) => {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  if (variant === 'sheet') {
    return (
      <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity"
          aria-hidden="true"
          onClick={onClose}
        />
        {/* Slide-over panel */}
        <div
          className={`relative z-10 w-full ${maxWidthStyles[maxWidth]} bg-surface h-full shadow-sheet border-l border-hairline flex flex-col`}
          role="document"
        >
          <div className="flex items-center justify-between p-6 border-b border-hairline">
            <div>
              <h2 id={titleId} className="font-serif text-2xl font-semibold text-ink">
                {title}
              </h2>
              {description && (
                <p id={descId} className="text-xs text-muted mt-1">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-muted hover:text-ink hover:bg-background transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
          {footer && <div className="p-6 border-t border-hairline bg-background/50">{footer}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* Centered Modal Card */}
      <div
        className={`relative z-10 w-full ${maxWidthStyles[maxWidth]} rounded-xl border border-hairline bg-surface shadow-sheet p-6 sm:p-8`}
        role="document"
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-hairline">
          <div>
            <h2 id={titleId} className="font-serif text-2xl font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-muted mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-muted hover:text-ink hover:bg-background transition-colors flex items-center justify-center -mr-2 -mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="py-6">{children}</div>
        {footer && <div className="pt-4 border-t border-hairline flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
};
