import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { StatTile } from '../components/StatTile.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/Badge.js';
import { Card } from '../components/Card.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { Tabs } from '../components/Tabs.js';
import { LeadDetailDrawer } from '../components/LeadDetailDrawer.js';
import { useToast } from '../components/Toast.js';
import {
  fetchExecutiveTodaySummary,
  recordVisitOutcome,
  acceptHandoff,
} from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import {
  Calendar,
  Clock,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Phone,
  CheckCircle2,
  XCircle,
  Eye,
} from 'lucide-react';
import type { ExecutiveTodaySummary } from '@housy/shared';

export const ExecutiveTodayPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'all' | 'visits' | 'awaiting' | 'handoffs' | 'unanswered'>('all');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ExecutiveTodaySummary>({
    queryKey: ['executive-today'],
    queryFn: () => fetchExecutiveTodaySummary(),
    refetchInterval: 30000,
  });

  const outcomeMutation = useMutation({
    mutationFn: ({
      bookingId,
      outcome,
    }: {
      bookingId: string;
      outcome: 'visited' | 'no_show';
    }) => recordVisitOutcome(bookingId, { outcome }),
    onSuccess: (_, variables) => {
      showToast({
        type: 'success',
        title: 'Outcome Recorded',
        message: `Visit marked as ${variables.outcome === 'visited' ? 'Visited' : 'No-Show'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['executive-today'] });
      queryClient.invalidateQueries({ queryKey: ['staff-visits'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Outcome Failed',
        message: err.message || 'Could not record attendance outcome',
      });
    },
  });

  const acceptHandoffMutation = useMutation({
    mutationFn: (handoffId: string) => acceptHandoff(handoffId),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Handoff Accepted',
        message: 'Lead inquiry is now assigned to you for direct follow-up.',
      });
      queryClient.invalidateQueries({ queryKey: ['executive-today'] });
      queryClient.invalidateQueries({ queryKey: ['handoffs'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Accept Failed',
        message: err.message || 'Could not accept handoff',
      });
    },
  });

  const counts = data?.summaryCounts || {
    visitsToday: 0,
    awaitingOutcome: 0,
    newHandoffs: 0,
    unansweredLeads: 0,
  };

  return (
    <StaffLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Executive Today"
          description="Your morning briefing and priority action queue: confirmed visits today, attendance verification, incoming handoffs, and lead response SLA tracking."
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

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-6" aria-busy="true">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Skeleton height="80px" />
              <Skeleton height="80px" />
              <Skeleton height="80px" />
              <Skeleton height="80px" />
            </div>
            <Skeleton height="300px" />
          </div>
        )}

        {/* Error State */}
        {isError && (
          <ErrorState
            title="Failed to Load Executive Today"
            message={error instanceof Error ? error.message : 'Could not fetch today summary.'}
            onRetry={() => refetch()}
          />
        )}

        {/* Content */}
        {!isLoading && !isError && data && (
          <div className="space-y-6">
            {/* Stat Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Visits Scheduled Today"
                value={counts.visitsToday}
                icon={<Calendar className="w-4 h-4 text-accent" />}
              />
              <StatTile
                label="Awaiting Attendance"
                value={counts.awaitingOutcome}
                icon={
                  <Clock
                    className={`w-4 h-4 ${counts.awaitingOutcome > 0 ? 'text-warning' : 'text-muted'}`}
                  />
                }
              />
              <StatTile
                label="New Handoffs"
                value={counts.newHandoffs}
                icon={
                  <UserCheck
                    className={`w-4 h-4 ${counts.newHandoffs > 0 ? 'text-accent' : 'text-muted'}`}
                  />
                }
              />
              <StatTile
                label="Unanswered (> 2 Hours)"
                value={counts.unansweredLeads}
                icon={
                  <AlertTriangle
                    className={`w-4 h-4 ${counts.unansweredLeads > 0 ? 'text-danger' : 'text-muted'}`}
                  />
                }
              />
            </div>

            {/* Filter Tabs */}
            <Tabs
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab as typeof activeTab)}
              tabs={[
                { id: 'all', label: 'All Items' },
                { id: 'visits', label: `Visits Today (${counts.visitsToday})` },
                { id: 'awaiting', label: `Awaiting Outcome (${counts.awaitingOutcome})` },
                { id: 'handoffs', label: `New Handoffs (${counts.newHandoffs})` },
                { id: 'unanswered', label: `Unanswered > 2h (${counts.unansweredLeads})` },
              ]}
            />

            {/* Section 1: Visits Scheduled Today */}
            {(activeTab === 'all' || activeTab === 'visits') && (
              <section className="space-y-3" aria-labelledby="visits-today-heading">
                <div className="flex items-center justify-between">
                  <h2 id="visits-today-heading" className="text-base font-semibold text-ink flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-accent" />
                    <span>Visits Scheduled Today</span>
                    <Badge variant="neutral">{data.visitsToday.length}</Badge>
                  </h2>
                </div>

                {data.visitsToday.length === 0 ? (
                  <EmptyState
                    icon={<Calendar className="w-8 h-8 text-muted" />}
                    title="No Visits Scheduled Today"
                    description="There are no property visits booked for today. Check upcoming calendar slots in Site Visits."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.visitsToday.map((v) => (
                      <Card key={v.bookingId} className="p-4 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink text-sm">{v.leadName}</span>
                            <Badge variant={v.status === 'confirmed' ? 'success' : 'neutral'}>
                              {v.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted space-y-1">
                            <div>Project: <strong className="text-ink font-medium">{v.projectName}</strong></div>
                            <div className="flex items-center gap-1.5 font-mono">
                              <Clock className="w-3.5 h-3.5 text-accent" />
                              <span>{formatInKolkataTime(v.startsAt)}</span>
                            </div>
                            {v.leadPhone && (
                              <div className="flex items-center gap-1.5 font-mono">
                                <Phone className="w-3.5 h-3.5 text-accent" />
                                <span>{v.leadPhone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end pt-2 border-t border-hairline">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedLeadId(v.leadId)}
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                          >
                            View Lead Details
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section 2: Awaiting Attendance Outcome */}
            {(activeTab === 'all' || activeTab === 'awaiting') && (
              <section className="space-y-3" aria-labelledby="awaiting-outcome-heading">
                <div className="flex items-center justify-between">
                  <h2 id="awaiting-outcome-heading" className="text-base font-semibold text-ink flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warning" />
                    <span>Visits Awaiting Attendance Outcome</span>
                    <Badge variant={data.awaitingOutcome.length > 0 ? 'warning' : 'neutral'}>
                      {data.awaitingOutcome.length}
                    </Badge>
                  </h2>
                </div>

                {data.awaitingOutcome.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-success" />}
                    title="All Past Visits Recorded"
                    description="Zero visits pending attendance outcome. Great job keeping the show-up funnel accurate!"
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.awaitingOutcome.map((v) => (
                      <Card key={v.bookingId} className="p-4 border-warning/40 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink text-sm">{v.leadName}</span>
                            <Badge variant="warning">Awaiting Outcome</Badge>
                          </div>
                          <div className="text-xs text-muted space-y-1">
                            <div>Project: <strong className="text-ink font-medium">{v.projectName}</strong></div>
                            <div className="font-mono text-xs">
                              Scheduled: {formatInKolkataTime(v.startsAt)}
                            </div>
                            {v.leadPhone && (
                              <div className="font-mono text-xs">{v.leadPhone}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline flex-wrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLeadId(v.leadId)}
                          >
                            View Lead
                          </Button>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                outcomeMutation.mutate({
                                  bookingId: v.bookingId,
                                  outcome: 'no_show',
                                })
                              }
                              isLoading={
                                outcomeMutation.isPending &&
                                outcomeMutation.variables?.bookingId === v.bookingId &&
                                outcomeMutation.variables?.outcome === 'no_show'
                              }
                              leftIcon={<XCircle className="w-3.5 h-3.5 text-danger" />}
                            >
                              No-Show
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                outcomeMutation.mutate({
                                  bookingId: v.bookingId,
                                  outcome: 'visited',
                                })
                              }
                              isLoading={
                                outcomeMutation.isPending &&
                                outcomeMutation.variables?.bookingId === v.bookingId &&
                                outcomeMutation.variables?.outcome === 'visited'
                              }
                              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                            >
                              Mark Visited
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section 3: New Sales Handoffs */}
            {(activeTab === 'all' || activeTab === 'handoffs') && (
              <section className="space-y-3" aria-labelledby="new-handoffs-heading">
                <div className="flex items-center justify-between">
                  <h2 id="new-handoffs-heading" className="text-base font-semibold text-ink flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-accent" />
                    <span>New Sales Handoffs</span>
                    <Badge variant={data.newHandoffs.length > 0 ? 'accent' : 'neutral'}>
                      {data.newHandoffs.length}
                    </Badge>
                  </h2>
                </div>

                {data.newHandoffs.length === 0 ? (
                  <EmptyState
                    icon={<UserCheck className="w-8 h-8 text-muted" />}
                    title="No Pending Handoffs"
                    description="All AI conversation handoffs have been accepted and addressed."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.newHandoffs.map((h) => (
                      <Card key={h.handoffId} className="p-4 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink text-sm">{h.leadName}</span>
                            <Badge variant={h.priority === 'urgent' ? 'danger' : 'warning'}>
                              {h.priority || 'normal'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted leading-relaxed">
                            Reason: <strong className="text-ink font-medium">{h.reason}</strong>
                          </p>
                          <div className="text-[11px] text-muted font-mono">
                            Received: {formatInKolkataTime(h.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLeadId(h.leadId)}
                          >
                            View Lead
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => acceptHandoffMutation.mutate(h.handoffId)}
                            isLoading={
                              acceptHandoffMutation.isPending &&
                              acceptHandoffMutation.variables === h.handoffId
                            }
                            leftIcon={<UserCheck className="w-3.5 h-3.5" />}
                          >
                            Accept Handoff
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section 4: Leads Unanswered for >2 Hours */}
            {(activeTab === 'all' || activeTab === 'unanswered') && (
              <section className="space-y-3" aria-labelledby="unanswered-leads-heading">
                <div className="flex items-center justify-between">
                  <h2 id="unanswered-leads-heading" className="text-base font-semibold text-ink flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-danger" />
                    <span>Leads Unanswered for &gt;2 Hours</span>
                    <Badge variant={data.unansweredLeads.length > 0 ? 'danger' : 'neutral'}>
                      {data.unansweredLeads.length}
                    </Badge>
                  </h2>
                </div>

                {data.unansweredLeads.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-success" />}
                    title="Zero Lead Response SLA Breaches"
                    description="All contactable incoming inquiries have received a substantive response within 2 hours."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.unansweredLeads.map((l) => (
                      <Card key={l.leadId} className="p-4 border-danger/30 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-ink text-sm block">{l.name}</span>
                              <span className="font-mono text-xs text-muted">{l.publicId}</span>
                            </div>
                            <Badge variant="danger">
                              {l.hoursElapsed}h elapsed
                            </Badge>
                          </div>
                          <div className="text-xs text-muted space-y-1">
                            <div>Source: <span className="text-ink font-medium capitalize">{l.source.replace('_', ' ')}</span></div>
                            <div>Project: <span className="text-ink font-medium">{l.projectName || 'Unassigned'}</span></div>
                            <div className="font-mono text-xs">{l.phoneE164 || 'No phone recorded'}</div>
                          </div>
                        </div>
                        <div className="flex justify-end pt-2 border-t border-hairline">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setSelectedLeadId(l.leadId)}
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                          >
                            Open Lead Drawer
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Lead Detail Drawer */}
      <LeadDetailDrawer
        leadId={selectedLeadId}
        isOpen={Boolean(selectedLeadId)}
        onClose={() => setSelectedLeadId(null)}
        onLeadUpdated={() => refetch()}
      />
    </StaffLayout>
  );
};
