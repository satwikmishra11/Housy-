import React from 'react';
import { Clock, Check } from 'lucide-react';

export type SlotStatus = 'available' | 'selected' | 'booked' | 'disabled';

export interface SlotChipProps {
  time: string;
  status: SlotStatus;
  executiveName?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export const SlotChip: React.FC<SlotChipProps> = ({
  time,
  status,
  executiveName,
  onClick,
  disabled = false,
  className = '',
}) => {
  const isSelected = status === 'selected';
  const isBooked = status === 'booked' || status === 'disabled' || disabled;

  const statusStyles: Record<SlotStatus, string> = {
    available:
      'border-hairline bg-surface text-ink hover:border-accent hover:bg-accent-soft/40 active:bg-accent-soft',
    selected: 'border-accent bg-accent text-white shadow-subtle',
    booked: 'border-hairline/60 bg-background/80 text-muted/60 cursor-not-allowed opacity-50',
    disabled: 'border-hairline/60 bg-background/80 text-muted/60 cursor-not-allowed opacity-50',
  };

  return (
    <button
      type="button"
      onClick={isBooked ? undefined : onClick}
      disabled={isBooked}
      aria-pressed={isSelected}
      aria-label={`Time slot ${time}${isBooked ? ' (Unavailable)' : isSelected ? ' (Selected)' : ''}`}
      className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors flex items-center justify-between gap-2.5 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${statusStyles[status]} ${className}`}
    >
      <div className="flex items-center gap-2">
        <Clock
          className={`w-3.5 h-3.5 ${
            isSelected ? 'text-white' : isBooked ? 'text-muted/50' : 'text-accent'
          }`}
          aria-hidden="true"
        />
        <span className="font-mono tracking-tight font-medium">{time}</span>
      </div>

      {isSelected && (
        <Check className="w-4 h-4 text-white stroke-[2.5]" aria-hidden="true" />
      )}

      {!isSelected && executiveName && (
        <span
          className={`text-[11px] truncate max-w-[90px] ${
            isBooked ? 'text-muted/60' : 'text-muted'
          }`}
        >
          {executiveName}
        </span>
      )}
    </button>
  );
};

