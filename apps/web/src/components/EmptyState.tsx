import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './Button.js';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records found',
  description = 'There are no active records in this section yet. You can create a new record or adjust your filters.',
  icon,
  action,
  className = '',
}) => {
  return (
        <div
          role="region"
          aria-label="Empty state"
          className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-hairline bg-surface/80 shadow-subtle ${className}`}
        >
          <div className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center mb-4">
            {icon || <Inbox className="w-6 h-6" />}
          </div>
          <h3 className="font-serif text-xl sm:text-2xl font-semibold text-ink">{title}</h3>
          <p className="mt-2 text-sm text-muted max-w-sm leading-relaxed">{description}</p>
          {action && (
        <div className="mt-6">
          <Button onClick={action.onClick} leftIcon={action.icon}>
            {action.label}
          </Button>
        </div>
          )}
        </div>
        );
};
