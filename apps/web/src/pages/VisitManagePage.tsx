import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  CalendarPlus,
  RefreshCw,
  XCircle,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import type { SlotItem, SlotAlternative } from '@housy/shared';
import {
  fetchVisitManage,
  fetchProjectSlots,
  rescheduleVisitSlot,
  cancelVisitBooking,
  type ApiError,
} from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import { downloadIcsCalendar } from '../lib/calendar.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/Badge.js';
import { Card } from '../components/Card.js';
import { Modal } from '../components/Modal.js';
import { Textarea } from '../components/Textarea.js';
import { Skeleton } from '../components/Skeleton.js';
import { ErrorState } from '../components/ErrorState.js';
import { SlotPicker } from '../components/SlotPicker.js';
import { useToast } from '../components/Toast.js';

export const VisitManagePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [rescheduleAlternatives, setRescheduleAlternatives] = useState<SlotAlternative[] | null>(null);

  // Fetch visit details by magic token
  const {
    data: visit,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['visit-manage', token],
    queryFn: () => fetchVisitManage(token!),
    enabled: !!token,
  });

  // Fetch project slots for reschedule modal
  const {
    data: slotsData,
    isLoading: isSlotsLoading,
    error: slotsError,
    refetch: refetchSlots,
  } = useQuery({
    queryKey: ['project-slots', visit?.projectId],
    queryFn: () => fetchProjectSlots(visit!.projectId),
    enabled: isRescheduleOpen && !!visit?.projectId,
  });

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: (newStartsAt: string) => rescheduleVisitSlot(token!, newStartsAt),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['visit-manage', token] });
      setIsRescheduleOpen(false);
      setSelectedSlot(null);
      setRescheduleAlternatives(null);
      showToast({
        type: 'success',
        title: 'Visit Rescheduled',
        message: `Your appointment was successfully rescheduled to ${formatInKolkataTime(data.startsAt, {
          timeZone: 'Asia/Kolkata',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })}.`,
      });
    },
    onError: (err: ApiError) => {
      if (err.alternatives && err.alternatives.length > 0) {
        setRescheduleAlternatives(err.alternatives);
        showToast({
          type: 'warning',
          title: 'Slot Just Taken',
          message: 'That appointment was just booked by another visitor. Please pick an alternative.',
        });
      } else {
        showToast({
          type: 'error',
          title: 'Reschedule Failed',
          message: err.message || 'Unable to reschedule your visit. Please try again.',
        });
      }
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: (reason?: string) => cancelVisitBooking(token!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit-manage', token] });
      setIsCancelOpen(false);
      setCancelReason('');
      showToast({
        type: 'info',
        title: 'Visit Cancelled',
        message: 'Your appointment has been cancelled.',
      });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Cancellation Failed',
        message: err.message || 'Unable to cancel your appointment. Please contact our support team.',
      });
    },
  });

  // Handle Add to Calendar
  const handleAddToCalendar = () => {
    if (!visit) return;
    downloadIcsCalendar({
      title: `Site Visit: ${visit.projectName}`,
      description: `Appointment for site visit at ${visit.projectName} with representative ${visit.executiveName}. Lead ID: ${visit.leadPublicId || ''}. Manage appointment: ${window.location.href}`,
      location: visit.projectAddress,
      startsAt: visit.startsAt,
      endsAt: visit.endsAt,
    });
    showToast({
      type: 'success',
      title: 'Calendar File Downloaded',
      message: 'The .ics file has been downloaded to your device.',
    });
  };

  // Loading State
  if (isLoading) {
    return (
      <main className="min-h-screen bg-background py-10 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-6" aria-busy="true" aria-label="Loading visit details">
          <div className="flex items-center justify-between">
            <Skeleton variant="text" width="160px" height="28px" />
            <Skeleton variant="text" width="80px" height="24px" />
          </div>
          <Card className="p-6 sm:p-8 space-y-6">
            <Skeleton variant="text" width="220px" height="32px" />
            <Skeleton variant="rectangular" width="100%" height="90px" className="rounded-xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton variant="rectangular" width="100%" height="60px" className="rounded-xl" />
              <Skeleton variant="rectangular" width="100%" height="60px" className="rounded-xl" />
            </div>
          </Card>
        </div>
      </main>
    );
  }

  // Error State
  if (isError || !visit) {
    return (
      <main className="min-h-screen bg-background py-16 px-4 sm:px-6 flex items-center justify-center">
        <div className="max-w-md w-full">
          <ErrorState
            title="Appointment Not Found"
            message={
              error instanceof Error
                ? error.message
                : 'This appointment link is invalid or has expired. Please check the link from your confirmation message.'
            }
            onRetry={() => refetch()}
          />
        </div>
      </main>
    );
  }

  const isConfirmed = visit.status === 'confirmed';
  const isCancelled = visit.status === 'cancelled';
  const isCompleted = visit.status === 'completed';
  const isNoShow = visit.status === 'no_show';

  // Google Maps pin link
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${visit.lat},${visit.lng}`;

  const formattedDate = formatInKolkataTime(visit.startsAt, {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const formattedStartTime = formatInKolkataTime(visit.startsAt, {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const formattedEndTime = formatInKolkataTime(visit.endsAt, {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <main className="min-h-screen bg-background py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Top Header */}
        <header className="flex items-center justify-between border-b border-hairline pb-4">
          <div>
            <span className="text-xs uppercase tracking-widest text-muted font-semibold">
              Housy Site Visits
            </span>
            <h1 className="font-serif text-2xl font-semibold text-ink mt-0.5">
              Appointment Details
            </h1>
          </div>
          <div>
            {isConfirmed && (
              <Badge variant="accent" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirmed</span>
              </Badge>
            )}
            {isCancelled && (
              <Badge variant="neutral" className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted">
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancelled</span>
              </Badge>
            )}
            {isCompleted && (
              <Badge variant="accent" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <span>Completed</span>
              </Badge>
            )}
            {isNoShow && (
              <Badge variant="warning" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <span>No-Show</span>
              </Badge>
            )}
          </div>
        </header>

        {/* Cancellation Notice Banner */}
        {isCancelled && (
          <div
            role="status"
            className="p-4 rounded-xl border border-hairline bg-surface text-muted text-sm space-y-1"
          >
            <p className="font-medium text-ink">This site visit has been cancelled.</p>
            <p className="text-xs leading-relaxed">
              If you wish to schedule a new appointment, please reach out to our team or book through our property consultant.
            </p>
          </div>
        )}

        {/* Main Appointment Card */}
        <Card className="p-6 sm:p-8 space-y-6">
          {/* Project & Address */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-accent" />
                  Residential Property
                </span>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-ink mt-1">
                  {visit.projectName}
                </h2>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2.5 text-sm text-ink/80 bg-background/60 p-3.5 rounded-xl border border-hairline">
              <MapPin className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{visit.projectAddress}</p>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline mt-1.5"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Time & Representative */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-hairline bg-surface space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                Date & Time
              </span>
              <p className="text-sm font-semibold text-ink pt-1">{formattedDate}</p>
              <p className="text-xs font-mono text-muted flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted/80" />
                <span>{formattedStartTime} – {formattedEndTime} (IST)</span>
              </p>
            </div>

            <div className="p-4 rounded-xl border border-hairline bg-surface space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Your Dedicated Host
              </span>
              <p className="text-sm font-semibold text-ink pt-1">
                {visit.executiveName}
              </p>
              {visit.executivePhone ? (
                <p className="text-xs text-muted font-mono">{visit.executivePhone}</p>
              ) : (
                <p className="text-xs text-muted">Site Relationship Manager</p>
              )}
            </div>
          </div>

          {/* Visitor Reference */}
          <div className="pt-2 border-t border-hairline flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              Booked for: <strong className="text-ink font-medium">{visit.leadName}</strong>
            </span>
            {visit.leadPublicId && (
              <span className="font-mono">Reference: {visit.leadPublicId}</span>
            )}
          </div>
        </Card>

        {/* Action Buttons for Confirmed Visits */}
        {isConfirmed && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Button
              variant="outline"
              onClick={handleAddToCalendar}
              leftIcon={<CalendarPlus className="w-4 h-4" />}
              className="flex-1 justify-center"
            >
              Add to Calendar (.ics)
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setIsRescheduleOpen(true);
                setRescheduleAlternatives(null);
                setSelectedSlot(null);
              }}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              className="flex-1 justify-center"
            >
              Reschedule Visit
            </Button>

            <Button
              variant="ghost"
              onClick={() => setIsCancelOpen(true)}
              leftIcon={<XCircle className="w-4 h-4 text-danger/80" />}
              className="text-danger hover:text-danger hover:bg-danger/10 justify-center"
            >
              Cancel Visit
            </Button>
          </div>
        )}

        {/* Reschedule Modal */}
        <Modal
          isOpen={isRescheduleOpen}
          onClose={() => setIsRescheduleOpen(false)}
          title="Reschedule Your Site Visit"
          description="Choose a new available date and time slot. Your current slot will be freed automatically upon confirmation."
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <Button
                variant="outline"
                onClick={() => setIsRescheduleOpen(false)}
                disabled={rescheduleMutation.isPending}
              >
                Keep Current Time
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (selectedSlot) {
                    rescheduleMutation.mutate(selectedSlot.startsAt);
                  }
                }}
                disabled={!selectedSlot || rescheduleMutation.isPending}
                isLoading={rescheduleMutation.isPending}
              >
                Confirm New Slot
              </Button>
            </div>
          }
        >
          <div className="py-2">
            <SlotPicker
              days={slotsData?.days || []}
              isLoading={isSlotsLoading}
              error={slotsError instanceof Error ? slotsError : null}
              onRetry={() => refetchSlots()}
              nextAvailableDate={slotsData?.nextAvailableDate}
              selectedSlotStartsAt={selectedSlot?.startsAt || null}
              onSelectSlot={(slot) => setSelectedSlot(slot)}
              unavailableAlternatives={rescheduleAlternatives}
              onSelectAlternative={(alt) => {
                setSelectedSlot({
                  startsAt: alt.startsAt,
                  endsAt: alt.endsAt,
                  displayTime: alt.displayTime || formatInKolkataTime(alt.startsAt, {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  }),
                  availableCount: 1,
                });
                rescheduleMutation.mutate(alt.startsAt);
              }}
            />
          </div>
        </Modal>

        {/* Cancel Confirmation Modal */}
        <Modal
          isOpen={isCancelOpen}
          onClose={() => setIsCancelOpen(false)}
          title="Cancel Site Visit?"
          description="Are you sure you want to cancel your scheduled site visit? Your assigned representative will be notified."
          maxWidth="md"
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <Button
                variant="outline"
                onClick={() => setIsCancelOpen(false)}
                disabled={cancelMutation.isPending}
              >
                Keep Visit
              </Button>
              <Button
                variant="danger"
                onClick={() => cancelMutation.mutate(cancelReason || undefined)}
                isLoading={cancelMutation.isPending}
              >
                Confirm Cancellation
              </Button>
            </div>
          }
        >
          <div className="py-2 space-y-4">
            <p className="text-sm text-ink/80">
              Please share a reason for cancellation (optional):
            </p>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g., Change in plans, rescheduling for next month..."
              rows={3}
              maxLength={500}
            />
          </div>
        </Modal>
      </div>
    </main>
  );
};
