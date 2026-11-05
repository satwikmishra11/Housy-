import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { Badge } from './Badge.js';
import { Skeleton } from './Skeleton.js';
import { Tabs } from './Tabs.js';
import { Input } from './Input.js';
import { useToast } from './Toast.js';
import {
  fetchLeadDetails,
  mergeLeads,
  keepSeparateLead,
} from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import {
  User,
  Phone,
  Mail,
  Home,
  Clock,
  AlertTriangle,
  GitMerge,
  MessageSquare,
  Calendar,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  XCircle,
} from 'lucide-react';
import type { LeadDetail } from '@housy/shared';

export interface LeadDetailDrawerProps {
  leadId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

export const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  leadId,
  isOpen,
  onClose,
  onLeadUpdated,
}) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('timeline');
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [targetLeadId, setTargetLeadId] = useState('');

  const {
    data: lead,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<LeadDetail>({
    queryKey: ['lead', leadId],
    queryFn: () => fetchLeadDetails(leadId!),
    enabled: Boolean(leadId) && isOpen,
  });

  const keepSeparateMutation = useMutation({
    mutationFn: () => keepSeparateLead(leadId!),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Lead Unlinked',
        message: 'This lead has been marked as separate.',
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      onLeadUpdated?.();
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to keep lead separate',
      });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: ({ primaryId, secondaryId }: { primaryId: string; secondaryId: string }) =>
      mergeLeads(primaryId, secondaryId),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Leads Merged',
        message: 'Touchpoints, conversations, and bookings merged successfully.',
      });
      setIsMergeModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onLeadUpdated?.();
      onClose();
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Merge Failed',
        message: err instanceof Error ? err.message : 'Failed to merge leads',
      });
    },
  });

  if (!isOpen) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="xl" title={lead ? `${lead.name} (${lead.publicId})` : 'Lead Details'}>
        {isLoading && (
          <div className="space-y-4 py-4">
            <Skeleton height="60px" />
            <Skeleton height="120px" />
            <Skeleton height="200px" />
          </div>
        )}

        {isError && (
          <div className="text-center py-8 space-y-3">
            <XCircle className="w-8 h-8 text-danger mx-auto" />
            <p className="text-sm font-medium text-danger">
              {error instanceof Error ? error.message : 'Failed to load lead details'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        )}

        {lead && (
          <div className="space-y-6">
            {/* 1. Duplicate Warning Banner */}
            {lead.possibleDuplicateOf && (
              <div className="bg-warning-soft border border-warning/30 rounded-token p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-ink-base">
                      Possible Duplicate Detected
                    </h4>
                    <p className="text-xs text-ink-muted">
                      Similar name found on this project ({lead.possibleDuplicateName || lead.possibleDuplicateOf}).
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => keepSeparateMutation.mutate()}
                    isLoading={keepSeparateMutation.isPending}
                  >
                    Keep Separate
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<GitMerge className="w-3.5 h-3.5" />}
                    onClick={() =>
                      mergeMutation.mutate({
                        primaryId: lead.possibleDuplicateOf!,
                        secondaryId: lead.id,
                      })
                    }
                    isLoading={mergeMutation.isPending}
                  >
                    Merge
                  </Button>
                </div>
              </div>
            )}

            {/* 2. Lead Profile Card */}
            <div className="bg-surface-alt border border-hairline rounded-token p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-muted">{lead.publicId}</span>
                  <Badge variant={lead.status === 'visit_booked' ? 'success' : 'neutral'} size="sm">
                    {lead.status.replace('_', ' ')}
                  </Badge>
                  {lead.consentStatus === 'withdrawn' && (
                    <Badge variant="danger" size="sm">
                      <ShieldAlert className="w-3 h-3 mr-1 inline" /> Cannot Contact
                    </Badge>
                  )}
                </div>
                <h3 className="font-serif text-xl font-bold text-ink-base">{lead.name}</h3>
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <Home className="w-3.5 h-3.5 text-accent" />
                  <span>{lead.projectName || 'Unassigned Project'} ({lead.wants})</span>
                </div>
              </div>

              <div className="space-y-1 text-xs text-ink-muted">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-accent" />
                  <span className="font-mono text-ink-base">{lead.phoneE164 || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-accent" />
                  <span className="text-ink-base">{lead.email || 'No email'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-accent" />
                  <span>Assigned: {lead.assignedToName || 'Unassigned'}</span>
                </div>
              </div>

              <div className="space-y-1 text-xs text-ink-muted border-t md:border-t-0 md:border-l border-hairline pt-3 md:pt-0 md:pl-4">
                <div>Source: <span className="text-ink-base font-medium">{lead.source}</span></div>
                <div>First Touch: <span className="text-ink-base">{formatInKolkataTime(lead.firstTouchAt)}</span></div>
                <div>Last Active: <span className="text-ink-base">{formatInKolkataTime(lead.lastActivityAt)}</span></div>
                <div>Touchpoints: <span className="text-ink-base font-semibold">{lead.touchpointsCount}</span></div>
              </div>
            </div>

            {/* 3. Detail Tabs */}
            <Tabs
              activeTab={activeTab}
              onChange={setActiveTab}
              tabs={[
                {
                  id: 'timeline',
                  label: `Touchpoints (${lead.touchpoints.length})`,
                  content: (
                    <div className="space-y-3 pt-3">
                      {lead.touchpoints.length === 0 ? (
                        <p className="text-xs text-ink-muted">No touchpoints recorded.</p>
                      ) : (
                        <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-hairline">
                          {lead.touchpoints.map((tp) => (
                            <div key={tp.id} className="relative text-xs space-y-1">
                              <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-surface" />
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-ink-base capitalize">
                                  {tp.source.replace('_', ' ')}
                                </span>
                                <Badge variant="neutral" size="sm">
                                  {tp.channel}
                                </Badge>
                                <span className="text-ink-muted font-mono text-[11px]">
                                  {formatInKolkataTime(tp.occurredAt)}
                                </span>
                              </div>
                              {tp.externalId && (
                                <p className="text-ink-muted font-mono text-[11px]">
                                  External ID: {tp.externalId}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  id: 'conversations',
                  label: `Conversations (${lead.conversations.length})`,
                  content: (
                    <div className="space-y-3 pt-3">
                      {lead.conversations.length === 0 ? (
                        <p className="text-xs text-ink-muted">No chat conversations recorded.</p>
                      ) : (
                        lead.conversations.map((c) => (
                          <div
                            key={c.id}
                            className="p-3 bg-surface-alt border border-hairline rounded-token space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-accent" />
                                <span className="font-medium text-ink-base">
                                  {c.status === 'ai' ? 'AI Sales Assistant' : 'Human Sales Exec'}
                                </span>
                                <Badge variant={c.flagged ? 'warning' : 'neutral'} size="sm">
                                  {c.language.toUpperCase()}
                                </Badge>
                              </div>
                              <span className="text-ink-muted">
                                {formatInKolkataTime(c.createdAt)}
                              </span>
                            </div>
                            <div className="text-ink-muted">
                              {c.messagesCount} messages exchanged.
                              {c.flagged && (
                                <span className="text-warning ml-2 font-medium">
                                  Flagged for Sales Head review ({c.flagReasons.join(', ')})
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ),
                },
                {
                  id: 'visits',
                  label: `Site Visits (${lead.bookings.length})`,
                  content: (
                    <div className="space-y-3 pt-3">
                      {lead.bookings.length === 0 ? (
                        <p className="text-xs text-ink-muted">No site visit booked yet.</p>
                      ) : (
                        lead.bookings.map((b) => (
                          <div
                            key={b.id}
                            className="p-3 bg-surface-alt border border-hairline rounded-token flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <Calendar className="w-4 h-4 text-accent" />
                              <div>
                                <span className="font-semibold text-ink-base block">
                                  {b.projectName}
                                </span>
                                <span className="text-ink-muted">
                                  {formatInKolkataTime(b.startsAt)} ({b.executiveName})
                                </span>
                              </div>
                            </div>
                            <Badge variant={b.status === 'confirmed' ? 'success' : 'neutral'}>
                              {b.status}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  ),
                },
                {
                  id: 'handoffs',
                  label: `Handoffs (${lead.handoffs.length})`,
                  content: (
                    <div className="space-y-3 pt-3">
                      {lead.handoffs.length === 0 ? (
                        <p className="text-xs text-ink-muted">No executive handoffs recorded.</p>
                      ) : (
                        lead.handoffs.map((h) => (
                          <div
                            key={h.id}
                            className="p-3 bg-surface-alt border border-hairline rounded-token space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-ink-base">
                                Handed off to {h.executiveName}
                              </span>
                              <Badge variant="warning" size="sm">
                                {h.status}
                              </Badge>
                            </div>
                            <p className="text-ink-muted">Reason: {h.reason}</p>
                            <span className="text-ink-muted text-[11px] block">
                              {formatInKolkataTime(h.createdAt)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  ),
                },
              ]}
            />

            {/* 4. Action bar */}
            <div className="flex justify-between items-center pt-4 border-t border-hairline">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<GitMerge className="w-4 h-4" />}
                onClick={() => setIsMergeModalOpen(true)}
              >
                Merge with Another Lead...
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Manual Merge Dialog */}
      <Modal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        title="Merge Lead Record"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Merge all touchpoints, conversations, and bookings from this lead into another lead record.
            This action cannot be undone.
          </p>
          <Input
            label="Target Lead ID (Primary Lead UUID)"
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            value={targetLeadId}
            onChange={(e) => setTargetLeadId(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
            <Button variant="ghost" onClick={() => setIsMergeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!targetLeadId.trim()}
              onClick={() =>
                mergeMutation.mutate({
                  primaryId: targetLeadId.trim(),
                  secondaryId: leadId!,
                })
              }
              isLoading={mergeMutation.isPending}
            >
              Confirm Merge
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
