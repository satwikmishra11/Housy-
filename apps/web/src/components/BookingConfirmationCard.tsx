import React from 'react';
import {
  CalendarCheck2,
  MapPin,
  Calendar,
  ExternalLink,
  UserCheck,
  Building,
  CheckCircle2,
} from 'lucide-react';
import { Button } from './Button.js';
import { Badge } from './Badge.js';
import { formatInKolkataTime } from '../lib/date.js';
import { downloadIcsCalendar } from '../lib/calendar.js';

export interface BookingConfirmationCardProps {
  bookingId: string;
  startsAt: string;
  projectName?: string;
  executiveName?: string;
  executivePhone?: string;
  address?: string;
  manageToken?: string;
  className?: string;
  onReschedule?: () => void;
  onCancel?: () => void;
}

export const BookingConfirmationCard: React.FC<BookingConfirmationCardProps> = ({
  bookingId,
  startsAt,
  projectName = 'The Palm Residences (Project 1)',
  executiveName = 'Priya Patel',
  executivePhone = '+91 90000 00003',
  address = 'Sales Gallery, SG Highway, Ahmedabad, Gujarat 380054',
  manageToken,
  className = '',
  onReschedule,
  onCancel,
}) => {
  // Enforce named executive: eliminate generic placeholder
  const resolvedExecutiveName =
    !executiveName || executiveName === 'Dedicated Sales Executive'
      ? 'Priya Patel'
      : executiveName;
  const resolvedExecutivePhone = executivePhone || '+91 90000 00003';

  const formattedTime = formatInKolkataTime(startsAt, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const handleAddToCalendar = () => {
    const startDate = new Date(startsAt);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 60 mins visit

    downloadIcsCalendar(
      {
        title: `Private Site Visit: ${projectName}`,
        description: `Your private appointment with ${resolvedExecutiveName} (${resolvedExecutivePhone}) at Company A Sales Gallery.\nAppointment ID: ${bookingId}\nHost Contact: ${resolvedExecutivePhone}\nRERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`,
        location: address,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
      },
      `Site_Visit_${bookingId.slice(0, 8)}.ics`,
    );
  };

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${projectName}, ${address}`,
  )}`;

  return (
    <div
      className={`p-5 rounded-2xl bg-surface border border-accent/25 shadow-card max-w-md w-full overflow-hidden ${className}`}
      role="region"
      aria-label="Site visit booking confirmation details"
    >
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-3 border-b border-hairline mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-serif font-semibold text-ink text-base">Visit Confirmed</h4>
            <span className="text-[11px] text-muted">Booking Reference: #{bookingId.slice(0, 8)}</span>
          </div>
        </div>
        <Badge variant="success">
          Confirmed
        </Badge>
      </div>

      {/* Appointment Time Highlight */}
      <div className="p-3.5 rounded-xl bg-accent-soft/40 border border-accent/15 mb-4 flex items-start gap-3">
        <CalendarCheck2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
        <div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-accent block">
            Scheduled Appointment (IST)
          </span>
          <span className="text-sm font-semibold text-ink block mt-0.5">
            {formattedTime}
          </span>
          <span className="text-xs text-muted block mt-0.5">
            60-minute private tour of model residence & gallery
          </span>
        </div>
      </div>

      {/* Host & Location Information */}
      <div className="space-y-2.5 text-xs text-ink/80 mb-5">
        <div className="flex items-center gap-2.5">
          <UserCheck className="w-4 h-4 text-accent flex-shrink-0" />
          <span>
            <strong className="text-ink">Host:</strong> {resolvedExecutiveName}{' '}
            <span className="text-muted font-mono">({resolvedExecutivePhone})</span>
          </span>
        </div>

        <div className="flex items-start gap-2.5">
          <Building className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <span>
            <strong className="text-ink">Project:</strong> {projectName}
          </span>
        </div>

        <div className="flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong className="text-ink">Address:</strong> {address}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-hairline">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAddToCalendar}
          className="flex-1 justify-center text-xs"
        >
          <Calendar className="w-3.5 h-3.5 mr-1.5 text-accent" />
          Add to Calendar (.ics)
        </Button>

        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center px-3 py-2 text-xs font-medium rounded-lg border border-hairline bg-surface text-ink hover:bg-background transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 mr-1.5 text-accent" />
          Google Maps
          <ExternalLink className="w-3 h-3 ml-1 text-muted" />
        </a>
      </div>

      {(onReschedule || onCancel || manageToken) && (
        <div className="mt-3 pt-2.5 border-t border-hairline/60 flex items-center justify-between gap-2">
          {onReschedule && (
            <button
              type="button"
              onClick={onReschedule}
              className="text-[11px] text-accent hover:underline font-medium"
            >
              Reschedule visit
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] text-red-600 hover:underline font-medium ml-auto"
            >
              Cancel visit
            </button>
          )}
          {manageToken && !onReschedule && !onCancel && (
            <a
              href={`/visit/${manageToken}`}
              className="text-[11px] text-accent underline underline-offset-2 hover:text-accent-hover font-medium w-full text-center"
            >
              Manage or reschedule this appointment
            </a>
          )}
        </div>
      )}
    </div>
  );
};
