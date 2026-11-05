import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Check } from 'lucide-react';
import type { SlotItem } from '@housy/shared';
import { fetchProjectSlots } from '../lib/api.js';
import { SlotPicker } from './SlotPicker.js';
import { Button } from './Button.js';
import { formatTimeInKolkata, formatDateInKolkata } from '../lib/date.js';

export interface InlineSlotPickerCardProps {
  projectId: string;
  onBookSlot: (startsAt: string) => void;
  isBooking?: boolean;
  className?: string;
}

export const InlineSlotPickerCard: React.FC<InlineSlotPickerCardProps> = ({
  projectId,
  onBookSlot,
  isBooking = false,
  className = '',
}) => {
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);

  const {
    data: slotData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['project-slots', projectId],
    queryFn: () => fetchProjectSlots(projectId),
    staleTime: 60 * 1000,
  });

  const days = slotData?.days ?? [];

  const handleConfirm = () => {
    if (selectedSlot) {
      onBookSlot(selectedSlot.startsAt);
    }
  };

  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-surface border border-accent/20 shadow-card max-w-xl w-full ${className}`}
      role="region"
      aria-label="Available Site Visit Slots"
    >
      <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-hairline">
        <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
          <Calendar className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-serif font-semibold text-ink text-base">Select Your Visit Date & Time</h4>
          <span className="text-[11px] text-muted">Real-time availability with a dedicated residence host</span>
        </div>
      </div>

      <SlotPicker
        days={days}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={() => void refetch()}
        selectedSlotStartsAt={selectedSlot?.startsAt ?? null}
        onSelectSlot={(slot) => setSelectedSlot(slot)}
        className="my-3"
      />

      {/* Selected Slot Summary Bar */}
      {selectedSlot && (
        <div className="mt-4 pt-3 border-t border-hairline flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-ink/90 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              <strong>Selected:</strong> {formatDateInKolkata(selectedSlot.startsAt)} at{' '}
              {formatTimeInKolkata(selectedSlot.startsAt)}
            </span>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            isLoading={isBooking}
            className="w-full sm:w-auto text-xs px-4 py-2"
          >
            <Check className="w-3.5 h-3.5 mr-1.5" />
            Confirm Site Visit
          </Button>
        </div>
      )}
    </div>
  );
};
