import React, { useState, useMemo } from 'react';
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
  takeOverChat,
  handBackToAssistant,
  sendStaffMessage,
  updateLeadStatus,
  createLeadNote,
} from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import {
  Phone,
  Mail,
  Home,
  AlertTriangle,
  GitMerge,
  MessageSquare,
  Calendar,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Bot,
  Send,
  Sparkles,
  FileText,
} from 'lucide-react';
import type { LeadDetail, LeadStatus } from '@housy/shared';

export interface LeadDetailDrawerProps {
  leadId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

interface NextBestAction {
  title: string;
  description: string;
  tag: string;
  variant: 'accent' | 'warning' | 'danger' | 'success' | 'neutral';
}

function computeNextBestAction(lead: LeadDetail): NextBestAction {
  if (lead.consentStatus === 'withdrawn') {
    return {
      title: 'Do Not Contact (DPDP Withdrawn)',
      description: 'The buyer exercised their DPDP right to opt out. Automated reminders are cancelled. Do not reach out unless consent is re-granted.',
      tag: 'Compliance',
      variant: 'danger',
    };
  }
  if (lead.possibleDuplicateOf) {
    return {
      title: 'Resolve Possible Duplicate',
      description: `Potential duplicate record detected (${lead.possibleDuplicateName || lead.possibleDuplicateOf}). Merge or mark as separate to unify touchpoint history.`,
      tag: 'Data Quality',
      variant: 'warning',
    };
  }
  if (lead.status === 'new') {
    return {
      title: 'Reach Out via Phone / WhatsApp',
      description: `New ${lead.wants} inquiry from ${lead.source.replace('_', ' ')}. Introduce Aaranya Realty and understand specific floor/direction preferences within 15-min SLA.`,
      tag: 'SLA Priority',
      variant: 'warning',
    };
  }
  if (lead.status === 'engaged' && lead.bookings.length === 0) {
    return {
      title: 'Propose Weekend Site Visit',
      description: `Buyer is engaged for ${lead.projectName || 'project'}. Share available Saturday/Sunday afternoon slots to convert interest to an in-person visit.`,
      tag: 'Next Step',
      variant: 'accent',
    };
  }
  if (lead.status === 'visit_booked') {
    return {
      title: 'Send Directions & Gate Pass',
      description: 'Site visit booked. Send Google Maps location, clubhouse entry code, and ensure dedicated sales executive is available on site.',
      tag: 'Site Visit',
      variant: 'success',
    };
  }
  if (lead.status === 'visited') {
    return {
      title: 'Send Pricing Breakdown & Proposal',
      description: 'Site visit completed. Follow up with unit floor plans, construction-linked payment schedule (CLP), and limited-period developer unit reservation.',
      tag: 'Closing',
      variant: 'accent',
    };
  }
  if (lead.status === 'no_show') {
    return {
      title: 'Reschedule Missed Site Visit',
      description: 'Buyer was unable to attend the scheduled visit. Send polite follow-up message offering flexible reschedule slots.',
      tag: 'Re-engagement',
      variant: 'warning',
    };
  }
  return {
    title: 'Nurture Lead with Project Updates',
    description: 'Keep buyer engaged with construction progress milestones and new tower releases.',
    tag: 'Nurture',
    variant: 'neutral',
  };
}

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'visit_booked', label: 'Visit Booked' },
  { value: 'visited', label: 'Visited' },
  { value: 'no_show', label: 'No-Show' },
  { value: 'lost', label: 'Lost' },
];

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
  const [newNoteText, setNewNoteText] = useState('');

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

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: LeadStatus) => updateLeadStatus(leadId!, newStatus),
    onSuccess: (_, newStatus) => {
      showToast({
        type: 'success',
        title: 'Status Updated',
        message: `Lead status updated to ${newStatus.replace('_', ' ')}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      onLeadUpdated?.();
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Could not update status',
      });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: (text: string) => createLeadNote(leadId!, text),
    onSuccess: () => {
      setNewNoteText('');
      showToast({
        type: 'success',
        title: 'Note Added',
        message: 'Timestamped staff note recorded.',
      });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Add Note',
        message: err.message || 'Could not save note',
      });
    },
  });

  const [drawerReplyMessage, setDrawerReplyMessage] = useState<Record<string, string>>({});

  const takeOverMutation = useMutation({
    mutationFn: (convId: string) => takeOverChat(convId),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Chat Taken Over',
        message: 'AI assistant is now paused for this buyer.',
      });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onLeadUpdated?.();
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Takeover Failed',
        message: err.message || 'Unable to take over chat',
      });
    },
  });

  const handBackMutation = useMutation({
    mutationFn: (convId: string) => handBackToAssistant(convId),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Handed Back to Assistant',
        message: 'AI assistant has resumed for this buyer.',
      });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onLeadUpdated?.();
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Hand Back Failed',
        message: err.message || 'Unable to hand back to assistant',
      });
    },
  });

  const sendStaffMessageMutation = useMutation({
    mutationFn: ({ convId, message }: { convId: string; message: string }) =>
      sendStaffMessage(convId, message),
    onSuccess: (_, vars) => {
      setDrawerReplyMessage((prev) => ({ ...prev, [vars.convId]: '' }));
      showToast({
        type: 'success',
        title: 'Message Sent',
        message: 'Your message has been delivered to the buyer.',
      });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Send Failed',
        message: err.message || 'Unable to send message',
      });
    },
  });

  // Source Timeline compilation
  const timelineEvents = useMemo(() => {
    if (!lead) return [];

    interface TimelineEvent {
      id: string;
      kind: 'ingest' | 'touchpoint' | 'chat' | 'booking' | 'handoff' | 'note';
      title: string;
      subtitle: string;
      timestamp: string;
      badgeText: string;
      badgeVariant: 'neutral' | 'accent' | 'warning' | 'success' | 'danger';
    }

    const events: TimelineEvent[] = [];

    // Ingest event
    events.push({
      id: `ingest-${lead.id}`,
      kind: 'ingest',
      title: `Lead Ingested from ${lead.source.replace('_', ' ').toUpperCase()}`,
      subtitle: `Initial inquiry for ${lead.wants} at ${lead.projectName || 'Unassigned Project'}`,
      timestamp: lead.firstTouchAt,
      badgeText: lead.source,
      badgeVariant: 'accent',
    });

    // Touchpoints
    for (const tp of lead.touchpoints) {
      events.push({
        id: `tp-${tp.id}`,
        kind: 'touchpoint',
        title: `Touchpoint via ${tp.channel.toUpperCase()}`,
        subtitle: `Source: ${tp.source}${tp.externalId ? ` (ID: ${tp.externalId})` : ''}`,
        timestamp: tp.occurredAt,
        badgeText: tp.channel,
        badgeVariant: 'neutral',
      });
    }

    // Conversations
    for (const c of lead.conversations) {
      events.push({
        id: `conv-${c.id}`,
        kind: 'chat',
        title: `AI Chat Session (${c.language.toUpperCase()})`,
        subtitle: `${c.messagesCount} messages exchanged${c.flagged ? ` - Flagged: ${c.flagReasons.join(', ')}` : ''}`,
        timestamp: c.createdAt,
        badgeText: c.status === 'human' ? 'Human Takeover' : 'AI Assistant',
        badgeVariant: c.status === 'human' ? 'warning' : 'neutral',
      });
    }

    // Bookings
    for (const b of lead.bookings) {
      events.push({
        id: `booking-${b.id}`,
        kind: 'booking',
        title: `Site Visit Booked: ${b.projectName}`,
        subtitle: `Assigned Executive: ${b.executiveName} (Slot: ${formatInKolkataTime(b.startsAt)})`,
        timestamp: b.startsAt,
        badgeText: b.status.toUpperCase(),
        badgeVariant: b.status === 'confirmed' || b.status === 'completed' ? 'success' : 'neutral',
      });
    }

    // Handoffs
    for (const h of lead.handoffs) {
      events.push({
        id: `handoff-${h.id}`,
        kind: 'handoff',
        title: `Sales Handoff: ${h.reason}`,
        subtitle: `Assigned to ${h.executiveName}`,
        timestamp: h.createdAt,
        badgeText: h.status.toUpperCase(),
        badgeVariant: 'warning',
      });
    }

    // Staff Notes
    for (const n of lead.notes || []) {
      events.push({
        id: `note-${n.id}`,
        kind: 'note',
        title: `Note by ${n.authorName}`,
        subtitle: n.note,
        timestamp: n.createdAt,
        badgeText: 'Staff Note',
        badgeVariant: 'neutral',
      });
    }

    // Sort descending by timestamp
    return events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [lead]);

  if (!isOpen) return null;

  const nextBestAction = lead ? computeNextBestAction(lead) : null;
  const leadNotes = lead?.notes || [];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="xl"
        title={lead ? `${lead.name} (${lead.publicId})` : 'Lead Details'}
      >
        {isLoading && (
          <div className="space-y-4 py-4" aria-busy="true">
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
                      Similar name found on this project (
                      {lead.possibleDuplicateName || lead.possibleDuplicateOf}).
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

            {/* 2. Next Best Action Card */}
            {nextBestAction && (
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  nextBestAction.variant === 'danger'
                    ? 'bg-danger/10 border-danger/30 text-danger'
                    : nextBestAction.variant === 'warning'
                      ? 'bg-warning/10 border-warning/30 text-ink'
                      : nextBestAction.variant === 'success'
                        ? 'bg-success/10 border-success/30 text-ink'
                        : 'bg-accent/10 border-accent/30 text-ink'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center flex-shrink-0 shadow-sm border border-hairline mt-0.5">
                    <Sparkles className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-ink">{nextBestAction.title}</span>
                      <Badge variant={nextBestAction.variant}>{nextBestAction.tag}</Badge>
                    </div>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                      {nextBestAction.description}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Lead Profile Card with DPDP Consent & Status Dropdown */}
            <div className="bg-surface-alt border border-hairline rounded-token p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-ink-muted">{lead.publicId}</span>

                  {/* DPDP Consent Badge */}
                  {lead.consentStatus === 'granted' ? (
                    <Badge variant="success">
                      <ShieldCheck className="w-3 h-3 mr-1 inline" /> DPDP Consented
                    </Badge>
                  ) : lead.consentStatus === 'withdrawn' ? (
                    <Badge variant="danger">
                      <ShieldAlert className="w-3 h-3 mr-1 inline" /> Opted Out
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <ShieldAlert className="w-3 h-3 mr-1 inline" /> Consent Pending
                    </Badge>
                  )}
                </div>

                <h3 className="font-serif text-xl font-bold text-ink-base">{lead.name}</h3>
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <Home className="w-3.5 h-3.5 text-accent" />
                  <span>
                    {lead.projectName || 'Unassigned Project'} ({lead.wants})
                  </span>
                </div>

                {/* Status Changer */}
                <div className="pt-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-ink-muted">Status:</span>
                  <select
                    value={lead.status}
                    onChange={(e) => updateStatusMutation.mutate(e.target.value as LeadStatus)}
                    disabled={updateStatusMutation.isPending}
                    aria-label="Lead Status"
                    className="text-xs font-semibold px-2 py-1 rounded bg-surface border border-hairline text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
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
                <div>
                  Source: <span className="text-ink-base font-medium">{lead.source}</span>
                </div>
                <div>
                  First Touch:{' '}
                  <span className="text-ink-base">{formatInKolkataTime(lead.firstTouchAt)}</span>
                </div>
                <div>
                  Last Active:{' '}
                  <span className="text-ink-base">{formatInKolkataTime(lead.lastActivityAt)}</span>
                </div>
                <div>
                  Touchpoints:{' '}
                  <span className="text-ink-base font-semibold">{lead.touchpointsCount}</span>
                </div>
              </div>
            </div>

            {/* 4. Detail Tabs */}
            <Tabs
              activeTab={activeTab}
              onChange={setActiveTab}
              tabs={[
                { id: 'timeline', label: `Source Timeline (${timelineEvents.length})` },
                { id: 'notes', label: `Staff Notes (${leadNotes.length})` },
                { id: 'conversations', label: `Conversations (${lead.conversations.length})` },
                { id: 'visits', label: `Site Visits (${lead.bookings.length})` },
                { id: 'handoffs', label: `Handoffs (${lead.handoffs.length})` },
              ]}
            />

            {/* 5. Source Timeline Tab */}
            {activeTab === 'timeline' && (
              <div className="space-y-3 pt-3">
                {timelineEvents.length === 0 ? (
                  <p className="text-xs text-ink-muted">No timeline events recorded.</p>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-hairline">
                    {timelineEvents.map((ev) => (
                      <div key={ev.id} className="relative text-xs space-y-1">
                        <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-surface" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-ink-base">{ev.title}</span>
                          <Badge variant={ev.badgeVariant}>{ev.badgeText}</Badge>
                          <span className="text-ink-muted font-mono text-[11px]">
                            {formatInKolkataTime(ev.timestamp)}
                          </span>
                        </div>
                        <p className="text-ink-muted text-xs leading-relaxed">{ev.subtitle}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 6. Timestamped Notes Tab */}
            {activeTab === 'notes' && (
              <div className="space-y-4 pt-3">
                {/* Note input form */}
                <div className="p-3 bg-surface border border-hairline rounded-token space-y-2">
                  <label htmlFor="lead-note-textarea" className="text-xs font-medium text-ink-base block">Add Executive Note</label>
                  <textarea
                    id="lead-note-textarea"
                    rows={2}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Record notes on buyer preferences, family requirements, or next follow-up date..."
                    className="w-full px-3 py-2 text-xs bg-background border border-hairline rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (newNoteText.trim()) {
                          addNoteMutation.mutate(newNoteText.trim());
                        }
                      }}
                      disabled={!newNoteText.trim() || addNoteMutation.isPending}
                      isLoading={addNoteMutation.isPending}
                      leftIcon={<FileText className="w-3.5 h-3.5" />}
                    >
                      Save Note
                    </Button>
                  </div>
                </div>

                {/* Notes History */}
                {leadNotes.length === 0 ? (
                  <p className="text-xs text-ink-muted text-center py-4">
                    No notes recorded yet. Add call notes or visit observations above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {leadNotes.map((n) => (
                      <div
                        key={n.id}
                        className="p-3 bg-surface-alt border border-hairline rounded-token space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-ink-base">
                            <UserCheck className="w-3.5 h-3.5 text-accent" />
                            <span>{n.authorName}</span>
                          </div>
                          <span className="text-ink-muted font-mono text-[11px]">
                            {formatInKolkataTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-ink-base text-xs leading-relaxed pt-1">{n.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 7. Conversations Tab */}
            {activeTab === 'conversations' && (
              <div className="space-y-3 pt-3">
                {lead.conversations.length === 0 ? (
                  <p className="text-xs text-ink-muted">No chat conversations recorded.</p>
                ) : (
                  lead.conversations.map((c) => {
                    const isHumanMode = c.status === 'human';
                    const currentReply = drawerReplyMessage[c.id] || '';

                    return (
                      <div
                        key={c.id}
                        className="p-3 bg-surface-alt border border-hairline rounded-token space-y-3 text-xs"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-accent" />
                            <span className="font-medium text-ink-base">
                              {isHumanMode ? 'Human Sales Executive (Live)' : 'AI Sales Assistant'}
                            </span>
                            <Badge
                              variant={
                                isHumanMode ? 'warning' : c.flagged ? 'warning' : 'neutral'
                              }
                            >
                              {isHumanMode ? 'Live Takeover' : c.language.toUpperCase()}
                            </Badge>
                          </div>
                          <span className="text-ink-muted">
                            {formatInKolkataTime(c.createdAt)}
                          </span>
                        </div>
                        <div className="text-ink-muted flex items-center justify-between flex-wrap gap-2">
                          <span>
                            {c.messagesCount} messages exchanged.
                            {c.flagged && (
                              <span className="text-warning ml-2 font-medium">
                                Flagged ({c.flagReasons.join(', ')})
                              </span>
                            )}
                          </span>
                          <div>
                            {isHumanMode ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handBackMutation.mutate(c.id)}
                                isLoading={
                                  handBackMutation.isPending &&
                                  handBackMutation.variables === c.id
                                }
                                leftIcon={<Bot className="w-3.5 h-3.5 text-accent" />}
                              >
                                Hand Back to Assistant
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => takeOverMutation.mutate(c.id)}
                                isLoading={
                                  takeOverMutation.isPending &&
                                  takeOverMutation.variables === c.id
                                }
                                leftIcon={<UserCheck className="w-3.5 h-3.5" />}
                              >
                                Take Over Chat
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* If in human mode, executive can send a message directly from drawer */}
                        {isHumanMode && (
                          <div className="pt-2 border-t border-hairline flex items-center gap-2">
                            <input
                              type="text"
                              value={currentReply}
                              onChange={(e) =>
                                setDrawerReplyMessage((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                              placeholder="Type message to buyer..."
                              className="flex-1 px-3 py-1.5 text-xs bg-background border border-hairline rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                if (currentReply.trim()) {
                                  sendStaffMessageMutation.mutate({
                                    convId: c.id,
                                    message: currentReply.trim(),
                                  });
                                }
                              }}
                              disabled={!currentReply.trim() || sendStaffMessageMutation.isPending}
                              isLoading={sendStaffMessageMutation.isPending}
                              leftIcon={<Send className="w-3.5 h-3.5" />}
                            >
                              Send
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* 8. Visits Tab */}
            {activeTab === 'visits' && (
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
            )}

            {/* 9. Handoffs Tab */}
            {activeTab === 'handoffs' && (
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
                        <Badge variant="warning">{h.status}</Badge>
                      </div>
                      <p className="text-ink-muted">Reason: {h.reason}</p>
                      <span className="text-ink-muted text-[11px] block">
                        {formatInKolkataTime(h.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 10. Action bar */}
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
        maxWidth="md"
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
