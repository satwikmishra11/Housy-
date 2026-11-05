import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  User,
  Building2,
  Phone,
} from 'lucide-react';
import type { ExecutiveVisitItem } from '@housy/shared';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/Badge.js';
import { Card } from '../components/Card.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { Modal } from '../components/Modal.js';
import { Textarea } from '../components/Textarea.js';
import { useToast } from '../components/Toast.js';
import { fetchStaffVisits, recordVisitOutcome } from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';

export const VisitsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [outcomeModalVisit, setOutcomeModalVisit] = useState<ExecutiveVisitItem | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'visited' | 'no_show'>('visited');
  const [outcomeNotes, setOutcomeNotes] = useState('');

  // Fetch staff visits
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['staff-visits'],
    queryFn: fetchStaffVisits,
  });

  // Record outcome mutation
  const outcomeMutation = useMutation({
    mutationFn: ({
      bookingId,
      outcome,
      notes,
    }: {
      bookingId: string;
      outcome: 'visited' | 'no_show';
      notes?: string;
    }) => recordVisitOutcome(bookingId, { outcome, notes }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['staff-visits'] });
      setOutcomeModalVisit(null);
      setOutcomeNotes('');
      showToast({
        type: 'success',
        title: 'Outcome Recorded',
        message: `Visit marked as ${variables.outcome === 'visited' ? 'Visited' : 'No-Show'}.`,
      });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Record Outcome',
        message: err.message || 'Could not record visit outcome.',
      });
    },
  });

  const handleOpenOutcomeModal = (visit: ExecutiveVisitItem, outcome: 'visited' | 'no_show') => {
    setOutcomeModalVisit(visit);
    setSelectedOutcome(outcome);
    setOutcomeNotes('');
  };

  const handleConfirmOutcome = () => {
    if (!outcomeModalVisit) return;
    outcomeMutation.mutate({
      bookingId: outcomeModalVisit.bookingId,
      outcome: selectedOutcome,
      notes: outcomeNotes.trim() || undefined,
    });
  };

  const awaiting = data?.awaitingOutcome || [];
  const upcoming = data?.upcoming || [];

  return (
    <StaffLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <PageHeader
          title="Site Visits"
          description="Manage scheduled property visits and record customer attendance outcomes to track show-up rate."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          }
        />

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-8" aria-busy="true" aria-label="Loading site visits">
            {/* Awaiting Outcome Section Skeleton */}
            <div className="space-y-4">
              <Skeleton variant="text" width="220px" height="24px" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton variant="rectangular" width="100%" height="160px" className="rounded-xl" />
                <Skeleton variant="rectangular" width="100%" height="160px" className="rounded-xl" />
              </div>
            </div>

            {/* Upcoming Visits Section Skeleton */}
            <div className="space-y-4">
              <Skeleton variant="text" width="180px" height="24px" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton variant="rectangular" width="100%" height="140px" className="rounded-xl" />
                <Skeleton variant="rectangular" width="100%" height="140px" className="rounded-xl" />
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <ErrorState
            title="Failed to Load Visits"
            message={error instanceof Error ? error.message : 'Could not fetch scheduled visits.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && (
          <>
            {/* 1. Awaiting Outcome Section */}
            <section aria-labelledby="awaiting-outcome-heading" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h2
                    id="awaiting-outcome-heading"
                    className="font-serif text-lg sm:text-xl font-bold text-ink"
                  >
                    Awaiting Attendance Outcome
                  </h2>
                  <Badge variant={awaiting.length > 0 ? 'warning' : 'neutral'}>
                    {awaiting.length}
                  </Badge>
                </div>
                <span className="text-xs text-muted hidden sm:inline">
                  Visits past scheduled start time requiring verification
                </span>
              </div>

              {awaiting.length === 0 ? (
                <Card className="p-6 text-center bg-surface/50 border-hairline">
                  <CheckCircle className="w-6 h-6 text-success mx-auto mb-2" />
                  <p className="text-sm font-medium text-ink">All visits up to date</p>
                  <p className="text-xs text-muted mt-1">
                    There are no past visits pending attendance recording.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {awaiting.map((visit) => {
                    const formattedTime = formatInKolkataTime(visit.startsAt, {
                      timeZone: 'Asia/Kolkata',
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });

                    return (
                      <Card
                        key={visit.bookingId}
                        className="p-5 border-warning/40 bg-surface flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-ink text-base">
                                  {visit.leadName}
                                </span>
                                {visit.leadPublicId && (
                                  <Badge variant="neutral" className="text-[10px]">
                                    {visit.leadPublicId}
                                  </Badge>
                                )}
                              </div>
                              {visit.leadPhone && (
                                <p className="text-xs text-muted font-mono flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 text-muted/70" />
                                  <span>{visit.leadPhone}</span>
                                </p>
                              )}
                            </div>
                            <Badge variant="warning">Awaiting Outcome</Badge>
                          </div>

                          <div className="text-xs text-ink/80 space-y-1 bg-background/50 p-2.5 rounded-lg border border-hairline">
                            <p className="flex items-center gap-1.5 font-medium">
                              <Building2 className="w-3.5 h-3.5 text-accent" />
                              <span>{visit.projectName}</span>
                            </p>
                            <p className="flex items-center gap-1.5 font-mono text-muted">
                              <Clock className="w-3.5 h-3.5 text-muted" />
                              <span>{formattedTime} (IST)</span>
                            </p>
                            <p className="flex items-center gap-1.5 text-muted">
                              <User className="w-3.5 h-3.5 text-muted" />
                              <span>Host: {visit.executiveName}</span>
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-2 border-t border-hairline">
                          <Button
                            variant="primary"
                            size="sm"
                            className="flex-1 justify-center"
                            leftIcon={<CheckCircle className="w-3.5 h-3.5" />}
                            onClick={() => handleOpenOutcomeModal(visit, 'visited')}
                          >
                            Mark Visited
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 justify-center text-danger hover:bg-danger/10"
                            leftIcon={<XCircle className="w-3.5 h-3.5" />}
                            onClick={() => handleOpenOutcomeModal(visit, 'no_show')}
                          >
                            Mark No-Show
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 2. Upcoming Visits Section */}
            <section aria-labelledby="upcoming-visits-heading" className="space-y-4 pt-4 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h2
                    id="upcoming-visits-heading"
                    className="font-serif text-lg sm:text-xl font-bold text-ink"
                  >
                    Upcoming Site Visits
                  </h2>
                  <Badge variant="neutral">{upcoming.length}</Badge>
                </div>
                <span className="text-xs text-muted">Confirmed future appointments</span>
              </div>

              {upcoming.length === 0 ? (
                <EmptyState
                  title="No upcoming visits"
                  description="There are currently no upcoming site visits scheduled."
                  icon={<Calendar className="w-6 h-6" />}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {upcoming.map((visit) => {
                    const formattedDate = formatInKolkataTime(visit.startsAt, {
                      timeZone: 'Asia/Kolkata',
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });

                    const formattedTime = formatInKolkataTime(visit.startsAt, {
                      timeZone: 'Asia/Kolkata',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });

                    return (
                      <Card
                        key={visit.bookingId}
                        className="p-5 bg-surface border-hairline flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-ink text-base">
                                  {visit.leadName}
                                </span>
                                {visit.leadPublicId && (
                                  <Badge variant="neutral" className="text-[10px]">
                                    {visit.leadPublicId}
                                  </Badge>
                                )}
                              </div>
                              {visit.leadPhone && (
                                <p className="text-xs text-muted font-mono flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 text-muted/70" />
                                  <span>{visit.leadPhone}</span>
                                </p>
                              )}
                            </div>
                            <Badge variant="accent">Confirmed</Badge>
                          </div>

                          <div className="text-xs text-ink/80 space-y-1.5 bg-background/50 p-3 rounded-lg border border-hairline">
                            <p className="flex items-center gap-1.5 font-medium">
                              <Building2 className="w-3.5 h-3.5 text-accent" />
                              <span>{visit.projectName}</span>
                            </p>
                            <p className="flex items-center gap-1.5 text-muted font-mono">
                              <Calendar className="w-3.5 h-3.5 text-muted" />
                              <span>{formattedDate} at {formattedTime} (IST)</span>
                            </p>
                            <p className="flex items-center gap-1.5 text-muted">
                              <User className="w-3.5 h-3.5 text-muted" />
                              <span>Representative: {visit.executiveName}</span>
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs text-muted">
                          <span className="truncate max-w-[240px]">{visit.projectAddress}</span>
                          <span className="text-[11px] font-mono text-muted">
                            Lead Touchpoint Logged
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* Record Outcome Modal */}
        <Modal
          isOpen={!!outcomeModalVisit}
          onClose={() => setOutcomeModalVisit(null)}
          title={`Record Visit Outcome: ${outcomeModalVisit?.leadName}`}
          description={`Please confirm whether the visitor attended this site visit appointment at ${outcomeModalVisit?.projectName}.`}
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <Button
                variant="outline"
                onClick={() => setOutcomeModalVisit(null)}
                disabled={outcomeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant={selectedOutcome === 'visited' ? 'primary' : 'danger'}
                onClick={handleConfirmOutcome}
                isLoading={outcomeMutation.isPending}
              >
                Confirm {selectedOutcome === 'visited' ? 'Visited' : 'No-Show'}
              </Button>
            </div>
          }
        >
          <div className="py-2 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Outcome
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOutcome('visited')}
                  className={`flex-1 p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${selectedOutcome === 'visited'
                      ? 'border-accent bg-accent-soft text-accent font-semibold'
                      : 'border-hairline bg-surface text-ink hover:bg-background'
                    }`}
                >
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span>Visited</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOutcome('no_show')}
                  className={`flex-1 p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${selectedOutcome === 'no_show'
                      ? 'border-danger/60 bg-danger/10 text-danger font-semibold'
                      : 'border-hairline bg-surface text-ink hover:bg-background'
                    }`}
                >
                  <XCircle className="w-4 h-4 text-danger" />
                  <span>No-Show</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Notes (Optional)
              </label>
              <Textarea
                value={outcomeNotes}
                onChange={(e) => setOutcomeNotes(e.target.value)}
                placeholder="e.g., Buyer visited with spouse, interested in 3 BHK Unit A-402..."
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
        </Modal>
      </div>
    </StaffLayout>
  );
};