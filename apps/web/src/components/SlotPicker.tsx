import React, { useState, useEffect } from 'react';
import { Calendar, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import type { DaySlots, SlotItem, SlotAlternative } from '@housy/shared';
import { Skeleton } from './Skeleton.js';
import { EmptyState } from './EmptyState.js';
import { ErrorState } from './ErrorState.js';
import { formatDayDisplay, formatInKolkataTime } from '../lib/date.js';

export interface SlotPickerProps {
  days: DaySlots[];
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  nextAvailableDate?: string;
  selectedSlotStartsAt?: string | null;
  onSelectSlot: (slot: SlotItem) => void;
  unavailableAlternatives?: SlotAlternative[] | null;
  onSelectAlternative?: (alt: SlotAlternative) => void;
  className?: string;
}

export const SlotPicker: React.FC<SlotPickerProps> = ({
  days,
  isLoading = false,
  error = null,
  onRetry,
  nextAvailableDate,
  selectedSlotStartsAt,
  onSelectSlot,
  unavailableAlternatives,
  onSelectAlternative,
  className = '',
}) => {
  // Determine initial selected date: first day with open slots or first day
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    if (days.length > 0) {
      const dayWithSlots = days.find((d) => d.slots && d.slots.length > 0);
      const targetDate = dayWithSlots ? dayWithSlots.date : days[0]!.date;
      // If current selectedDate is not in the days list or empty, initialize it
      if (!selectedDate || !days.some((d) => d.date === selectedDate)) {
        setSelectedDate(targetDate);
      }
    }
  }, [days, selectedDate]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`} aria-busy="true" aria-label="Loading available visit slots">
        {/* Date Strip Skeleton */}
        <div>
          <Skeleton variant="text" width="140px" height="18px" className="mb-3" />
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" width="76px" height="84px" className="rounded-xl flex-shrink-0" />
            ))}
          </div>
        </div>

        {/* Time Chips Skeleton */}
        <div>
          <Skeleton variant="text" width="120px" height="18px" className="mb-3" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" width="100%" height="48px" className="rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        title="Could not load visit slots"
        message={error.message || 'We were unable to load real-time slot availability. Please try again.'}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  // Total available slots count across all returned days
  const totalSlots = days.reduce((sum, d) => sum + (d.slots?.length || 0), 0);

  // Empty state across the entire window
  if (days.length === 0 || totalSlots === 0) {
    const formattedNextDate = nextAvailableDate
      ? formatInKolkataTime(new Date(nextAvailableDate).toISOString(), {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      : null;

    return (
      <EmptyState
        title="No slots available this week"
        description={
          formattedNextDate
            ? `All appointments are fully booked for the selected period. The next available appointment date is ${formattedNextDate}.`
            : 'All appointment slots are currently taken for this project. Please check back shortly or adjust your requested dates.'
        }
        icon={<Calendar className="w-6 h-6" />}
        action={
          formattedNextDate && onRetry
            ? {
              label: `Check ${formattedNextDate}`,
              onClick: onRetry,
              icon: <ArrowRight className="w-4 h-4" />,
            }
            : undefined
        }
        className={className}
      />
    );
  }

  const activeDay = days.find((d) => d.date === selectedDate) || days[0];
  const daySlots = activeDay?.slots || [];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* "Slot just taken" alternatives banner */}
      {unavailableAlternatives && unavailableAlternatives.length > 0 && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-warning/40 bg-warning/10 text-ink space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-ink">That slot was just booked by another buyer</p>
              <p className="text-xs text-muted mt-0.5">
                Appointments are reserved instantly in real time. Please choose from the nearest available alternative times:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {unavailableAlternatives.map((alt) => {
              const formattedTime = alt.displayTime || formatInKolkataTime(alt.startsAt, {
                timeZone: 'Asia/Kolkata',
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });

              return (
                <button
                  key={alt.startsAt}
                  type="button"
                  onClick={() => onSelectAlternative?.(alt)}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg border border-hairline bg-surface text-ink text-xs font-medium hover:border-accent hover:bg-accent-soft/40 transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  <span>{formattedTime}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Date Strip */}
      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">
          Select Date
        </label>
        <div
          role="tablist"
          aria-label="Available dates"
          className="flex gap-2 overflow-x-auto pb-2 scrollbar-none touch-pan-x"
        >
          {days.map((day) => {
            const isSelected = day.date === selectedDate;
            const slotCount = day.slots?.length || 0;
            const hasSlots = slotCount > 0;
            const { dayName, dayNumber, monthName } = formatDayDisplay(day.date);

            return (
              <button
                key={day.date}
                role="tab"
                type="button"
                aria-selected={isSelected}
                disabled={!hasSlots}
                onClick={() => setSelectedDate(day.date)}
                className={`min-h-[72px] min-w-[70px] sm:min-w-[80px] p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isSelected
                    ? 'border-accent bg-accent text-white shadow-subtle'
                    : hasSlots
                      ? 'border-hairline bg-surface text-ink hover:border-accent/60 hover:bg-accent-soft/30'
                      : 'border-hairline/60 bg-background/50 text-muted/40 cursor-not-allowed opacity-60'
                  }`}
              >
                <span
                  className={`text-[11px] font-medium uppercase tracking-wider ${isSelected ? 'text-white/80' : 'text-muted'
                    }`}
                >
                  {dayName}
                </span>
                <span className="text-lg font-bold font-mono tracking-tight my-0.5">
                  {dayNumber}
                </span>
                <span
                  className={`text-[11px] font-medium ${isSelected ? 'text-white/90' : 'text-muted'
                    }`}
                >
                  {monthName}
                </span>
                <span
                  className={`text-[10px] mt-1 px-1.5 py-0.2 rounded-full font-medium ${isSelected
                      ? 'bg-white/20 text-white'
                      : hasSlots
                        ? 'bg-accent-soft text-accent'
                        : 'text-muted/50'
                    }`}
                >
                  {hasSlots ? `${slotCount} open` : 'Full'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Chips */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Available Times ({activeDay ? formatDayDisplay(activeDay.date).dayName : ''}{' '}
            {activeDay?.date})
          </label>
          <span className="text-xs text-muted">All times in IST (UTC+05:30)</span>
        </div>

        {daySlots.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-hairline bg-surface/50">
            <Clock className="w-5 h-5 text-muted mx-auto mb-2" />
            <p className="text-xs text-muted">No appointment slots open for this date.</p>
          </div>
        ) : (
          <div
            role="group"
            aria-label="Available time slots"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"
          >
            {daySlots.map((slot) => {
              const isSelected = selectedSlotStartsAt === slot.startsAt;

              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => onSelectSlot(slot)}
                  aria-pressed={isSelected}
                  className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors flex items-center justify-between gap-2 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isSelected
                      ? 'border-accent bg-accent text-white shadow-subtle'
                      : 'border-hairline bg-surface text-ink hover:border-accent hover:bg-accent-soft/40 active:bg-accent-soft'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock
                      className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-white' : 'text-accent'
                        }`}
                      aria-hidden="true"
                    />
                    <span className="font-mono tracking-tight font-medium">
                      {slot.displayTime}
                    </span>
                  </div>

                  {slot.availableCount > 1 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isSelected ? 'bg-white/20 text-white' : 'bg-accent-soft text-accent'
                        }`}
                    >
                      {slot.availableCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};